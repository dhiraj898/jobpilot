interface AICallOptions {
  providerUrl: string
  model: string
  apiKey: string
  systemPrompt: string
  userMessage: string
  maxTokens?: number
}

export async function callAI(opts: AICallOptions): Promise<string> {
  const url = `${opts.providerUrl.replace(/\/$/, '')}/chat/completions`
  const body = {
    model: opts.model,
    max_tokens: opts.maxTokens || 2000,
    messages: [
      { role: 'system', content: opts.systemPrompt },
      { role: 'user', content: opts.userMessage }
    ]
  }
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${opts.apiKey}`,
      'anthropic-version': '2023-06-01',
      'x-api-key': opts.apiKey
    },
    body: JSON.stringify(body)
  })
  if (!res.ok) {
    const err = await res.text()
    throw new Error(`AI provider error ${res.status}: ${err}`)
  }
  const data = await res.json() as { choices: { message: { content: string } }[] }
  return data.choices[0].message.content
}
