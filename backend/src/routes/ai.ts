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

  const systemPrompt = `You extract job posting information from raw webpage text. Return ONLY valid JSON, no markdown, no explanation.`
  const userMessage = `Extract the job details from this webpage text. Return JSON with exactly these fields:
{
  "title": "job title",
  "company": "company name",
  "description": "full job description text, preserve all details",
  "skills": ["skill1", "skill2"],
  "requirements": ["requirement1", "requirement2"]
}
If a field is not found, use empty string or empty array.

PAGE TEXT:
${rawText.slice(0, 15000)}`

  try {
    const raw = await callAI({ apiKey: creds.key, providerUrl, model, systemPrompt, userMessage, maxTokens: 2000 })
    const cleaned = raw.replace(/^```(?:json)?\n?/i, '').replace(/\n?```$/i, '').trim()
    const jd = JSON.parse(cleaned)
    jd.url = url || ''
    res.json({ success: true, data: { ...jd, _extractedBy: `${model}` } })
  } catch (e: unknown) {
    res.status(502).json({ success: false, error: e instanceof Error ? e.message : 'AI extraction failed' })
  }
})

export default router
