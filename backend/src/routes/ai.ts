import { Router, Response } from 'express'
import { requireAuth, AuthRequest } from '../middleware/auth'
import { getDecryptedKey } from './profile'
import { callAI } from '../services/aiProxy'

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
    const tailored = await callAI({ ...creds, providerUrl: creds.provider, systemPrompt, userMessage, maxTokens: 3000 })
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
    const raw = await callAI({ ...creds, providerUrl: creds.provider, systemPrompt, userMessage, maxTokens: 1500 })
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
    const raw = await callAI({ ...creds, providerUrl: creds.provider, systemPrompt, userMessage, maxTokens: 500 })
    const result = JSON.parse(raw)
    res.json({ success: true, data: result })
  } catch (e: unknown) {
    res.status(502).json({ success: false, error: e instanceof Error ? e.message : 'AI call failed' })
  }
})

export default router
