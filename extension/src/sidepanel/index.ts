import { getState, setState, subscribe, setToken, logout } from './store'
import { api } from './api'

let root: HTMLElement

function h(tag: string, attrs: Record<string, string> = {}, ...children: (string | HTMLElement)[]): HTMLElement {
  const el = document.createElement(tag)
  Object.entries(attrs).forEach(([k, v]) => {
    if (k === 'className') el.className = v
    else if (k.startsWith('on') && k in window) el.addEventListener(k.slice(2).toLowerCase(), v as unknown as EventListenerOrEventListenerObject)
    else el.setAttribute(k, v)
  })
  children.forEach(c => typeof c === 'string' ? el.appendChild(document.createTextNode(c)) : el.appendChild(c))
  return el
}

function btn(label: string, onClick: () => void, cls = ''): HTMLButtonElement {
  const b = document.createElement('button')
  b.textContent = label
  b.className = `btn ${cls}`
  b.onclick = onClick
  return b
}

function textarea(placeholder: string, value = ''): HTMLTextAreaElement {
  const t = document.createElement('textarea')
  t.placeholder = placeholder
  t.value = value
  t.className = 'ta'
  return t
}

function renderLogin(): HTMLElement {
  const wrap = h('div', { className: 'card' })
  const logo = h('div', { className: 'logo' }, 'JP')
  const title = h('h2', {}, 'JobPilot')
  const sub = h('p', { className: 'sub' }, 'Sign in to get started')
  const emailEl = document.createElement('input')
  emailEl.type = 'email'; emailEl.placeholder = 'Email'; emailEl.className = 'inp'
  const passEl = document.createElement('input')
  passEl.type = 'password'; passEl.placeholder = 'Password'; passEl.className = 'inp'
  const errEl = h('p', { className: 'err' })
  const submitBtn = btn('Sign in', async () => {
    try {
      setState({ loading: true })
      const data = await api.login(emailEl.value, passEl.value)
      setToken(data.token, emailEl.value)
    } catch (e: unknown) {
      errEl.textContent = e instanceof Error ? e.message : 'Login failed'
    } finally { setState({ loading: false }) }
  }, 'primary full')
  wrap.append(logo, title, sub, emailEl, passEl, errEl, submitBtn)
  return wrap
}

async function scrapeCurrentTab(): Promise<void> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
  if (!tab.id) return
  try {
    const res = await chrome.tabs.sendMessage(tab.id, { type: 'SCRAPE_JD' }) as { ok: boolean; data: { title: string; company: string; description: string; url: string } }
    if (res.ok) setState({ jd: res.data })
    const contacts = await chrome.tabs.sendMessage(tab.id, { type: 'SCRAPE_CONTACTS' }) as { ok: boolean; data: { name: string; title: string; linkedin: string }[] }
    if (contacts.ok) setState({ contacts: contacts.data })
  } catch { /* tab may not have content script */ }
}

function renderResume(): HTMLElement {
  const s = getState()
  const wrap = h('div', { className: 'tab-content' })
  const jdSection = h('div', { className: 'section' })
  const scrapeBtn = btn('Scrape JD from page', async () => {
    setState({ loading: true })
    await scrapeCurrentTab()
    setState({ loading: false })
    render()
  })
  jdSection.append(h('h3', {}, 'Job description'), scrapeBtn)
  if (s.jd) {
    jdSection.append(h('p', { className: 'meta' }, `${s.jd.title} @ ${s.jd.company}`))
  }

  const tailorBtn = btn('Tailor resume with AI', async () => {
    if (!s.jd) { alert('Scrape a JD first'); return }
    setState({ loading: true })
    try {
      const res = await api.tailorResume(s.jd.description)
      setState({ tailored: res.tailored })
      render()
    } catch (e: unknown) { alert(e instanceof Error ? e.message : 'Error') }
    finally { setState({ loading: false }) }
  }, 'primary')

  wrap.append(jdSection, tailorBtn)

  if (s.tailored) {
    const out = h('div', { className: 'section' })
    const ta = textarea('Tailored resume will appear here', s.tailored)
    const copyBtn = btn('Copy', () => navigator.clipboard.writeText(s.tailored))
    const saveBtn = btn('Save application', async () => {
      if (!s.jd) return
      await api.saveApp({ role: s.jd.title, company: s.jd.company, url: s.jd.url, source: 'extension', status: 'applied' })
      alert('Saved!')
    })
    out.append(h('h3', {}, 'Tailored resume'), ta, h('div', { className: 'row' }, copyBtn, saveBtn))
    wrap.append(out)
  }
  return wrap
}

function renderOutreach(): HTMLElement {
  const s = getState()
  const wrap = h('div', { className: 'tab-content' })
  const genBtn = btn('Generate outreach', async () => {
    if (!s.jd) { alert('Scrape a JD first'); return }
    setState({ loading: true })
    try {
      const res = await api.outreach(s.jd.description, s.contacts)
      setState({ outreachMsg: res.message })
      render()
    } catch (e: unknown) { alert(e instanceof Error ? e.message : 'Error') }
    finally { setState({ loading: false }) }
  }, 'primary')

  wrap.append(h('h3', {}, 'Referral outreach'), genBtn)

  if (s.outreachMsg) {
    const ta = textarea('Outreach message', s.outreachMsg)
    const copyBtn = btn('Copy', () => navigator.clipboard.writeText(s.outreachMsg))
    wrap.append(ta, copyBtn)
  }
  return wrap
}

function renderApply(): HTMLElement {
  const s = getState()
  const wrap = h('div', { className: 'tab-content' })
  wrap.append(h('h3', {}, 'Auto-fill form'))
  if (!s.jd) {
    wrap.append(h('p', { className: 'sub' }, 'Scrape a JD from the Resume tab first'))
    return wrap
  }
  const fillBtn = btn('Fill common fields', async () => {
    const profile = await api.profile() as Record<string, string>
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
    if (!tab.id) return
    await chrome.tabs.sendMessage(tab.id, {
      type: 'AUTOFILL',
      data: {
        'input[name="firstName"]': (profile.name as string || '').split(' ')[0] || '',
        'input[name="lastName"]': (profile.name as string || '').split(' ').slice(1).join(' ') || '',
        'input[name="email"]': getState().email || '',
        'input[name="phone"]': profile.phone as string || '',
        'textarea[name="coverLetter"]': getState().tailored,
      }
    })
    alert('Fields filled!')
  }, 'primary')
  wrap.append(fillBtn)
  return wrap
}

function renderTracker(): HTMLElement {
  const wrap = h('div', { className: 'tab-content' })
  wrap.append(h('h3', {}, 'Application tracker'))
  const openBtn = btn('Open full tracker', () => { chrome.tabs.create({ url: 'http://localhost:5173/applications' }) })
  wrap.append(h('p', { className: 'sub' }, 'View and manage all applications in the web dashboard.'), openBtn)
  return wrap
}

function renderTabs(): HTMLElement {
  const s = getState()
  const tabs = ['resume', 'outreach', 'apply', 'tracker'] as const
  const nav = h('nav', { className: 'tabs' })
  tabs.forEach(t => {
    const b = btn(t.charAt(0).toUpperCase() + t.slice(1), () => { setState({ activeTab: t }); render() }, s.activeTab === t ? 'tab active' : 'tab')
    nav.append(b)
  })
  return nav
}

function renderMain(): HTMLElement {
  const s = getState()
  const wrap = h('div', { className: 'app' })
  const header = h('header', { className: 'header' })
  const logo = h('div', { className: 'logo-sm' }, 'JP')
  const title = h('span', { className: 'title' }, 'JobPilot')
  const logoutBtn = btn('Sign out', () => { logout(); render() }, 'ghost')
  header.append(logo, title, logoutBtn)
  wrap.append(header, renderTabs())
  if (s.loading) { wrap.append(h('div', { className: 'loading' }, 'Loading…')); return wrap }
  const content = h('div', { className: 'content' })
  if (s.activeTab === 'resume') content.append(renderResume())
  else if (s.activeTab === 'outreach') content.append(renderOutreach())
  else if (s.activeTab === 'apply') content.append(renderApply())
  else content.append(renderTracker())
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
