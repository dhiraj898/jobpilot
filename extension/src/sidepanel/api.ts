const BASE = 'http://localhost:3001'

function token(): string { return localStorage.getItem('jp_token') || '' }

async function req<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token()}` },
    body: body ? JSON.stringify(body) : undefined,
  })
  const json = await res.json() as { success: boolean; data: T; error?: string }
  if (!json.success) throw new Error(json.error || 'Request failed')
  return json.data
}

export const api = {
  login: (email: string, password: string) =>
    req<{ token: string }>('POST', '/auth/login', { email, password }),

  // AI calls — key comes from DB, no chrome.storage needed
  extractJD: (rawText: string, url: string) =>
    req<{ title: string; company: string; description: string; skills: string[]; requirements: string[]; url: string }>(
      'POST', '/ai/extract-jd', { rawText, url }
    ),
  tailorResume: (jd: string, baseResume: string) =>
    req<{ tailored: string }>('POST', '/ai/tailor', { jd, baseResume }),
  outreach: (jd: string, contacts: unknown[]) =>
    req<{ message: string }>('POST', '/ai/outreach-msg', { jd, contacts }),

  saveApp: (data: Record<string, unknown>) =>
    req<{ id: string }>('POST', '/applications', data),
  profile: () =>
    req<Record<string, unknown>>('GET', '/profile'),
}
