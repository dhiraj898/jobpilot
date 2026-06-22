const BASE = 'http://localhost:3001'

function token(): string { return localStorage.getItem('jp_token') || '' }

async function req<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token()}` },
    body: body ? JSON.stringify(body) : undefined,
  })
  const json = await res.json()
  if (!json.success) throw new Error(json.error || 'Request failed')
  return json.data
}

export const api = {
  login: (email: string, password: string) => req<{ token: string }>('POST', '/auth/login', { email, password }),
  me: () => req<{ id: string; email: string }>('GET', '/auth/me'),
  profile: () => req<Record<string, unknown>>('GET', '/profile'),
  saveApp: (data: Record<string, unknown>) => req<{ id: string }>('POST', '/applications', data),
  tailorResume: (jd: string) => req<{ tailored: string }>('POST', '/ai/tailor', { jd }),
  outreach: (jd: string, contacts: unknown[]) => req<{ message: string }>('POST', '/ai/outreach-msg', { jd, contacts }),
}
