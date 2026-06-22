function waitForJobContent(timeoutMs = 6000): Promise<void> {
  return new Promise(resolve => {
    const deadline = Date.now() + timeoutMs
    function check() {
      const desc =
        document.querySelector('.jobs-description__content') ||
        document.querySelector('.jobs-description-content__text') ||
        document.querySelector('[class*="jobs-description"]')
      if (desc && (desc as HTMLElement).innerText.trim().length > 50) {
        resolve()
        return
      }
      if (Date.now() < deadline) setTimeout(check, 200)
      else resolve() // timed out — scrape whatever is there
    }
    check()
  })
}

function scrapeRaw(): { rawText: string; url: string; pageTitle: string } {
  // 1. Job title h1
  const titleEl =
    document.querySelector('.job-details-jobs-unified-top-card__job-title') ||
    document.querySelector('h1[class*="job-title"]') ||
    document.querySelector('.jobs-unified-top-card__job-title')

  // 2. Job description — confirmed working selectors first
  const desc =
    document.querySelector('.jobs-description__content') ||
    document.querySelector('.jobs-description-content__text') ||
    document.querySelector('.jobs-description') ||
    document.querySelector('[class*="description__text"]') ||
    document.querySelector('[class*="jobs-description"]')

  // 3. Company / location header
  const header =
    document.querySelector('.job-details-jobs-unified-top-card__primary-description-without-tagline') ||
    document.querySelector('.jobs-unified-top-card__primary-description') ||
    document.querySelector('.jobs-unified-top-card')

  const parts: string[] = []
  if (titleEl) parts.push('JOB TITLE: ' + titleEl.textContent?.trim())
  if (header) parts.push(header.textContent?.trim() || '')
  if (desc) parts.push('JOB DESCRIPTION:\n' + (desc as HTMLElement).innerText.trim())

  let rawText = parts.filter(Boolean).join('\n\n')

  // Fallback: right detail panel only (never whole page)
  if (rawText.length < 100) {
    const rightPanel =
      document.querySelector('.jobs-details') ||
      document.querySelector('.scaffold-layout__detail') ||
      document.querySelector('.jobs-search__job-details') ||
      document.querySelector('.job-view-layout')

    if (rightPanel) {
      rawText = (rightPanel as HTMLElement).innerText.trim()
    }
    // No last-resort whole-page fallback — it pulls in sidebar job list noise
  }

  return { rawText: rawText.slice(0, 20000), url: location.href, pageTitle: document.title }
}

function scrapeContacts(): { name: string; linkedin: string }[] {
  const results: { name: string; linkedin: string }[] = []
  document.querySelectorAll('a[href*="linkedin.com/in/"]').forEach(el => {
    const href = (el as HTMLAnchorElement).href
    const name = el.textContent?.trim() || ''
    if (name && href) results.push({ name, linkedin: href })
  })
  return results
}

chrome.runtime.onMessage.addListener((msg, _sender, reply) => {
  if (msg.type === 'SCRAPE_RAW') {
    waitForJobContent().then(() => {
      reply({ ok: true, data: scrapeRaw() })
    })
    return true // keep message channel open for async reply
  }
  if (msg.type === 'SCRAPE_CONTACTS') {
    reply({ ok: true, data: scrapeContacts() })
    return true
  }
  if (msg.type === 'AUTOFILL') {
    const fields = msg.data as Record<string, string>
    Object.entries(fields).forEach(([selector, value]) => {
      const el = document.querySelector(selector) as HTMLInputElement | null
      if (el) { el.value = value; el.dispatchEvent(new Event('input', { bubbles: true })) }
    })
    reply({ ok: true })
    return true
  }
})
