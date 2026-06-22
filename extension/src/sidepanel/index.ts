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
async function getActiveTab(): Promise<chrome.tabs.Tab | null> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
  return tab ?? null
}

// Synchronous scrape — called repeatedly from sidepanel until content is ready
function pageScrapeOnce(): { rawText: string; url: string; ready: boolean } {
  const desc =
    (document.querySelector('.jobs-description__content') as HTMLElement | null) ||
    (document.querySelector('.jobs-description-content__text') as HTMLElement | null)

  const descText = desc ? (desc.innerText || desc.textContent || '').trim() : ''

  if (descText.length > 80) {
    const titleEl =
      document.querySelector('.job-details-jobs-unified-top-card__job-title') ||
      document.querySelector('[class*="job-details"] h1') ||
      document.querySelector('.jobs-unified-top-card__job-title')
    const header =
      document.querySelector('.job-details-jobs-unified-top-card__primary-description-without-tagline') ||
      document.querySelector('.jobs-unified-top-card__primary-description')

    const parts: string[] = []
    if (titleEl) parts.push('JOB TITLE: ' + (titleEl.textContent || '').trim())
    if (header) parts.push((header.textContent || '').trim())
    parts.push('JOB DESCRIPTION:\n' + descText)
    return { rawText: parts.join('\n\n').slice(0, 20000), url: location.href, ready: true }
  }

  // Fallback: right-panel clone stripped of sidebar
  const panel =
    (document.querySelector('.jobs-details') as HTMLElement | null) ||
    (document.querySelector('.scaffold-layout__detail') as HTMLElement | null)
  if (panel) {
    const clone = panel.cloneNode(true) as HTMLElement
    clone.querySelectorAll('.jobs-search-results-list, .scaffold-layout__list').forEach(el => el.remove())
    const text = clone.innerText.trim()
    if (text.length > 80) return { rawText: text.slice(0, 20000), url: location.href, ready: true }
  }

  return { rawText: '', url: location.href, ready: false }
}

function pageContactScraper(): { name: string; linkedin: string }[] {
  const results: { name: string; linkedin: string }[] = []
  document.querySelectorAll('a[href*="linkedin.com/in/"]').forEach(el => {
    const href = (el as HTMLAnchorElement).href
    const name = el.textContent?.trim() || ''
    if (name && href) results.push({ name, linkedin: href })
  })
  return results
}

// ── Scrape + AI extract (via backend / DB key) ────────────────────────────────
async function scrapeAndExtract(): Promise<void> {
  const tab = await getActiveTab()
  if (!tab?.id) { setState({ error: 'No active tab', loading: false }); return }
  const tabId = tab.id

  // Poll until the job description is in the DOM (up to 8s)
  let raw: { rawText: string; url: string } = { rawText: '', url: '' }
  const deadline = Date.now() + 8000
  while (true) {
    setState({ loadingMsg: 'Reading page… (waiting for job to load)' })
    try {
      const [result] = await chrome.scripting.executeScript({
        target: { tabId },
        func: pageScrapeOnce,
        world: 'MAIN',
      })
      const snap = result?.result as { rawText: string; url: string; ready: boolean } | null
      if (!snap) {
        setState({ error: `executeScript returned null — result: ${JSON.stringify(result)}`, loading: false, loadingMsg: '' })
        return
      }
      if (snap.ready) { raw = snap; break }
      if (Date.now() >= deadline) { raw = snap; break }
      await new Promise(r => setTimeout(r, 400))
    } catch (e) {
      setState({ error: `Could not read page: ${e instanceof Error ? e.message : 'unknown'}`, loading: false, loadingMsg: '' })
      return
    }
  }

  if (!raw.rawText || raw.rawText.length < 80) {
    setState({ error: 'Could not read job content — scroll the job description into view and try again.', loading: false, loadingMsg: '' })
    return
  }

  setState({ loadingMsg: `AI extracting… (${raw.rawText.length} chars read)` })
  try {
    const jd = await api.extractJD(raw.rawText, raw.url)
    if (!jd.title && !jd.description) throw new Error(`No job info found — try scrolling the job description into view first`)

    const [cResult] = await chrome.scripting.executeScript({ target: { tabId }, func: pageContactScraper, world: 'MAIN' })
    setState({ jd, contacts: cResult?.result ?? [], error: '', loading: false, loadingMsg: '' })
    render()
  } catch (e) {
    setState({ error: `AI extraction failed: ${e instanceof Error ? e.message : 'unknown'}`, loading: false, loadingMsg: '' })
  }
}

// ── Panels ────────────────────────────────────────────────────────────────────
function renderResume(): HTMLElement {
  const s = getState()
  const wrap = h('div', 'tab-content')

  // ── Step 1: Scrape ──────────────────────────────────────────────────────────
  const scrapeBtn = btn('⟳ Scrape & extract JD with AI', async () => {
    setState({ loading: true, error: '', jd: null, tailored: '', loadingMsg: '' })
    render()
    await scrapeAndExtract()
  }, 'btn primary full')
  wrap.append(scrapeBtn)
  if (s.error) wrap.append(h('p', 'err', s.error))

  // ── Step 2: Full JD display ─────────────────────────────────────────────────
  if (s.jd) {
    const jd = s.jd

    // Header card
    const card = h('div', 'jd-card')
    const titleLine = h('div', 'jd-title-line')
    titleLine.append(h('strong', 'jd-role', jd.title || '—'))
    if (jd.company) titleLine.append(h('span', 'jd-company', jd.company))
    card.append(titleLine)
    if ((jd as any).location) card.append(h('span', 'jd-loc', (jd as any).location))
    wrap.append(card)

    // Skills
    if (jd.skills.length) {
      const tags = h('div', 'tags')
      jd.skills.forEach(sk => tags.append(h('span', 'tag', sk)))
      wrap.append(tags)
    }

    // Full description — collapsible
    if (jd.description) {
      const descWrap = h('div', 'jd-desc-wrap')
      const descEl = h('div', 'jd-desc', jd.description)
      let expanded = false
      const toggle = btn('Show full JD ▾', () => {
        expanded = !expanded
        descEl.classList.toggle('expanded', expanded)
        toggle.textContent = expanded ? 'Collapse ▴' : 'Show full JD ▾'
      }, 'btn ghost-sm')
      descWrap.append(descEl, toggle)
      wrap.append(descWrap)
    }

    // Requirements
    if (jd.requirements.length) {
      const reqWrap = h('div', 'req-list')
      reqWrap.append(h('p', 'lbl', 'Requirements'))
      jd.requirements.forEach(r => {
        const li = h('div', 'req-item')
        li.append(document.createTextNode('• ' + r))
        reqWrap.append(li)
      })
      wrap.append(reqWrap)
    }

    // ── Step 3: CV redraft ──────────────────────────────────────────────────────
    const divider = h('div', 'section-divider')
    divider.append(h('span', '', 'Redraft your CV for this role'))
    wrap.append(divider)

    wrap.append(h('p', 'lbl', 'Paste your current CV / resume'))
    const resumeEl = ta('Paste your CV here…')
    resumeEl.rows = 7
    // Restore from state if previously pasted
    if (s.baseResume) resumeEl.value = s.baseResume
    resumeEl.oninput = () => setState({ baseResume: resumeEl.value })
    wrap.append(resumeEl)

    const tailorBtn = btn('Redraft CV with AI →', async () => {
      const base = resumeEl.value.trim()
      if (!base) { resumeEl.focus(); resumeEl.placeholder = 'Paste your CV first!'; return }
      setState({ loading: true, loadingMsg: 'Redrafting CV for this role…' }); render()
      try {
        const result = await api.tailorResume(jd.description, base)
        setState({ tailored: result.tailored, baseResume: base, loading: false, loadingMsg: '' }); render()
      } catch (e) {
        setState({ loading: false, loadingMsg: '', error: e instanceof Error ? e.message : 'Tailoring failed' }); render()
      }
    }, 'btn primary full')
    wrap.append(tailorBtn)
  }

  // ── Step 4: Tailored output ──────────────────────────────────────────────────
  if (s.tailored) {
    const divider2 = h('div', 'section-divider success')
    divider2.append(h('span', '', '✓ Redrafted CV'))
    wrap.append(divider2)

    const out = ta('', s.tailored)
    out.rows = 12
    out.readOnly = true
    wrap.append(out)

    const actions = h('div', 'row')
    const copyBtn = btn('Copy to clipboard', () => {
      navigator.clipboard.writeText(s.tailored)
      copyBtn.textContent = 'Copied!'
      setTimeout(() => { copyBtn.textContent = 'Copy to clipboard' }, 2000)
    }, 'btn primary')
    const saveBtn = btn('Save to tracker', async () => {
      if (!s.jd) return
      try {
        await api.saveApp({ role: s.jd.title, company: s.jd.company, url: s.jd.url, source: 'extension', status: 'saved', tailoredResume: s.tailored })
        saveBtn.textContent = 'Saved!'
        setTimeout(() => { saveBtn.textContent = 'Save to tracker' }, 2000)
      } catch { alert('Could not save — are you signed in?') }
    }, 'btn')
    actions.append(copyBtn, saveBtn)
    wrap.append(actions)
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

  // Clear cached JD whenever the active tab URL changes (any SPA navigation = different job)
  let lastTabUrl: string | null = null

  async function checkTabUrl() {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
    if (!tab?.url) return
    if (tab.url !== lastTabUrl) {
      lastTabUrl = tab.url
      if (getState().jd) {
        setState({ jd: null, tailored: '', contacts: [], error: '', outreachMsg: '' })
        render()
      }
    }
  }

  checkTabUrl()
  chrome.tabs.onActivated.addListener(() => checkTabUrl())
  chrome.tabs.onUpdated.addListener((_tabId, info) => { if (info.url) checkTabUrl() })
})
