export type Tab = 'resume' | 'outreach' | 'apply' | 'tracker' | 'settings'

export interface JD {
  title: string; company: string; description: string
  skills: string[]; requirements: string[]; url: string
}
export interface Contact { name: string; linkedin: string }

export interface ScoreResult {
  score: number
  matchedKeywords: string[]
  missingKeywords: string[]
  topMissingForSummary: string[]
  topMissingForBullets: string[]
  breakdown: { skillsMatch: number; expMatch: number; summaryMatch: number }
  summary: string
}

interface State {
  token: string | null
  email: string | null
  activeTab: Tab
  jd: JD | null
  contacts: Contact[]
  tailored: string
  tailoredPayload: Record<string, unknown> | null
  scoreBefore: ScoreResult | null
  scoreAfter: ScoreResult | null
  delta: number | null
  changeLog: string[]
  baseResume: string
  profileName: string
  outreachMsg: string
  loading: boolean
  loadingMsg: string
  error: string
}

type Listener = () => void

const state: State = {
  token: localStorage.getItem('jp_token'),
  email: localStorage.getItem('jp_email'),
  activeTab: 'resume',
  jd: null, contacts: [],
  tailored: '', tailoredPayload: null,
  scoreBefore: null, scoreAfter: null, delta: null, changeLog: [],
  baseResume: '', profileName: '', outreachMsg: '',
  loading: false, loadingMsg: '', error: '',
}

const listeners = new Set<Listener>()
export function getState(): Readonly<State> { return state }
export function setState(patch: Partial<State>) { Object.assign(state, patch); listeners.forEach(l => l()) }
export function subscribe(l: Listener): () => void { listeners.add(l); return () => listeners.delete(l) }

export function setToken(token: string, email: string) {
  localStorage.setItem('jp_token', token)
  localStorage.setItem('jp_email', email)
  setState({ token, email })
}
export function logout() {
  localStorage.removeItem('jp_token')
  localStorage.removeItem('jp_email')
  setState({ token: null, email: null })
}
