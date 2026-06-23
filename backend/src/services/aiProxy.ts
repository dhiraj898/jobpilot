interface HistoryMessage {
  role: 'user' | 'assistant'
  content: string
}

interface AICallOptions {
  providerUrl: string
  model: string
  apiKey: string
  systemPrompt: string
  userMessage: string
  maxTokens?: number
  temperature?: number
  history?: HistoryMessage[]
}

export const SARVAM_URL = 'https://api.sarvam.ai/v1'

export async function callAI(opts: AICallOptions): Promise<string> {
  const url = `${opts.providerUrl.replace(/\/$/, '')}/chat/completions`

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${opts.apiKey}`,
    'api-subscription-key': opts.apiKey, // Sarvam's preferred auth header
  }

  const messages = [
    { role: 'system', content: opts.systemPrompt },
    ...(opts.history || []),
    { role: 'user', content: opts.userMessage },
  ]

  const body: Record<string, unknown> = {
    model: opts.model,
    max_tokens: opts.maxTokens || 4000,
    temperature: opts.temperature ?? 0.3,
    messages,
  }

  console.log(`[callAI] POST ${url} model=${opts.model}`)
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 45_000)
  let res: Response
  try {
    res = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body), signal: controller.signal })
  } catch (e) {
    if (e instanceof Error && e.name === 'AbortError') {
      throw new Error('AI request timed out after 45 seconds. Please try again.')
    }
    throw e
  } finally {
    clearTimeout(timeout)
  }
  if (!res.ok) {
    const err = await res.text()
    console.error(`[callAI] error ${res.status}: ${err.slice(0, 500)}`)
    throw new Error(`AI error ${res.status}: ${err.slice(0, 300)}`)
  }
  const data = await res.json() as {
    choices: { finish_reason: string; message: { content: string | null; reasoning_content?: string } }[]
  }
  console.log(`[callAI] response: ${JSON.stringify(data).slice(0, 500)}`)
  const choice = data.choices?.[0]
  // Prefer content (direct output). reasoning_content is chain-of-thought from sarvam-30b — only use as last resort.
  const content = choice?.message?.content || choice?.message?.reasoning_content
  if (!content) throw new Error(`AI returned empty response (finish_reason=${choice?.finish_reason}). Raw: ${JSON.stringify(data).slice(0, 300)}`)
  if (!choice?.message?.content && choice?.message?.reasoning_content) {
    console.warn(`[callAI] WARNING: model=${opts.model} returned only reasoning_content — JSON tasks will fail. Use sarvam-105b instead.`)
  }
  return content
}
