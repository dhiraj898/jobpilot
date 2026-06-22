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

const SARVAM_URL = 'https://api.sarvam.ai/v1'

export async function callAI(opts: AICallOptions): Promise<string> {
  const url = `${opts.providerUrl.replace(/\/$/, '')}/chat/completions`
  const isSarvam = opts.providerUrl.includes('sarvam.ai')
  const isAnthropic = opts.providerUrl.includes('anthropic.com')

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${opts.apiKey}`,
  }

  // Sarvam's primary auth header (they also accept Bearer but this is recommended)
  if (isSarvam) {
    headers['api-subscription-key'] = opts.apiKey
  }

  // Anthropic requires version header
  if (isAnthropic) {
    headers['x-api-key'] = opts.apiKey
    headers['anthropic-version'] = '2023-06-01'
  }

  const messages = [
    { role: 'system', content: opts.systemPrompt },
    ...(opts.history || []),
    { role: 'user', content: opts.userMessage },
  ]

  const body: Record<string, unknown> = {
    model: opts.model,
    max_tokens: opts.maxTokens || 2000,
    temperature: opts.temperature ?? 0.3,
    messages,
  }

  console.log(`[callAI] POST ${url} model=${opts.model}`)
  const res = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body) })
  if (!res.ok) {
    const err = await res.text()
    console.error(`[callAI] error ${res.status}: ${err.slice(0, 500)}`)
    throw new Error(`AI provider error ${res.status}: ${err.slice(0, 300)}`)
  }
  const data = await res.json() as { choices: { finish_reason: string; message: { content: string | null; reasoning_content?: string } }[] }
  console.log(`[callAI] full response: ${JSON.stringify(data).slice(0, 1000)}`)
  const choice = data.choices?.[0]
  const content = choice?.message?.content || choice?.message?.reasoning_content
  if (!content) throw new Error(`AI returned empty response (finish_reason=${choice?.finish_reason}). Raw: ${JSON.stringify(data).slice(0, 300)}`)
  return content
}

export { SARVAM_URL }
