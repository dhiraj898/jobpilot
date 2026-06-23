import { Router, Response } from 'express'
import multer from 'multer'
// eslint-disable-next-line @typescript-eslint/no-var-requires
const pdfParse: (buf: Buffer) => Promise<{ text: string }> = require('pdf-parse')
// eslint-disable-next-line @typescript-eslint/no-var-requires
const mammoth: { extractRawText: (opts: { buffer: Buffer }) => Promise<{ value: string }> } = require('mammoth')
// eslint-disable-next-line @typescript-eslint/no-var-requires
const JSZip = require('jszip')
import { DOMParser, XMLSerializer } from '@xmldom/xmldom'
import { requireAuth, AuthRequest } from '../middleware/auth'
import { getDecryptedKey } from './profile'
import { db } from '../lib/db'
import { callAI, SARVAM_URL } from '../services/aiProxy'
import { Document, Packer, Paragraph, TextRun, AlignmentType, TabStopType, TabStopPosition, BorderStyle, LevelFormat, UnderlineType } from 'docx'
import {
  segmentResume, reconstructResume, extractJSON,
  ResumePayload, MatchScoreResult
} from '../services/resumeSegmenter'

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } })

const router = Router()
router.use(requireAuth)

async function getAiCreds(userId: string, res: Response) {
  const creds = await getDecryptedKey(userId)
  if (!creds || !creds.key) {
    res.status(400).json({ success: false, error: 'No AI API key configured. Add it in Settings.' })
    return null
  }
  return creds
}

// sarvam-105b must be used for all JSON-output tasks.
// sarvam-30b is a reasoning model that outputs chain-of-thought, not clean JSON.
function jsonModel(_creds: { provider: string; model: string }): string {
  return 'sarvam-105b'
}

// ── Shared scoring prompt (used before and after tailoring) ──────────────────
const SCORE_SYSTEM_PROMPT = `You are a resume-to-job-description matching expert. Your job is to score how well a resume aligns with a job description and identify exactly which keywords and concepts are present or missing.

Scoring methodology:
- Skills alignment (30% of score): how well the candidate's technical skills, tools, and domain expertise match what the JD asks for
- Experience alignment (50% of score): how well the bullet points across all roles surface the right impact, scope, and responsibilities relative to the JD
- Summary alignment (20% of score): how well the summary/objective positions the candidate for this specific role

Be precise and consistent. The same resume against the same JD must always return the same score.

Keyword extraction rules:
- Extract keywords as the JD actually states them (e.g. "stakeholder management", not "managing stakeholders")
- Include both hard skills (tools, technologies, methodologies) and soft skills that the JD explicitly emphasises
- "Missing" means genuinely absent — do not mark a keyword missing if a reasonable synonym is present
- topMissingForSummary: the 3–5 missing keywords most important for the opening summary/objective
- topMissingForBullets: the 5–8 missing keywords most useful to surface across experience bullet points

Return ONLY valid JSON. No markdown fences, no commentary, no explanation. Exact shape:
{
  "score": number,
  "matchedKeywords": string[],
  "missingKeywords": string[],
  "topMissingForSummary": string[],
  "topMissingForBullets": string[],
  "breakdown": {
    "skillsMatch": number,
    "expMatch": number,
    "summaryMatch": number
  },
  "summary": string
}`

const TAILOR_SYSTEM_PROMPT = `You are a professional resume editor. You rewrite resumes to maximise alignment with a specific job description, without inventing experience or changing any factual details.

You will receive:
1. A job description for the target role
2. A resume as a structured JSON object
3. A list of priority keywords to weave in (extracted from the JD)

Your task is to surgically rewrite the mutable parts of the resume — the summary and the bullet points under each role — so that the resume reads as if it was written for this specific role, using this candidate's real background.

WHAT YOU MAY CHANGE:
1. "summary" — Rewrite this entirely for the target role. Use language from the JD. Position the candidate as the natural fit for this role based on their actual background. Lead with what is most relevant to this JD. The summary should feel freshly written for this role, not like a generic statement with keywords inserted.

2. "bullets" arrays — Rephrase each bullet to surface the most JD-relevant framing of that experience. Rules:
   - Same number of bullets per role. Do not add, remove, merge, or split bullets.
   - Preserve every quantified metric verbatim (30%, $2M, 200k users, 6 weeks — do not alter numbers).
   - Use strong action verbs that align with the JD's language (e.g. if the JD says "drive growth", prefer "drove" over "managed").
   - Weave in missing keywords naturally — never force a keyword where it does not fit the actual experience.
   - Earlier roles (older jobs) should be rephrased more lightly. Recent roles should receive the most attention.
   - Do not invent tools, technologies, methodologies, or achievements not already in the bullet.

WHAT YOU MUST NOT CHANGE:
- "title", "company", "dates" in any experience entry — return these exactly as received
- "locked" object and all its contents — return the entire locked object unchanged
- JSON structure — same keys, same nesting, same array lengths, same number of experience entries
- Any number or metric, even if rephrasing around it

TONE AND STYLE:
- Write in first-person implied (no "I") — the standard resume voice
- Concise and specific — every word earns its place
- Avoid filler phrases: "responsible for", "helped with", "worked on", "assisted in", "various"
- Prefer specific, active constructions: "Led", "Built", "Reduced", "Launched", "Negotiated"
- The tailored resume must read as a coherent document — not a collection of keyword-stuffed lines

STRUCTURAL CONSTRAINT (most important):
Return your answer as the SAME JSON structure you received.
Do not change any key names, add new keys, or remove keys.
Only the values of "summary" and each item in "bullets" arrays may differ.
Return ONLY valid JSON. No markdown fences. No commentary. No preamble.`

interface TailorChainInput {
  creds: { key: string; provider: string; model: string }
  resumePayload?: ResumePayload | null
  resumeText?: string | null
  jobDescription: string
  jobTitle: string
  company: string
  previousTailoredPayload?: ResumePayload | null
}

const SEGMENT_SYSTEM_PROMPT = `You are parsing a resume document into a structured JSON format for a resume tailoring system.

Your output will be used directly as a data structure. It must be complete, accurate, and precisely shaped.

Parsing rules:
- summary: extract the professional summary, objective, or "about" paragraph. If none exists, synthesise a 2–3 sentence neutral summary from the candidate's most recent role and skills. Never leave this empty.
- experience: one entry per role. Order from most recent to oldest (same as the resume).
  - title: job title exactly as written
  - company: company name only — do NOT include location, city, or country in this field
  - dates: date range exactly as written (e.g. "Jan 2021 – Mar 2023" or "2020–present")
  - bullets: array of responsibility/achievement strings, one per bullet point. Strip leading bullet characters. Never return an empty array — if no bullets exist, extract the role description as a single-item array.
- locked.skills: flat array of individual skill/tool names. Split comma-separated lists.
- locked.education: all education entries concatenated into one string.
- locked.contact: candidate name, email, phone as a single string.

Return ONLY valid JSON. No markdown fences, no commentary.
Exact shape:
{"summary":string,"experience":[{"title":string,"company":string,"dates":string,"bullets":string[]}],"locked":{"skills":string[],"education":string,"contact":string}}`

async function aiSegmentResume(creds: { key: string; provider: string; model: string }, resumeText: string): Promise<ResumePayload> {
  const raw = await callAI({
    apiKey: creds.key, providerUrl: creds.provider, model: jsonModel(creds),
    systemPrompt: SEGMENT_SYSTEM_PROMPT,
    userMessage: `Parse this resume into the required JSON structure:\n\n${resumeText.slice(0, 8000)}`,
    maxTokens: 2000, temperature: 0.1,
  })
  return JSON.parse(extractJSON(raw)) as ResumePayload
}

async function runTailorChain(input: TailorChainInput) {
  const { creds, jobDescription, jobTitle, company, previousTailoredPayload } = input

  // Use AI segmentation for raw text — heuristic parser is too fragile for varied resume formats
  let basePayload: ResumePayload
  if (input.resumePayload) {
    basePayload = input.resumePayload
  } else {
    try {
      basePayload = await aiSegmentResume(creds, input.resumeText || '')
    } catch (e) {
      console.error('[runTailorChain] AI segmentation failed, falling back to heuristic:', e)
      basePayload = segmentResume(input.resumeText || '')
      // Guard: heuristic fallback produces 0 experience entries on unrecognised resume formats.
      // Continuing with an empty experience array would silently produce a garbage tailored resume.
      // Throw here so the caller receives a clear 502 rather than an empty output.
      if (basePayload.experience.length === 0) {
        throw new Error('Resume segmentation produced no experience entries — please re-upload your resume in a standard PDF or .docx format')
      }
    }
  }
  const baseResumeText = reconstructResume(basePayload)
  console.log(`[runTailorChain] segmented ${basePayload.experience.length} roles, bullets: ${basePayload.experience.map(e => e.bullets.length).join(',')}`)

  // Step 1: score before
  let scoreBefore: MatchScoreResult
  try {
    scoreBefore = await scoreResume(creds, baseResumeText, jobDescription, jobTitle || 'Not specified', company || 'Not specified')
    console.log(`[runTailorChain] scoreBefore=${scoreBefore.score}`)
  } catch (e) {
    console.error('[runTailorChain] scoreBefore failed:', e)
    scoreBefore = {
      score: 0, matchedKeywords: [], missingKeywords: [],
      topMissingForSummary: [], topMissingForBullets: [],
      breakdown: { skillsMatch: 0, expMatch: 0, summaryMatch: 0 },
      summary: 'Score unavailable'
    }
  }

  // Step 2: tailor
  const history = previousTailoredPayload ? [
    { role: 'user' as const, content: `For context: here is a version of this resume I tailored for a different role. Use it only to understand the candidate's voice and writing style. Do NOT copy its content into the new tailoring — the JD and role are different.\n\nPREVIOUS TAILORED VERSION:\n${JSON.stringify(previousTailoredPayload, null, 2)}` },
    { role: 'assistant' as const, content: "Understood. I will use that only as a style reference for the candidate's voice, and tailor fresh for the new role and JD." }
  ] : []

  const tailorUserMessage = `TARGET ROLE: ${jobTitle || 'Not specified'} at ${company || 'Not specified'}

JOB DESCRIPTION:
${jobDescription}

PRIORITY KEYWORDS TO WEAVE IN:
Summary keywords (use in the summary): ${scoreBefore.topMissingForSummary.join(', ') || 'none identified'}
Bullet keywords (distribute across bullet points): ${scoreBefore.topMissingForBullets.join(', ') || 'none identified'}

BASE RESUME (JSON — only "summary" and "bullets" values may change):
${JSON.stringify(basePayload, null, 2)}

Tailor the resume for this role. Return the same JSON structure.`

  const tailoredRaw = await callAI({
    apiKey: creds.key, providerUrl: creds.provider, model: jsonModel(creds),
    systemPrompt: TAILOR_SYSTEM_PROMPT, userMessage: tailorUserMessage,
    history, maxTokens: 6000, temperature: 0.3,
  })

  const tailored = JSON.parse(extractJSON(tailoredRaw)) as ResumePayload

  // If AI returned wrong number of experience entries, fall back to base structure
  if (!tailored.experience || tailored.experience.length !== basePayload.experience.length) {
    tailored.experience = basePayload.experience.map(e => ({ ...e }))
  }

  // Repair bullet count mismatches rather than rejecting:
  // - too many bullets: truncate to original count
  // - too few bullets: pad with original bullets for the missing slots
  for (let i = 0; i < basePayload.experience.length; i++) {
    if (!tailored.experience[i]) tailored.experience[i] = { ...basePayload.experience[i] }
    const expected = basePayload.experience[i].bullets.length
    const got = tailored.experience[i].bullets?.length ?? 0
    if (got > expected) {
      tailored.experience[i].bullets = tailored.experience[i].bullets.slice(0, expected)
    } else if (got < expected) {
      const padding = basePayload.experience[i].bullets.slice(got)
      tailored.experience[i].bullets = [...tailored.experience[i].bullets, ...padding]
    }
  }

  // Hard-enforce locked fields regardless of AI output
  tailored.locked = basePayload.locked
  for (let i = 0; i < basePayload.experience.length; i++) {
    tailored.experience[i].title = basePayload.experience[i].title
    tailored.experience[i].company = basePayload.experience[i].company
    tailored.experience[i].dates = basePayload.experience[i].dates
  }

  const changeLog: string[] = []
  if (tailored.summary !== basePayload.summary) changeLog.push('Summary rewritten for this role')
  for (let i = 0; i < basePayload.experience.length; i++) {
    const changed = tailored.experience[i].bullets.filter((b, j) => b !== basePayload.experience[i].bullets[j]).length
    if (changed > 0) changeLog.push(`${changed} bullet${changed > 1 ? 's' : ''} rephrased in "${tailored.experience[i].title} at ${tailored.experience[i].company}"`)
  }
  if (changeLog.length === 0) changeLog.push('No changes needed — resume already well-aligned')

  // Step 3: score after
  const tailoredText = reconstructResume(tailored)
  let scoreAfter: MatchScoreResult
  try {
    scoreAfter = await scoreResume(creds, tailoredText, jobDescription, jobTitle || 'Not specified', company || 'Not specified')
    console.log(`[runTailorChain] scoreAfter=${scoreAfter.score} delta=${scoreAfter.score - scoreBefore.score}`)
  } catch (e) {
    console.error('[runTailorChain] scoreAfter failed:', e)
    scoreAfter = { ...scoreBefore }
  }

  return {
    tailoredPayload: tailored,
    tailoredResume: tailoredText,
    scoreBefore,
    scoreAfter,
    delta: scoreAfter.score - scoreBefore.score,
    changeLog,
  }
}

async function scoreResume(
  creds: { key: string; provider: string; model: string },
  resumeText: string,
  jobDescription: string,
  jobTitle: string,
  company: string
): Promise<MatchScoreResult> {
  const raw = await callAI({
    apiKey: creds.key, providerUrl: creds.provider, model: jsonModel(creds),
    systemPrompt: SCORE_SYSTEM_PROMPT,
    userMessage: `TARGET ROLE: ${jobTitle} at ${company}\n\nJOB DESCRIPTION:\n${jobDescription}\n\nRESUME:\n${resumeText}\n\nScore this resume against the job description.`,
    maxTokens: 1200,
    temperature: 0.1, // deterministic scoring
  })
  return JSON.parse(extractJSON(raw)) as MatchScoreResult
}

// ── POST /ai/tailor-resume — 3-step chain (score → tailor → score) ────────────
router.post('/tailor-resume', async (req: AuthRequest, res: Response) => {
  const { resumePayload, resumeText, jobDescription, jobTitle, company, previousTailoredPayload } = req.body
  if ((!resumePayload && !resumeText) || !jobDescription) {
    return res.status(400).json({ success: false, error: 'Provide resumePayload or resumeText, plus jobDescription' })
  }
  const creds = await getAiCreds(req.userId!, res)
  if (!creds) return
  try {
    const result = await runTailorChain({ creds, resumePayload, resumeText, jobDescription, jobTitle, company, previousTailoredPayload })
    res.json({ success: true, data: result })
  } catch (e: unknown) {
    res.status(502).json({ success: false, error: e instanceof Error ? e.message : 'AI tailoring failed' })
  }
})

router.post('/outreach', async (req: AuthRequest, res: Response) => {
  const { contacts, jobTitle, company, senderName, senderBackground, context } = req.body
  if (!contacts?.length || !jobTitle || !company) {
    return res.status(400).json({ success: false, error: 'contacts, jobTitle, company required' })
  }
  const creds = await getAiCreds(req.userId!, res)
  if (!creds) return

  const systemPrompt = `You are writing referral and outreach messages on behalf of a job seeker. The messages will be sent by the candidate directly, so write in first-person.

Message rules:
- 3–5 sentences per message, maximum
- Open with a specific, relevant observation — not a generic greeting
- Reference the specific role and company in every message
- Tailor the angle to the contact's role: a recruiter message focuses on fit and process; an engineering manager message focuses on technical background and collaboration; a peer message is more informal and collegial
- End with one clear, low-pressure ask — a quick call, an intro to the hiring manager, or forwarding the resume
- Do NOT use: "I hope this finds you well", "reach out anytime", "I would love to connect", "I came across your profile"
- Do NOT make claims about the candidate that are not stated in the background provided

Return ONLY a valid JSON array. No markdown, no commentary.
Exact shape:
[
  {
    "contactName": string,
    "subject": string,
    "message": string
  }
]`

  const userMessage = `SENDER: ${senderName || 'the applicant'}
BACKGROUND: ${senderBackground || ''}
APPLYING FOR: ${jobTitle} at ${company}
CONTEXT: ${context || 'Exploring this role and looking for a referral or warm introduction'}

CONTACTS:
${JSON.stringify(contacts.map((c: { name: string; role?: string }) => ({ name: c.name, role: c.role || 'unknown role' })), null, 2)}

Write one message per contact.`

  try {
    const raw = await callAI({ apiKey: creds.key, providerUrl: creds.provider, model: creds.model, systemPrompt, userMessage, maxTokens: 1500 })
    const messages = JSON.parse(extractJSON(raw))
    res.json({ success: true, data: { messages } })
  } catch (e: unknown) {
    res.status(502).json({ success: false, error: e instanceof Error ? e.message : 'AI call failed' })
  }
})

router.post('/match-score', async (req: AuthRequest, res: Response) => {
  const { resumeText, jobDescription, jobTitle, company } = req.body
  if (!resumeText || !jobDescription) {
    return res.status(400).json({ success: false, error: 'resumeText and jobDescription required' })
  }
  const creds = await getAiCreds(req.userId!, res)
  if (!creds) return

  try {
    const result = await scoreResume(creds, resumeText, jobDescription, jobTitle || 'Not specified', company || 'Not specified')
    res.json({ success: true, data: result })
  } catch (e: unknown) {
    res.status(502).json({ success: false, error: e instanceof Error ? e.message : 'AI call failed' })
  }
})

// Extension alias — same 3-step chain, accepts raw resume text + optional previous payload
router.post('/tailor', async (req: AuthRequest, res: Response) => {
  const { jd, baseResume, jobTitle, company, tailoredPayload: previousTailoredPayload } = req.body
  if (!jd) return res.status(400).json({ success: false, error: 'jd required' })
  if (!baseResume) return res.status(400).json({ success: false, error: 'baseResume required — upload your resume on the Profile page first' })
  const creds = await getAiCreds(req.userId!, res)
  if (!creds) return
  try {
    const result = await runTailorChain({
      creds,
      resumePayload: previousTailoredPayload || null,
      resumeText: previousTailoredPayload ? null : baseResume,
      jobDescription: jd,
      jobTitle: jobTitle || '',
      company: company || '',
      previousTailoredPayload: previousTailoredPayload || null,
    })
    // Extension expects { tailored } for backward compat — send both
    res.json({ success: true, data: { ...result, tailored: result.tailoredResume } })
  } catch (e: unknown) {
    res.status(502).json({ success: false, error: e instanceof Error ? e.message : 'AI tailoring failed' })
  }
})

router.post('/outreach-msg', async (req: AuthRequest, res: Response) => {
  const { jd, contacts } = req.body
  if (!jd) return res.status(400).json({ success: false, error: 'jd required' })
  const creds = await getAiCreds(req.userId!, res)
  if (!creds) return
  const systemPrompt = `Write a concise, friendly referral outreach LinkedIn message for the role described. Return ONLY the message text, no markdown.`
  const userMessage = `JD:\n${jd}\n\nContacts: ${JSON.stringify(contacts || [])}`
  try {
    const message = await callAI({ apiKey: creds.key, providerUrl: creds.provider, model: creds.model, systemPrompt, userMessage, maxTokens: 600 })
    res.json({ success: true, data: { message } })
  } catch (e: unknown) {
    res.status(502).json({ success: false, error: e instanceof Error ? e.message : 'AI call failed' })
  }
})

const SARVAM_MODEL = 'sarvam-105b'

// Extract structured JD from raw page text
router.post('/extract-jd', async (req: AuthRequest, res: Response) => {
  const { rawText, url } = req.body
  if (!rawText) return res.status(400).json({ success: false, error: 'rawText required' })
  const creds = await getAiCreds(req.userId!, res)
  if (!creds) return

  const usesSarvam = creds.provider === SARVAM_URL
  const providerUrl = usesSarvam ? SARVAM_URL : creds.provider
  const model = usesSarvam ? SARVAM_MODEL : creds.model

  const systemPrompt = `You are a precise job description extractor. Your task: find the ONE job being advertised in the text and extract its details. Return ONLY valid JSON — no markdown, no explanation.`
  const userMessage = `This text is from a job page. Extract the PRIMARY job being advertised (ignore any other job listings or UI navigation text). Return this exact JSON:
{
  "title": "exact job title",
  "company": "hiring company name",
  "location": "city/remote/hybrid if mentioned",
  "description": "full body of the job description — responsibilities, about the role, what you will do, about the company. Copy verbatim, preserve all paragraphs. Must be at least 150 words if present.",
  "skills": ["only technical tools, languages, frameworks, platforms — no soft skills"],
  "requirements": ["each specific requirement: years of experience, education, certifications, domain expertise"]
}

IGNORE: navigation links, 'Easy Apply', 'Save', 'Promoted', 'Viewed', alumni counts, page UI labels.
FOCUS ON: the section titled 'About the job', 'Job Description', 'Responsibilities', 'What you'll do', 'About us'.

If a field is absent use "" or [].

TEXT:
${rawText.slice(0, 14000)}`

  try {
    console.log(`[extract-jd] calling ${providerUrl} model=${model} textLen=${rawText.length}`)
    const raw = await callAI({ apiKey: creds.key, providerUrl, model, systemPrompt, userMessage, maxTokens: 4000 })
    console.log(`[extract-jd] raw response (first 500): ${raw.slice(0, 500)}`)
    const stripped = raw.replace(/^```(?:json)?\n?/i, '').replace(/\n?```$/i, '').trim()
    const start = stripped.indexOf('{')
    const end = stripped.lastIndexOf('}')
    if (start === -1 || end === -1) throw new Error('No JSON in AI response')
    let jd: Record<string, unknown>
    try {
      jd = JSON.parse(stripped.slice(start, end + 1))
    } catch {
      // Truncated JSON — salvage what we can by closing open strings/arrays/objects
      const partial = stripped.slice(start)
      const salvaged = partial
        .replace(/,\s*$/, '')           // trailing comma
        .replace(/"([^"]*?)$/m, '"$1"') // unclosed string → close it
        + (partial.split('{').length > partial.split('}').length ? '}' : '') // unclosed object
      jd = JSON.parse(salvaged)
    }
    console.log(`[extract-jd] parsed JD title="${jd.title}" company="${jd.company}"`)
    // Validate JD description is substantive — not LinkedIn boilerplate or empty
    const desc = typeof jd.description === 'string' ? jd.description.trim() : ''
    if (!desc || desc.length < 200) {
      return res.status(422).json({
        success: false,
        error: 'Job description too short — please scroll the full job posting into view before scraping.'
      })
    }
    jd.url = url || ''
    res.json({ success: true, data: { ...jd, _extractedBy: `${model}` } })
  } catch (e: unknown) {
    res.status(502).json({ success: false, error: e instanceof Error ? e.message : 'AI extraction failed' })
  }
})

// ── Resume OCR + profile extraction ──────────────────────────────────────────
// Schema verification (verified against web/src/pages/Profile.tsx ProfileData interface):
//   name           → string  — maps to ProfileData.name
//   currentTitle   → string  — maps to ProfileData.currentTitle
//   currentCompany → string  — maps to ProfileData.currentCompany
//   location       → string  — maps to ProfileData.location
//   yearsExp       → number  — maps to ProfileData.yearsExp (overridden by date-extraction logic below)
//   summary        → string  — maps to ProfileData.summary
//   rolesHeld      → string[]— maps to ProfileData.rolesHeld
//   targetRoles    → string[]— maps to ProfileData.targetRoles
//   skills         → string[]— maps to ProfileData.skills
//   education      → string  — maps to ProfileData.education
//   certifications → string[]— maps to ProfileData.certifications
//   rawText is appended server-side and consumed by Profile.tsx as ProfileData.resumeText
//   resumeFileName is set client-side from the File object, not returned here
//   hasAiKey is set from the profile record, not returned here
// All fields verified: no schema mismatch between this endpoint and ProfileData.
router.post('/parse-resume', upload.single('resume'), async (req: AuthRequest, res: Response) => {
  if (!req.file) return res.status(400).json({ success: false, error: 'No file uploaded' })

  const creds = await getAiCreds(req.userId!, res)
  if (!creds) return

  // Extract raw text from PDF or plain text file
  let rawText = ''
  const isDocx = req.file.mimetype === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' || req.file.originalname.endsWith('.docx')
  const isPdf = req.file.mimetype === 'application/pdf' || req.file.originalname.endsWith('.pdf')
  try {
    if (isPdf) {
      const parsed = await pdfParse(req.file.buffer)
      rawText = parsed.text
    } else if (isDocx) {
      const result = await mammoth.extractRawText({ buffer: req.file.buffer })
      rawText = result.value
    } else {
      rawText = req.file.buffer.toString('utf-8')
    }
  } catch (e) {
    return res.status(422).json({ success: false, error: 'Could not read file — ensure it is a valid PDF, Word (.docx), or text file' })
  }

  if (!rawText || rawText.trim().length < 50) {
    return res.status(422).json({ success: false, error: 'File appears empty or unreadable' })
  }

  const usesSarvam = !creds.provider || creds.provider.includes('sarvam.ai')
  const providerUrl = usesSarvam ? SARVAM_URL : creds.provider
  const model = 'sarvam-105b'

  const systemPrompt = `You are a resume parser. Extract profile data and return ONLY a valid JSON object — no markdown, no explanation, no preamble.`

  const userMessage = `Extract from this resume and return JSON only:
{"name":"","currentTitle":"","currentCompany":"","location":"","yearsExp":0,"summary":"","rolesHeld":[],"targetRoles":[],"skills":[],"education":"","certifications":[]}

Rules: yearsExp=completed full years since first job (floor, no rounding up). rolesHeld=all titles held (deduped). skills=every tool/tech/framework in the resume. targetRoles=2-3 logical next roles. summary=2 sentences. Use "" or [] if absent.

RESUME:
${rawText.slice(0, 8000)}`

  try {
    const raw = await callAI({ apiKey: creds.key, providerUrl, model, systemPrompt, userMessage, maxTokens: 4000 })
    console.log(`[parse-resume] raw response preview: ${raw.slice(0, 300)}`)
    // Strip markdown fences, grab outermost {...}
    const stripped = raw.replace(/^```(?:json)?\n?/im, '').replace(/\n?```$/im, '').trim()
    const start = stripped.indexOf('{')
    const end = stripped.lastIndexOf('}')
    if (start === -1 || end === -1) throw new Error(`No JSON object in response. Got: ${raw.slice(0, 200)}`)
    const parsed = JSON.parse(stripped.slice(start, end + 1))
    // Extract earliest date from work experience section only — excludes education dates
    const now = new Date()
    const MONTHS: Record<string, number> = {
      jan:1,feb:2,mar:3,apr:4,may:5,jun:6,jul:7,aug:8,sep:9,oct:10,nov:11,dec:12,
      january:1,february:2,march:3,april:4,june:6,july:7,august:8,september:9,october:10,november:11,december:12
    }

    // Isolate the work experience section (between "WORK EXPERIENCE" and "EDUCATION")
    const workSectionMatch = rawText.match(/(?:WORK EXPERIENCE|EXPERIENCE)[:\s]*([\s\S]*?)(?:\n\s*EDUCATION|\n\s*CERTIFICATIONS|$)/i)
    const workSection = workSectionMatch ? workSectionMatch[1] : rawText
    console.log(`[parse-resume] workSection first 200: ${workSection.slice(0, 200)}`)

    const dates: Date[] = []
    // "03/2021" or "03-2021"
    for (const m of workSection.matchAll(/\b(0?[1-9]|1[0-2])[\/\-](20[012]\d|199\d)\b/g)) {
      dates.push(new Date(parseInt(m[2]), parseInt(m[1]) - 1))
    }
    // "Mar 2021" / "March 2021"
    for (const m of workSection.matchAll(/\b([A-Za-z]{3,9})\s+(20[012]\d|199\d)\b/g)) {
      const mo = MONTHS[m[1].toLowerCase()]
      if (mo) dates.push(new Date(parseInt(m[2]), mo - 1))
    }
    // Bare year fallback (only if no month+year found)
    if (!dates.length) {
      for (const m of workSection.matchAll(/\b(20[012]\d|199\d)\b/g)) {
        dates.push(new Date(parseInt(m[1]), 0))
      }
    }

    const earliest = dates.length ? new Date(Math.min(...dates.map(d => d.getTime()))) : null
    console.log(`[parse-resume] all dates found: ${dates.map(d => d.toISOString().slice(0,7)).join(', ')}`)
    console.log(`[parse-resume] earliest: ${earliest?.toISOString().slice(0,7)}`)
    if (earliest) {
      const totalMonths = (now.getFullYear() - earliest.getFullYear()) * 12 + (now.getMonth() - earliest.getMonth())
      parsed.yearsExp = Math.floor(totalMonths / 12 * 10) / 10  // e.g. 5.3
      console.log(`[parse-resume] totalMonths=${totalMonths} yearsExp=${parsed.yearsExp}`)
    }

    // If the uploaded file was a .docx, store the binary for later surgical replacement
    if (isDocx) {
      try {
        await db.profile.upsert({
          where: { userId: req.userId! },
          update: { resumeDocx: req.file!.buffer },
          create: { userId: req.userId!, resumeDocx: req.file!.buffer },
        })
      } catch (e) {
        console.error('[parse-resume] failed to store resumeDocx:', e)
      }
    }

    res.json({ success: true, data: { ...parsed, rawText: rawText.slice(0, 50000) } })
  } catch (e) {
    res.status(502).json({ success: false, error: e instanceof Error ? e.message : 'AI extraction failed' })
  }
})

// ── Surgical .docx replacement helpers ───────────────────────────────────────
const W_NS = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'

function getParaText(para: Element): string {
  const runs = para.getElementsByTagNameNS(W_NS, 't')
  let text = ''
  for (let i = 0; i < runs.length; i++) text += runs[i].textContent || ''
  return text
}

function replaceParaText(para: Element, newText: string): void {
  // Snapshot the live NodeList before mutating
  const liveRuns = para.getElementsByTagNameNS(W_NS, 'r')
  const runs: Element[] = []
  for (let i = 0; i < liveRuns.length; i++) runs.push(liveRuns[i] as Element)
  if (!runs.length) return

  const firstT = runs[0].getElementsByTagNameNS(W_NS, 't')[0] as Element | undefined
  if (firstT) {
    firstT.textContent = newText
    firstT.setAttribute('xml:space', 'preserve')
  }
  // Remove subsequent runs (reverse to avoid index shift issues)
  for (let i = runs.length - 1; i >= 1; i--) {
    runs[i].parentNode?.removeChild(runs[i])
  }
}

async function surgicalDocxReplacement(
  originalDocx: Buffer,
  tailoredPayload: ResumePayload
): Promise<Buffer> {
  const zip = await JSZip.loadAsync(originalDocx)
  const docFile = zip.file('word/document.xml')
  if (!docFile) throw new Error('Invalid docx: missing word/document.xml')

  const docXml: string = await docFile.async('string')
  const parser = new DOMParser()
  const dom = parser.parseFromString(docXml, 'application/xml')

  // Snapshot all paragraphs as an array (live NodeList would shift as we mutate)
  const liveParas = dom.getElementsByTagNameNS(W_NS, 'p')
  const allParas: Element[] = []
  for (let i = 0; i < liveParas.length; i++) allParas.push(liveParas[i] as Element)

  // Index paragraphs: track index, text, and whether it's a bullet
  interface ParaInfo { idx: number; text: string; isBullet: boolean; el: Element }
  const paraInfos: ParaInfo[] = allParas.map((el, idx) => {
    const pPr = el.getElementsByTagNameNS(W_NS, 'pPr')[0]
    const numPr = pPr?.getElementsByTagNameNS(W_NS, 'numPr')[0]
    return { idx, text: getParaText(el).trim(), isBullet: !!numPr, el }
  })

  // ── Summary replacement ──────────────────────────────────────────────────────
  const tailoredSummary = tailoredPayload.summary?.trim()
  if (tailoredSummary) {
    const summaryPara = paraInfos.find(p =>
      !p.isBullet && p.text.length > 60 && /[a-z]/.test(p.text) && p.text.split(' ').length > 10
    )
    if (summaryPara) replaceParaText(summaryPara.el, tailoredSummary)
  }

  // ── Per-role bullet replacement ──────────────────────────────────────────────
  // For each experience role, find the anchor paragraph (company/title match),
  // then replace the actual content bullets that immediately follow it.
  // This avoids confusing role-title/company paragraphs (also bullet-styled) with content bullets.
  for (const role of tailoredPayload.experience) {
    const { company, title, bullets: tailoredBullets } = role
    if (!tailoredBullets.length) continue

    // Find the anchor: a paragraph whose text contains the company name or role title
    const anchorIdx = paraInfos.findIndex(p => {
      if (!p.text) return false
      const t = p.text.toLowerCase()
      const co = company?.toLowerCase() || ''
      const ti = title?.toLowerCase() || ''
      return (co && t.includes(co)) || (ti && t.includes(ti))
    })
    if (anchorIdx === -1) continue

    // From the anchor forward, collect bullet paragraphs that look like real content bullets:
    // they should be longer than a typical company/title line (>30 chars) and contain a verb or number
    const contentBulletInfos: ParaInfo[] = []
    for (let k = anchorIdx + 1; k < paraInfos.length && contentBulletInfos.length < tailoredBullets.length + 2; k++) {
      const p = paraInfos[k]
      // Stop if we hit a new section or a new company (non-bullet body paragraph with all-caps or short text)
      if (!p.isBullet && (p.text.length < 50 || /^[A-Z\s,]+$/.test(p.text))) break
      if (!p.isBullet) continue // skip non-bullet body paragraphs within the section
      // Heuristic: real content bullets are longer than 30 chars (company/title bullet-paragraphs are short)
      if (p.text.length > 30) {
        contentBulletInfos.push(p)
        if (contentBulletInfos.length >= tailoredBullets.length) break
      }
    }

    // Replace matched content bullets with tailored bullets
    for (let j = 0; j < Math.min(contentBulletInfos.length, tailoredBullets.length); j++) {
      replaceParaText(contentBulletInfos[j].el, tailoredBullets[j])
    }
  }

  const serializer = new XMLSerializer()
  const newDocXml = serializer.serializeToString(dom)
  zip.file('word/document.xml', newDocXml)
  return zip.generateAsync({ type: 'nodebuffer' }) as Promise<Buffer>
}

// ── Generate downloadable .docx from tailored resume text ────────────────────
router.post('/download-resume', async (req: AuthRequest, res: Response) => {
  const { resumeText, tailoredPayload, filename } = req.body
  if (!resumeText) return res.status(400).json({ success: false, error: 'resumeText required' })

  // Try surgical replacement if user uploaded a .docx and we have a structured payload
  if (tailoredPayload && req.userId) {
    try {
      const profile = await db.profile.findUnique({ where: { userId: req.userId } })
      if (profile?.resumeDocx) {
        const buffer = await surgicalDocxReplacement(profile.resumeDocx as Buffer, tailoredPayload as ResumePayload)
        const safeName = (filename || 'tailored-resume').replace(/[^a-z0-9_\-]/gi, '_')
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document')
        res.setHeader('Content-Disposition', `attachment; filename="${safeName}.docx"`)
        return res.send(buffer)
      }
    } catch (e) {
      console.error('[download-resume] surgical replacement failed, falling back:', e)
    }
  }

  res.status(400).json({ success: false, error: 'No original .docx found — please re-upload your original resume (.docx) on the Profile page first.' })
})

export default router
