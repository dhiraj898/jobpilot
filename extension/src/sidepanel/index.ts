import { getState, setState, subscribe, setToken, logout } from './store'
import type { JD } from './store'
import { api } from './api'

// TODO: Before shipping to production, ensure APP_URL_DEFINE is set via esbuild
// --define:APP_URL_DEFINE='"https://jobpilot.app"' in the production build command.
// In development it falls back to localhost.
declare const APP_URL_DEFINE: string
const APP_URL = (typeof APP_URL_DEFINE !== 'undefined' ? APP_URL_DEFINE : 'http://localhost:5173')

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

// ── Status bar ────────────────────────────────────────────────────────────────
// Steps shown during tailor flow
const STATUS_STEPS = [
  'Reading page…',
  'Extracting job details…',
  'Tailoring resume…',
  'Downloading…',
  'Done!',
]

function renderStatusBar(msg: string): HTMLElement {
  const bar = h('div', 'status-bar')
  // Show which step we're on based on message content
  const stepEl = h('div', 'status-step', msg)
  const spinner = h('span', 'spinner', '')
  bar.append(spinner, stepEl)
  return bar
}

// ── Success banner ────────────────────────────────────────────────────────────
function showSuccessBanner(message: string): void {
  const existing = document.querySelector('.success-banner')
  if (existing) existing.remove()

  const banner = h('div', 'success-banner', message)
  const closeBtn = btn('×', () => banner.remove(), 'banner-close')
  banner.append(closeBtn)
  document.body.append(banner)

  setTimeout(() => {
    if (document.body.contains(banner)) banner.remove()
  }, 5000)
}

// ── Content script bridge ─────────────────────────────────────────────────────
async function getActiveTab(): Promise<chrome.tabs.Tab | null> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
  return tab ?? null
}

// Synchronous scrape — called repeatedly from sidepanel until content is ready
function pageScrapeOnce(): { rawText: string; url: string; ready: boolean } {
  const txt = (el: Element | null) => el ? ((el as HTMLElement).innerText || el.textContent || '').trim() : ''

  // Try common job-description container selectors across platforms
  const descSelectors = [
    // LinkedIn
    '.jobs-description__content', '.jobs-description-content__text',
    '.jobs-box__html-content', '[class*="jobs-description"]',
    // Greenhouse
    '#content', '.job__description', '[class*="job-description"]',
    // Lever
    '.posting-page', '.content-wrapper',
    // Workday
    '[data-automation-id="jobPostingDescription"]',
    // Ashby
    '[class*="job-posting"]', '[class*="jobPosting"]',
    // Generic
    '[class*="description"]', '[class*="job-detail"]', 'article', 'main',
  ]

  // Try to find a specific description container
  for (const sel of descSelectors) {
    const el = document.querySelector(sel)
    const t = txt(el)
    if (t.length > 200) {
      // Also grab the page title / h1 for context
      const h1 = txt(document.querySelector('h1'))
      const combined = (h1 ? `JOB TITLE: ${h1}\n\n` : '') + t
      return { rawText: combined.slice(0, 20000), url: location.href, ready: true }
    }
  }

  // Universal fallback: grab everything visible on the page
  // Remove script/style/nav noise first
  const clone = document.body.cloneNode(true) as HTMLElement
  clone.querySelectorAll('script, style, noscript, svg, [aria-hidden="true"]').forEach(el => el.remove())
  const bodyText = (clone.innerText || document.body.innerText || '').trim()
  // Always returns ready: true — fallback to full body text
  return { rawText: bodyText.slice(0, 20000), url: location.href, ready: true }
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

  // Step 1: Reading page
  setState({ loading: true, loadingMsg: STATUS_STEPS[0] })

  // Poll until the job description is in the DOM (up to 8s)
  let raw: { rawText: string; url: string } = { rawText: '', url: '' }
  const deadline = Date.now() + 8000
  while (true) {
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
      // pageScrapeOnce always returns ready: true now
      if (snap.ready) { raw = snap; break }
      if (Date.now() >= deadline) { raw = snap; break }
      await new Promise(r => setTimeout(r, 400))
    } catch (e) {
      setState({ error: `Could not read page: ${e instanceof Error ? e.message : 'unknown'}`, loading: false, loadingMsg: '' })
      return
    }
  }

  if (!raw.rawText || raw.rawText.length < 50) {
    setState({ error: 'Could not read job content — scroll the job description into view and try again.', loading: false, loadingMsg: '' })
    return
  }

  // Step 2: Extracting job details
  setState({ loadingMsg: `${STATUS_STEPS[1]} (${raw.rawText.length} chars read)` })
  try {
    const jd = await api.extractJD(raw.rawText, raw.url)
    if (!jd.title && !jd.description) throw new Error(`No job info found — try scrolling the job description into view first`)

    const [cResult] = await chrome.scripting.executeScript({ target: { tabId }, func: pageContactScraper, world: 'MAIN' })
    setState({ jd, contacts: cResult?.result ?? [], error: '', loading: false, loadingMsg: '' })
    render()
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'unknown'
    setState({ error: `AI extraction failed: ${msg}`, loading: false, loadingMsg: '' })
  }
}

// ── Panels ────────────────────────────────────────────────────────────────────
function renderResume(): HTMLElement {
  const s = getState()
  const wrap = h('div', 'tab-content')

  // ── Step 1: Scrape ──────────────────────────────────────────────────────────
  const scrapeBtn = btn('⟳ Scrape & extract JD with AI', async () => {
    setState({ loading: true, error: '', jd: null, tailored: '', tailoredPayload: null, scoreBefore: null, scoreAfter: null, delta: null, changeLog: [], loadingMsg: '' })
    render()
    await scrapeAndExtract()
    render()
  }, 'btn primary full')
  wrap.append(scrapeBtn)
  if (s.error) {
    const errEl = h('div', 'err-block')
    errEl.append(h('p', 'err', s.error))

    // Handle "No resume on file" error with helpful guidance
    if (s.error.toLowerCase().includes('no resume') || s.error.toLowerCase().includes('no base resume') || s.error.toLowerCase().includes('no cv')) {
      const guideMsg = h('p', 'err-guide', 'Upload your base resume first — open the JobPilot app and go to Profile.')
      const openAppBtn = btn('Open JobPilot → Profile', () => {
        chrome.tabs.create({ url: `${APP_URL}/profile` })
      }, 'btn primary')
      errEl.append(guideMsg, openAppBtn)
    }

    wrap.append(errEl)
  }

  // ── Step 2: JD Preview (title + company confirmation) ──────────────────────
  if (s.jd) {
    const jd = s.jd

    // JD confirmation card with re-scrape option
    const confirmCard = h('div', 'jd-confirm-card')
    const confirmHeader = h('div', 'jd-confirm-header')
    confirmHeader.append(h('span', 'jd-confirm-label', 'Extracted job:'))
    const reScrapeBtn = btn('Looks wrong? Re-scrape', async () => {
      setState({ loading: true, error: '', jd: null, tailored: '', tailoredPayload: null, scoreBefore: null, scoreAfter: null, delta: null, changeLog: [], loadingMsg: '' })
      render()
      await scrapeAndExtract()
      render()
    }, 'btn ghost-sm')
    confirmHeader.append(reScrapeBtn)
    confirmCard.append(confirmHeader)

    const jobLine = h('div', 'jd-confirm-job')
    if (jd.title) jobLine.append(h('strong', 'jd-confirm-title', jd.title))
    if (jd.company) jobLine.append(h('span', 'jd-confirm-company', ` @ ${jd.company}`))
    confirmCard.append(jobLine)
    wrap.append(confirmCard)

    // Full JD display card
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

    if (s.baseResume) {
      const resumeStatus = h('div', 'resume-status')
      resumeStatus.append(h('span', 'resume-ok', '✓ Resume loaded from your profile'))
      const swapBtn = btn('Use different CV', () => {
        setState({ baseResume: '' }); render()
      }, 'btn ghost-sm')
      resumeStatus.append(swapBtn)
      wrap.append(resumeStatus)
    } else {
      wrap.append(h('p', 'lbl', 'Paste your CV / resume'))
      const resumeEl = ta('Paste your CV here… (or upload it in the dashboard Profile page)')
      resumeEl.rows = 5
      resumeEl.oninput = () => setState({ baseResume: resumeEl.value })
      wrap.append(resumeEl)
    }

    const isTailored = !!s.tailored
    const tailorLabel = isTailored ? '↺ Re-tailor for this role' : 'Redraft CV with AI →'
    const tailorBtn = btn(tailorLabel, async () => {
      const base = s.baseResume.trim()
      if (!base) {
        // Show helpful "No resume" error with link to profile
        setState({
          error: 'No CV found — upload your resume on the Profile page first.',
        })
        render()
        return
      }
      // Step 3: Tailoring resume
      setState({ loading: true, loadingMsg: STATUS_STEPS[2] }); render()
      try {
        const result = await api.tailorResume(
          jd.description, base, jd.title, jd.company,
          s.tailoredPayload // pass previous payload on re-tailor
        )
        setState({
          tailored: result.tailoredResume || result.tailored,
          tailoredPayload: result.tailoredPayload,
          scoreBefore: result.scoreBefore,
          scoreAfter: result.scoreAfter,
          delta: result.delta,
          changeLog: result.changeLog,
          loading: false, loadingMsg: '',
        }); render()
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'Tailoring failed'
        setState({ loading: false, loadingMsg: '', error: msg }); render()
      }
    }, 'btn primary full')
    wrap.append(tailorBtn)
  }

  // ── Step 4: Tailored output ──────────────────────────────────────────────────
  if (s.tailored && s.scoreBefore && s.scoreAfter) {
    const divider2 = h('div', 'section-divider success')
    divider2.append(h('span', '', '✓ CV Tailored'))
    wrap.append(divider2)

    // ── Score card ──────────────────────────────────────────────────────────
    const card = h('div', 'score-card')

    function scoreRow(label: string, score: number, highlight: boolean) {
      const row = h('div', 'score-row')
      row.append(h('span', 'score-label', label))
      const track = h('div', 'score-bar-track')
      const fill = h('div', highlight ? 'score-bar-fill after' : 'score-bar-fill')
      fill.style.width = `${score}%`
      track.append(fill)
      row.append(track)
      row.append(h('span', highlight ? 'score-num after' : 'score-num', `${score}%`))
      return row
    }

    card.append(scoreRow('Before', s.scoreBefore.score, false))
    card.append(scoreRow('After', s.scoreAfter.score, true))

    const delta = s.delta ?? 0
    if (delta !== 0) {
      card.append(h('div', delta > 0 ? 'score-delta positive' : 'score-delta negative',
        `${delta > 0 ? '+' : ''}${delta}% match improvement`))
    }

    // Keywords added
    const added = s.scoreAfter.matchedKeywords.filter(k => !s.scoreBefore!.matchedKeywords.includes(k))
    if (added.length) {
      const kw = h('div', 'kw-section')
      kw.append(h('span', 'kw-label', 'Keywords added:'))
      const tags = h('div', 'tags')
      added.slice(0, 8).forEach(k => tags.append(h('span', 'tag kw-added', k)))
      kw.append(tags)
      card.append(kw)
    }

    if (s.scoreAfter.missingKeywords.length) {
      const miss = h('div', 'kw-section')
      miss.append(h('span', 'kw-label missing', 'Still missing:'))
      const tags = h('div', 'tags')
      s.scoreAfter.missingKeywords.slice(0, 5).forEach(k => tags.append(h('span', 'tag kw-missing', k)))
      miss.append(tags)
      card.append(miss)
    }

    if (s.changeLog?.length) {
      const log = h('div', 'change-log')
      s.changeLog.forEach(entry => log.append(h('div', 'change-entry', `· ${entry}`)))
      card.append(log)
    }

    wrap.append(card)

    // ── Actions ─────────────────────────────────────────────────────────────
    const dlBtn = btn('⬇ Download .docx', async () => {
      setState({ loading: true, loadingMsg: STATUS_STEPS[3] }); render()
      try {
        const role = s.jd?.title || 'resume'
        const co = s.jd?.company || ''
        const filename = `${role}${co ? '-' + co : ''}-tailored`.replace(/\s+/g, '-').toLowerCase()
        await api.downloadResume(s.tailored, filename, s.tailoredPayload)
        setState({ loading: false, loadingMsg: '' }); render()
        // Show green success banner
        showSuccessBanner('Resume downloaded! Check your Downloads folder.')
      } catch (e) {
        setState({ loading: false, loadingMsg: '', error: e instanceof Error ? e.message : 'Could not generate document — try again' }); render()
      }
    }, 'btn primary full')

    const secondRow = h('div', 'row')
    const copyBtn = btn('Copy text', () => {
      navigator.clipboard.writeText(s.tailored)
      copyBtn.textContent = 'Copied!'
      setTimeout(() => { copyBtn.textContent = 'Copy text' }, 2000)
    }, 'btn ghost')
    const saveBtn = btn('Save to tracker', async () => {
      if (!s.jd) return
      try {
        await api.saveApp({ role: s.jd.title, company: s.jd.company, url: s.jd.url, source: 'extension', status: 'saved', tailoredResume: s.tailored })
        saveBtn.textContent = 'Saved!'
        setTimeout(() => { saveBtn.textContent = 'Save to tracker' }, 2000)
      } catch { alert('Could not save — are you signed in?') }
    }, 'btn ghost')

    secondRow.append(copyBtn, saveBtn)
    wrap.append(dlBtn, secondRow)
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
  wrap.append(btn('Open dashboard', () => chrome.tabs.create({ url: `${APP_URL}/applications` }), 'btn primary'))
  return wrap
}

function renderSettings(): HTMLElement {
  const wrap = h('div', 'tab-content')
  wrap.append(h('h3', 'section-title', 'AI settings'))
  wrap.append(h('p', 'sub', 'API key and model are configured in the web dashboard Settings page. Your key is stored encrypted in the database.'))
  wrap.append(btn('Open dashboard settings', () => chrome.tabs.create({ url: `${APP_URL}/settings` }), 'btn primary'))
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
      loadProfile()
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
    const loadingWrap = h('div', 'loading-wrap')
    loadingWrap.append(renderStatusBar(s.loadingMsg || 'Working…'))
    wrap.append(loadingWrap)
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

async function loadProfile() {
  try {
    const profile = await api.profile() as { resumeText?: string; name?: string }
    if (profile.resumeText) setState({ baseResume: profile.resumeText })
    if (profile.name) setState({ profileName: profile.name })
  } catch { /* not logged in yet */ }
}

document.addEventListener('DOMContentLoaded', () => {
  root = document.getElementById('root')!
  subscribe(render)
  render()
  if (getState().token) loadProfile()

  // Clear cached JD whenever the active tab URL changes (any SPA navigation = different job)
  let lastTabUrl: string | null = null

  async function checkTabUrl() {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
    if (!tab?.url) return
    if (tab.url !== lastTabUrl) {
      lastTabUrl = tab.url
      if (getState().jd) {
        setState({ jd: null, tailored: '', tailoredPayload: null, scoreBefore: null, scoreAfter: null, delta: null, changeLog: [], contacts: [], error: '', outreachMsg: '' })
        render()
      }
    }
  }

  checkTabUrl()
  chrome.tabs.onActivated.addListener(() => checkTabUrl())
  chrome.tabs.onUpdated.addListener((_tabId, info) => { if (info.url) checkTabUrl() })
})
