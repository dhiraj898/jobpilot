declare const API_BASE_DEFINE: string
const BASE = typeof API_BASE_DEFINE !== 'undefined' ? API_BASE_DEFINE : 'http://localhost:3001'

export class HttpError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message)
    this.name = 'HttpError'
  }
}

function token(): string { return localStorage.getItem('jp_token') || '' }

async function req<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token()}` },
    body: body ? JSON.stringify(body) : undefined,
  })
  const json = await res.json() as { success: boolean; data: T; error?: string }
  if (!res.ok || !json.success) throw new HttpError(res.status, json.error || 'Request failed')
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
  tailorResume: (
    jd: string,
    baseResume: string,
    jobTitle?: string,
    company?: string,
    tailoredPayload?: Record<string, unknown> | null
  ) =>
    req<{
      tailored: string
      tailoredPayload: Record<string, unknown>
      tailoredResume: string
      scoreBefore: { score: number; matchedKeywords: string[]; missingKeywords: string[]; topMissingForSummary: string[]; topMissingForBullets: string[]; breakdown: { skillsMatch: number; expMatch: number; summaryMatch: number }; summary: string }
      scoreAfter: { score: number; matchedKeywords: string[]; missingKeywords: string[]; topMissingForSummary: string[]; topMissingForBullets: string[]; breakdown: { skillsMatch: number; expMatch: number; summaryMatch: number }; summary: string }
      delta: number
      changeLog: string[]
    }>('POST', '/ai/tailor', { jd, baseResume, jobTitle, company, tailoredPayload }),

  downloadResume: async (resumeText: string, filename: string, tailoredPayload?: Record<string, unknown> | null): Promise<void> => {
    const res = await fetch(`${BASE}/ai/download-resume`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token()}` },
      body: JSON.stringify({ resumeText, filename, tailoredPayload }),
    })
    if (!res.ok) {
      // Try to parse the error message from backend
      try {
        const json = await res.json() as { error?: string }
        throw new Error(json.error || 'Failed to generate document')
      } catch (e) {
        if (e instanceof Error && e.message !== 'Failed to generate document') throw e
        throw new Error('Failed to generate document')
      }
    }
    const blob = await res.blob()
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${filename}.docx`
    a.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  },
  outreach: (jd: string, contacts: unknown[]) =>
    req<{ message: string }>('POST', '/ai/outreach-msg', { jd, contacts }),

  saveApp: (data: Record<string, unknown>) =>
    req<{ id: string }>('POST', '/applications', data),
  profile: () =>
    req<Record<string, unknown>>('GET', '/profile'),
}
