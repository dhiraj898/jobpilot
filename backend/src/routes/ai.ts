import { Router, Response } from 'express'
import { requireAuth, AuthRequest } from '../middleware/auth'
import { getDecryptedKey } from './profile'
import { callAI, SARVAM_URL } from '../services/aiProxy'

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

router.post('/tailor-resume', async (req: AuthRequest, res: Response) => {
  const { baseResume, jobDescription, jobTitle, company } = req.body
  if (!baseResume || !jobDescription) {
    return res.status(400).json({ success: false, error: 'baseResume and jobDescription required' })
  }
  const creds = await getAiCreds(req.userId!, res)
  if (!creds) return

  const systemPrompt = `You are an expert resume writer. Tailor the resume to the job description. Keep structure, rewrite bullets to match JD keywords. Do NOT invent experience. Return ONLY the tailored resume text.`
  const userMessage = `Job Title: ${jobTitle || ''}\nCompany: ${company || ''}\n\nJD:\n${jobDescription}\n\nRESUME:\n${baseResume}`

  try {
    const tailored = await callAI({ apiKey: creds.key, providerUrl: creds.provider, model: creds.model, systemPrompt, userMessage, maxTokens: 3000 })
    res.json({ success: true, data: { tailoredResume: tailored } })
  } catch (e: unknown) {
    res.status(502).json({ success: false, error: e instanceof Error ? e.message : 'AI call failed' })
  }
})

router.post('/outreach', async (req: AuthRequest, res: Response) => {
  const { contacts, jobTitle, company, senderName } = req.body
  if (!contacts?.length || !jobTitle || !company) {
    return res.status(400).json({ success: false, error: 'contacts, jobTitle, company required' })
  }
  const creds = await getAiCreds(req.userId!, res)
  if (!creds) return

  const systemPrompt = `Generate concise referral outreach messages. Return JSON array: [{ "contactName": string, "message": string }]. No markdown.`
  const userMessage = `Sender: ${senderName || ''}\nRole: ${jobTitle} at ${company}\nContacts: ${JSON.stringify(contacts)}`

  try {
    const raw = await callAI({ apiKey: creds.key, providerUrl: creds.provider, model: creds.model, systemPrompt, userMessage, maxTokens: 1500 })
    const messages = JSON.parse(raw)
    res.json({ success: true, data: { messages } })
  } catch (e: unknown) {
    res.status(502).json({ success: false, error: e instanceof Error ? e.message : 'AI call failed' })
  }
})

router.post('/match-score', async (req: AuthRequest, res: Response) => {
  const { resumeText, jobDescription } = req.body
  if (!resumeText || !jobDescription) {
    return res.status(400).json({ success: false, error: 'resumeText and jobDescription required' })
  }
  const creds = await getAiCreds(req.userId!, res)
  if (!creds) return

  const systemPrompt = `Analyse resume vs JD. Return ONLY valid JSON: {"score":number,"matchedKeywords":string[],"missingKeywords":string[],"summary":string}`
  const userMessage = `JD: ${jobDescription}\n\nRESUME: ${resumeText}`

  try {
    const raw = await callAI({ apiKey: creds.key, providerUrl: creds.provider, model: creds.model, systemPrompt, userMessage, maxTokens: 500 })
    const result = JSON.parse(raw)
    res.json({ success: true, data: result })
  } catch (e: unknown) {
    res.status(502).json({ success: false, error: e instanceof Error ? e.message : 'AI call failed' })
  }
})

// Short aliases used by the Chrome extension
router.post('/tailor', async (req: AuthRequest, res: Response) => {
  const { jd } = req.body
  if (!jd) return res.status(400).json({ success: false, error: 'jd required' })
  const creds = await getAiCreds(req.userId!, res)
  if (!creds) return
  const systemPrompt = `You are an expert resume writer. Tailor the user's resume to the job description. Return ONLY the tailored resume text.`
  const userMessage = `JD:\n${jd}\n\nPlease tailor my resume to this job description.`
  try {
    const tailored = await callAI({ apiKey: creds.key, providerUrl: creds.provider, model: creds.model, systemPrompt, userMessage, maxTokens: 3000 })
    res.json({ success: true, data: { tailored } })
  } catch (e: unknown) {
    res.status(502).json({ success: false, error: e instanceof Error ? e.message : 'AI call failed' })
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

const SARVAM_MODEL = 'sarvam-30b'  // confirmed API model ID for Sarvam's 30B model

// Extract structured JD from raw page text — uses Sarvam-M (30B) if configured, else falls back to user's provider
router.post('/extract-jd', async (req: AuthRequest, res: Response) => {
  const { rawText, url } = req.body
  if (!rawText) return res.status(400).json({ success: false, error: 'rawText required' })
  const creds = await getAiCreds(req.userId!, res)
  if (!creds) return

  // Prefer Sarvam-M (30B) for extraction — best at structured information extraction from noisy page text
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
    const cleaned = raw.replace(/^```(?:json)?\n?/i, '').replace(/\n?```$/i, '').trim()
    const jd = JSON.parse(cleaned)
    console.log(`[extract-jd] parsed JD title="${jd.title}" company="${jd.company}"`)
    jd.url = url || ''
    res.json({ success: true, data: { ...jd, _extractedBy: `${model}` } })
  } catch (e: unknown) {
    res.status(502).json({ success: false, error: e instanceof Error ? e.message : 'AI extraction failed' })
  }
})

export default router
