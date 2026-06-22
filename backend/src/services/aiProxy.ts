interface AICallOptions {
  providerUrl: string
  model: string
  apiKey: string
  systemPrompt: string
  userMessage: string
  maxTokens?: number
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

  const body = {
    model: opts.model,
    max_tokens: opts.maxTokens || 2000,
    messages: [
      { role: 'system', content: opts.systemPrompt },
      { role: 'user', content: opts.userMessage },
    ],
  }

  const res = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body) })
  if (!res.ok) {
    const err = await res.text()
    throw new Error(`AI provider error ${res.status}: ${err.slice(0, 300)}`)
  }
  const data = await res.json() as { choices: { message: { content: string } }[] }
  return data.choices[0].message.content
}

export { SARVAM_URL }
