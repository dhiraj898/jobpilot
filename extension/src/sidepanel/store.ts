export type Tab = 'resume' | 'outreach' | 'apply' | 'tracker' | 'settings'

export interface JD {
  title: string
  company: string
  description: string
  skills: string[]
  requirements: string[]
  url: string
}

export interface Contact { name: string; linkedin: string }

export interface AIConfig {
  apiKey: string
  provider: string  // base URL e.g. https://api.anthropic.com/v1
  model: string
}

interface State {
  token: string | null
  email: string | null
  activeTab: Tab
  jd: JD | null
  contacts: Contact[]
  tailored: string
  outreachMsg: string
  aiConfig: AIConfig | null
  loading: boolean
  loadingMsg: string
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
  aiConfig: null,
  loading: false,
  loadingMsg: '',
  error: '',
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

export async function loadAIConfig(): Promise<AIConfig | null> {
  const data = await chrome.storage.sync.get(['jp_ai_key', 'jp_ai_provider', 'jp_ai_model'])
  if (!data.jp_ai_key) return null
  const config: AIConfig = {
    apiKey: data.jp_ai_key,
    provider: data.jp_ai_provider || 'https://api.anthropic.com/v1',
    model: data.jp_ai_model || 'claude-sonnet-4-6',
  }
  setState({ aiConfig: config })
  return config
}

export async function saveAIConfig(config: AIConfig): Promise<void> {
  await chrome.storage.sync.set({
    jp_ai_key: config.apiKey,
    jp_ai_provider: config.provider,
    jp_ai_model: config.model,
  })
  setState({ aiConfig: config })
}
