function scrapeJD(): { title: string; company: string; description: string; url: string } {
  const url = location.href
  const title = document.querySelector('h1')?.textContent?.trim() || document.title
  const company = (
    document.querySelector('[data-company]')?.textContent ||
    document.querySelector('.company-name')?.textContent ||
    document.querySelector('[class*="company"]')?.textContent ||
    ''
  ).trim()
  const bodyText = document.body.innerText.slice(0, 8000)
  return { title, company, description: bodyText, url }
}

function scrapeContacts(): { name: string; title: string; linkedin: string }[] {
  const results: { name: string; title: string; linkedin: string }[] = []
  document.querySelectorAll('a[href*="linkedin.com/in/"]').forEach(el => {
    const href = (el as HTMLAnchorElement).href
    const name = el.textContent?.trim() || ''
    if (name) results.push({ name, title: '', linkedin: href })
  })
  return results
}

chrome.runtime.onMessage.addListener((msg, _sender, reply) => {
  if (msg.type === 'SCRAPE_JD') { reply({ ok: true, data: scrapeJD() }); return true }
  if (msg.type === 'SCRAPE_CONTACTS') { reply({ ok: true, data: scrapeContacts() }); return true }
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
