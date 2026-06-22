import { getState, setState, subscribe, setToken, logout } from './store'
import type { JD } from './store'
import { api } from './api'

let root: HTMLElement

// ── DOM helpers ───────────────────────────────────────────────────────────────
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

// ── Scrape + AI extract (via backend / DB key) ────────────────────────────────
async function scrapeAndExtract(): Promise<void> {
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
    setState({ error: `Could not read page: ${e instanceof Error ? e.message : 'unknown'}`, loading: false, loadingMsg: '' })
    return
  }

  setState({ loadingMsg: 'AI is extracting job details…' })
  try {
    const jd = await api.extractJD(raw.rawText, raw.url)
    if (!jd.title && !jd.description) throw new Error('No job info found on this page')

    const cRes = await chrome.tabs.sendMessage(tabId, { type: 'SCRAPE_CONTACTS' }) as { ok: boolean; data: { name: string; linkedin: string }[] }
    setState({ jd, contacts: cRes?.ok ? cRes.data : [], error: '', loading: false, loadingMsg: '' })
    render()
  } catch (e) {
    setState({ error: `AI extraction failed: ${e instanceof Error ? e.message : 'unknown'}`, loading: false, loadingMsg: '' })
  }
}

// ── Panels ────────────────────────────────────────────────────────────────────
function renderResume(): HTMLElement {
  const s = getState()
  const wrap = h('div', 'tab-content')

  const scrapeBtn = btn('Scrape & extract JD with AI', async () => {
    setState({ loading: true, error: '', jd: null, loadingMsg: '' })
    render()
    await scrapeAndExtract()
  }, 'btn primary full')

  wrap.append(h('h3', 'section-title', 'Job description'), scrapeBtn)
  if (s.error) wrap.append(h('p', 'err', s.error))

  if (s.jd) {
    const jd = s.jd
    const meta = h('div', 'jd-meta')
    meta.append(h('strong', '', jd.title || '—'))
    if (jd.company) meta.append(document.createTextNode(` @ ${jd.company}`))
    meta.append(h('span', 'chars', `${jd.description.length.toLocaleString()} chars captured`))
    wrap.append(meta)

    if (jd.skills.length) {
      const tags = h('div', 'tags')
      jd.skills.slice(0, 8).forEach(sk => tags.append(h('span', 'tag', sk)))
      wrap.append(tags)
    }

    wrap.append(h('label', 'lbl', 'Your base resume (paste here)'))
    const resumeEl = ta('Paste your resume here…')
    resumeEl.rows = 6
    wrap.append(resumeEl)

    const tailorBtn = btn('Tailor resume with AI', async () => {
      const base = resumeEl.value.trim()
      if (!base) { alert('Paste your base resume above first'); return }
      setState({ loading: true, loadingMsg: 'Tailoring resume…' }); render()
      try {
        const result = await api.tailorResume(jd.description, base)
        setState({ tailored: result.tailored, loading: false, loadingMsg: '' }); render()
      } catch (e) {
        setState({ loading: false, loadingMsg: '', error: e instanceof Error ? e.message : 'Error' }); render()
      }
    }, 'btn primary')
    wrap.append(tailorBtn)
  }

  if (s.tailored) {
    wrap.append(h('h3', 'section-title', 'Tailored resume'))
    const out = ta('', s.tailored); out.rows = 10
    const row = h('div', 'row')
    row.append(
      btn('Copy', () => navigator.clipboard.writeText(s.tailored)),
      btn('Save to tracker', async () => {
        if (!s.jd) return
        try {
          await api.saveApp({ role: s.jd.title, company: s.jd.company, url: s.jd.url, source: 'extension', status: 'applied', tailoredResume: s.tailored })
          alert('Saved!')
        } catch { alert('Could not save — are you signed in?') }
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

  if (!s.jd) {
    wrap.append(h('p', 'sub', 'Scrape a job first from the Resume tab'))
    return wrap
  }

  const genBtn = btn('Generate message with AI', async () => {
    setState({ loading: true, loadingMsg: 'Writing outreach…' }); render()
    try {
      const result = await api.outreach(s.jd!.description, s.contacts)
      setState({ outreachMsg: result.message, loading: false, loadingMsg: '' }); render()
    } catch (e) {
      setState({ loading: false, loadingMsg: '', error: e instanceof Error ? e.message : 'Error' }); render()
    }
  }, 'btn primary')
  wrap.append(genBtn)

  if (s.contacts.length) {
    const cl = h('div', 'contact-list')
    cl.append(h('p', 'sub', `${s.contacts.length} contact(s) found on page`))
    s.contacts.slice(0, 3).forEach(c => {
      const a = document.createElement('a')
      a.href = c.linkedin; a.target = '_blank'; a.textContent = c.name; a.className = 'contact-link'
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

function renderSettings(): HTMLElement {
  const wrap = h('div', 'tab-content')
  wrap.append(h('h3', 'section-title', 'AI settings'))
  wrap.append(h('p', 'sub', 'API key and model are configured in the web dashboard Settings page. Your key is stored encrypted in the database.'))
  wrap.append(btn('Open dashboard settings', () => chrome.tabs.create({ url: 'http://localhost:5173/settings' }), 'btn primary'))
  return wrap
}

// ── Shell ─────────────────────────────────────────────────────────────────────
function renderLogin(): HTMLElement {
  const wrap = h('div', 'login-card')
  wrap.append(h('div', 'logo', 'JP'), h('h2', '', 'JobPilot'), h('p', 'sub', 'Sign in to use AI features'))

  const emailEl = inp('email', 'Email')
  const passEl = inp('password', 'Password')
  const errEl = h('p', 'err')

  const submitBtn = btn('Sign in', async () => {
    errEl.textContent = ''; submitBtn.disabled = true
    try {
      const data = await api.login(emailEl.value, passEl.value)
      setToken(data.token, emailEl.value)
      render()
    } catch { errEl.textContent = 'Invalid email or password' }
    finally { submitBtn.disabled = false }
  }, 'btn primary full')

  wrap.append(emailEl, passEl, errEl, submitBtn)
  wrap.append(h('p', 'sub', 'Set your AI provider in the dashboard → Settings after signing in.'))
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
    nav.append(btn(t.label, () => { setState({ activeTab: t.id, error: '' }); render() },
      s.activeTab === t.id ? 'tab active' : 'tab'))
  })
  return nav
}

function renderMain(): HTMLElement {
  const s = getState()
  const wrap = h('div', 'app')
  const header = h('header', 'header')
  header.append(h('div', 'logo-sm', 'JP'), h('span', 'title', 'JobPilot'))
  header.append(btn('Sign out', () => { logout(); render() }, 'btn ghost'))
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

document.addEventListener('DOMContentLoaded', () => {
  root = document.getElementById('root')!
  subscribe(render)
  render()
})
