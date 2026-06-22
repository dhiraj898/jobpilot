export type Tab = 'resume' | 'outreach' | 'apply' | 'tracker'

interface JD { title: string; company: string; description: string; url: string }
interface Contact { name: string; title: string; linkedin: string }

interface State {
  token: string | null
  email: string | null
  activeTab: Tab
  jd: JD | null
  contacts: Contact[]
  tailored: string
  outreachMsg: string
  loading: boolean
  error: string
}

type Listener = () => void

const state: State = {
  token: localStorage.getItem('jp_token'),
  email: localStorage.getItem('jp_email'),
  activeTab: 'resume',
  jd: null,
  contacts: [],
  tailored: '',
  outreachMsg: '',
  loading: false,
  error: '',
}

const listeners = new Set<Listener>()

export function getState(): Readonly<State> { return state }

export function setState(patch: Partial<State>) {
  Object.assign(state, patch)
  listeners.forEach(l => l())
}

export function subscribe(l: Listener): () => void {
  listeners.add(l)
  return () => listeners.delete(l)
}

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
