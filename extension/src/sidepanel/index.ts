import { getState, setState, subscribe, setToken, logout, loadAIConfig, saveAIConfig } from './store'
import type { AIConfig, JD } from './store'
import { extractJD, tailorResume, generateOutreach } from './ai'

let root: HTMLElement

// ── DOM helpers ──────────────────────────────────────────────────────────────
function h(tag: string, cls = '', ...children: (string | HTMLElement)[]): HTMLElement {
  const el = document.createElement(tag)
  if (cls) el.className = cls
  children.forEach(c => typeof c === 'string' ? el.append(document.createTextNode(c)) : el.append(c))
  return el
}
function inp(type: string, placeholder: string, value = ''): HTMLInputElement {
  const el = document.createElement('input')
  el.type = type; el.placeholder = placeholder; el.value = value; el.className = 'inp'
  return el
}
function ta(placeholder: string, value = ''): HTMLTextAreaElement {
  const el = document.createElement('textarea')
  el.placeholder = placeholder; el.value = value; el.className = 'ta'
  return el
}
function btn(label: string, onClick: () => void, cls = 'btn'): HTMLButtonElement {
  const b = document.createElement('button')
  b.textContent = label; b.className = cls; b.onclick = onClick; return b
}

// ── Content script bridge ─────────────────────────────────────────────────────
async function getActiveTabId(): Promise<number | null> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
  return tab?.id ?? null
}

async function ensureContentScript(tabId: number): Promise<void> {
  try { await chrome.scripting.executeScript({ target: { tabId }, files: ['content.js'] }) } catch { /* already injected */ }
  await new Promise(r => setTimeout(r, 150))
}

// ── Main scrape + AI extract flow ─────────────────────────────────────────────
async function scrapeAndExtract(): Promise<void> {
  const config = getState().aiConfig
  if (!config) { setState({ error: 'Add your API key in the Settings tab first', loading: false }); return }

  const tabId = await getActiveTabId()
  if (!tabId) { setState({ error: 'No active tab', loading: false }); return }

  await ensureContentScript(tabId)

  setState({ loadingMsg: 'Reading page…' })
  let raw: { rawText: string; url: string; pageTitle: string }
  try {
    const res = await chrome.tabs.sendMessage(tabId, { type: 'SCRAPE_RAW' }) as { ok: boolean; data: typeof raw }
    if (!res?.ok) throw new Error('Content script did not respond')
    raw = res.data
  } catch (e) {
    setState({ error: `Could not read page: ${e instanceof Error ? e.message : 'unknown'}`, loading: false })
    return
  }

  setState({ loadingMsg: 'AI is extracting job details…' })
  try {
    const jd: JD = await extractJD(config, raw.rawText, raw.url)
    if (!jd.title && !jd.description) throw new Error('No job info found on this page')

    // Also grab contacts
    const cRes = await chrome.tabs.sendMessage(tabId, { type: 'SCRAPE_CONTACTS' }) as { ok: boolean; data: { name: string; linkedin: string }[] }
    setState({ jd, contacts: cRes?.ok ? cRes.data : [], error: '', loading: false, loadingMsg: '' })
    render()
  } catch (e) {
    setState({ error: `AI extraction failed: ${e instanceof Error ? e.message : 'unknown'}`, loading: false, loadingMsg: '' })
  }
}

// ── Panels ────────────────────────────────────────────────────────────────────
function renderSettings(): HTMLElement {
  const s = getState()
  const wrap = h('div', 'tab-content')
  wrap.append(h('h3', 'section-title', 'AI Provider'))

  const PROVIDERS = [
    { label: 'Anthropic', url: 'https://api.anthropic.com/v1', hint: 'sk-ant-…' },
    { label: 'OpenAI', url: 'https://api.openai.com/v1', hint: 'sk-…' },
    { label: 'OpenRouter', url: 'https://openrouter.ai/api/v1', hint: 'sk-or-…' },
  ]

  const current = s.aiConfig
  let selectedProvider = PROVIDERS.find(p => p.url === current?.provider) ?? PROVIDERS[0]

  // Provider pills
  const pillRow = h('div', 'pill-row')
  const pills: HTMLButtonElement[] = []
  PROVIDERS.forEach(p => {
    const pill = btn(p.label, () => {
      selectedProvider = p
      pills.forEach((b, i) => b.className = PROVIDERS[i].url === p.url ? 'pill active' : 'pill')
      modelEl.placeholder = p.url.includes('anthropic') ? 'claude-sonnet-4-6' : 'gpt-4o'
      keyEl.placeholder = p.hint
    }, selectedProvider.url === p.url ? 'pill active' : 'pill')
    pills.push(pill)
    pillRow.append(pill)
  })

  const keyEl = inp('password', selectedProvider.hint, '')
  keyEl.autocomplete = 'off'
  const modelEl = inp('text', 'claude-sonnet-4-6', current?.model ?? 'claude-sonnet-4-6')
  const statusEl = h('p', current ? 'status ok' : 'status', current ? '✓ API key saved' : 'No key saved yet')
  const errEl = h('p', 'err')

  const saveBtn = btn('Save & test', async () => {
    const key = keyEl.value.trim() || current?.apiKey || ''
    if (!key) { errEl.textContent = 'Enter an API key'; return }
    saveBtn.textContent = 'Testing…'; saveBtn.disabled = true; errEl.textContent = ''
    const config: AIConfig = { apiKey: key, provider: selectedProvider.url, model: modelEl.value.trim() || 'claude-sonnet-4-6' }
    try {
      // Quick test call
      await fetch(`${config.provider.replace(/\/$/, '')}/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}`, 'x-api-key': key, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({ model: config.model, max_tokens: 5, messages: [{ role: 'user', content: 'hi' }] }),
      })
      await saveAIConfig(config)
      statusEl.textContent = '✓ API key saved & working'; statusEl.className = 'status ok'
      keyEl.value = ''
    } catch (e) {
      errEl.textContent = e instanceof Error ? e.message : 'Test failed'
    } finally { saveBtn.textContent = 'Save & test'; saveBtn.disabled = false }
  }, 'btn primary')

  wrap.append(
    h('p', 'sub', 'Your key is stored in chrome.storage.sync — never sent to any server except your chosen provider.'),
    pillRow,
    h('label', 'lbl', 'API Key'),
    keyEl,
    h('label', 'lbl', 'Model'),
    modelEl,
    statusEl,
    errEl,
    saveBtn,
  )
  return wrap
}

function renderResume(): HTMLElement {
  const s = getState()
  const wrap = h('div', 'tab-content')

  // Scrape button
  const scrapeBtn = btn('Scrape & extract JD with AI', async () => {
    if (!s.aiConfig) { setState({ error: 'Add API key in Settings first' }); render(); return }
    setState({ loading: true, error: '', jd: null })
    render()
    await scrapeAndExtract()
  }, 'btn primary full')

  const errEl = s.error ? h('p', 'err', s.error) : null
  wrap.append(h('h3', 'section-title', 'Job description'), scrapeBtn)
  if (errEl) wrap.append(errEl)

  if (s.jd) {
    const jd = s.jd
    const meta = h('div', 'jd-meta')
    meta.append(h('strong', '', jd.title || '—'))
    if (jd.company) meta.append(document.createTextNode(` @ ${jd.company}`))
    const charCount = h('span', 'chars', `${jd.description.length.toLocaleString()} chars`)
    meta.append(charCount)

    if (jd.skills.length) {
      const skills = h('div', 'tags')
      jd.skills.slice(0, 8).forEach(sk => skills.append(h('span', 'tag', sk)))
      wrap.append(meta, skills)
    } else {
      wrap.append(meta)
    }

    // Base resume input
    const resumeLbl = h('label', 'lbl', 'Your base resume (paste here)')
    const resumeEl = ta('Paste your resume here…', s.tailored ? '' : '')
    resumeEl.rows = 6

    const tailorBtn = btn('Tailor resume with AI', async () => {
      const base = resumeEl.value.trim()
      if (!base) { alert('Paste your base resume above first'); return }
      setState({ loading: true, loadingMsg: 'Tailoring resume…' }); render()
      try {
        const result = await tailorResume(s.aiConfig!, jd, base)
        setState({ tailored: result, loading: false, loadingMsg: '' }); render()
      } catch (e) { setState({ loading: false, loadingMsg: '', error: e instanceof Error ? e.message : 'Error' }); render() }
    }, 'btn primary')

    wrap.append(resumeLbl, resumeEl, tailorBtn)
  }

  if (s.tailored) {
    wrap.append(h('h3', 'section-title', 'Tailored resume'))
    const out = ta('', s.tailored); out.rows = 10
    const row = h('div', 'row')
    row.append(
      btn('Copy', () => navigator.clipboard.writeText(s.tailored)),
      btn('Save application', async () => {
        if (!s.jd) return
        try {
          const token = localStorage.getItem('jp_token')
          await fetch('http://localhost:3001/applications', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
            body: JSON.stringify({ role: s.jd.title, company: s.jd.company, url: s.jd.url, source: 'extension', status: 'applied', tailoredResume: s.tailored }),
          })
          alert('Saved to tracker!')
        } catch { alert('Could not save — is the backend running?') }
      }),
    )
    wrap.append(out, row)
  }

  return wrap
}

function renderOutreach(): HTMLElement {
  const s = getState()
  const wrap = h('div', 'tab-content')
  wrap.append(h('h3', 'section-title', 'Referral outreach'))

  if (!s.jd) { wrap.append(h('p', 'sub', 'Scrape a job first from the Resume tab')); return wrap }

  const genBtn = btn('Generate message with AI', async () => {
    setState({ loading: true, loadingMsg: 'Writing outreach…' }); render()
    try {
      const msg = await generateOutreach(s.aiConfig!, s.jd!, s.contacts)
      setState({ outreachMsg: msg, loading: false, loadingMsg: '' }); render()
    } catch (e) { setState({ loading: false, loadingMsg: '', error: e instanceof Error ? e.message : 'Error' }); render() }
  }, 'btn primary')
  wrap.append(genBtn)

  if (s.contacts.length) {
    const cl = h('div', 'contact-list')
    cl.append(h('p', 'sub', `${s.contacts.length} contact(s) found on page`))
    s.contacts.slice(0, 3).forEach(c => {
      const a = document.createElement('a'); a.href = c.linkedin; a.target = '_blank'; a.textContent = c.name; a.className = 'contact-link'
      cl.append(a)
    })
    wrap.append(cl)
  }

  if (s.outreachMsg) {
    const msgEl = ta('', s.outreachMsg); msgEl.rows = 8
    wrap.append(msgEl, btn('Copy', () => navigator.clipboard.writeText(s.outreachMsg)))
  }

  return wrap
}

function renderTracker(): HTMLElement {
  const wrap = h('div', 'tab-content')
  wrap.append(h('h3', 'section-title', 'Application tracker'))
  wrap.append(h('p', 'sub', 'Manage all saved applications in the web dashboard.'))
  wrap.append(btn('Open dashboard', () => chrome.tabs.create({ url: 'http://localhost:5173/applications' }), 'btn primary'))
  return wrap
}

// ── Shell ─────────────────────────────────────────────────────────────────────
function renderLogin(): HTMLElement {
  const wrap = h('div', 'login-card')
  wrap.append(h('div', 'logo', 'JP'), h('h2', '', 'JobPilot'), h('p', 'sub', 'Sign in to save applications'))
  const emailEl = inp('email', 'Email')
  const passEl = inp('password', 'Password')
  const errEl = h('p', 'err')
  const submitBtn = btn('Sign in', async () => {
    errEl.textContent = ''; submitBtn.disabled = true
    try {
      const res = await fetch('http://localhost:3001/auth/login', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: emailEl.value, password: passEl.value }),
      })
      const json = await res.json() as { success: boolean; data: { token: string } }
      if (!json.success) throw new Error('Invalid credentials')
      setToken(json.data.token, emailEl.value)
    } catch { errEl.textContent = 'Login failed' }
    finally { submitBtn.disabled = false }
  }, 'btn primary full')
  const skip = btn('Skip (use without account)', () => { setState({ token: 'guest' }); render() }, 'btn ghost full')
  wrap.append(emailEl, passEl, errEl, submitBtn, skip)
  return wrap
}

function renderTabs(): HTMLElement {
  const s = getState()
  const tabs: Array<{ id: typeof s.activeTab; label: string }> = [
    { id: 'resume', label: 'Resume' },
    { id: 'outreach', label: 'Outreach' },
    { id: 'tracker', label: 'Tracker' },
    { id: 'settings', label: '⚙' },
  ]
  const nav = h('nav', 'tabs')
  tabs.forEach(t => {
    nav.append(btn(t.label, () => { setState({ activeTab: t.id, error: '' }); render() }, s.activeTab === t.id ? 'tab active' : 'tab'))
  })
  return nav
}

function renderMain(): HTMLElement {
  const s = getState()
  const wrap = h('div', 'app')
  const header = h('header', 'header')
  header.append(h('div', 'logo-sm', 'JP'), h('span', 'title', 'JobPilot'))
  if (!s.aiConfig) header.append(h('span', 'warn-badge', '! key missing'))
  if (s.token !== 'guest') header.append(btn('Sign out', () => { logout(); render() }, 'btn ghost'))
  wrap.append(header, renderTabs())

  if (s.loading) {
    wrap.append(h('div', 'loading', s.loadingMsg || 'Working…'))
    return wrap
  }

  const content = h('div', 'content')
  if (s.activeTab === 'resume') content.append(renderResume())
  else if (s.activeTab === 'outreach') content.append(renderOutreach())
  else if (s.activeTab === 'tracker') content.append(renderTracker())
  else content.append(renderSettings())
  wrap.append(content)
  return wrap
}

function render() {
  const s = getState()
  root.innerHTML = ''
  root.append(s.token ? renderMain() : renderLogin())
}

document.addEventListener('DOMContentLoaded', async () => {
  root = document.getElementById('root')!
  subscribe(render)
  await loadAIConfig()
  render()
})
