function scrapeRaw(): { rawText: string; url: string; pageTitle: string } {
  // For LinkedIn, target the job detail panel specifically — avoids nav/sidebar noise
  const jobDetail =
    document.querySelector('.jobs-search__job-details') ||
    document.querySelector('.scaffold-layout__detail') ||
    document.querySelector('[data-view-name*="job-details"]') ||
    document.querySelector('.jobs-details') ||
    document.querySelector('main')

  const rawText = (jobDetail ?? document.body).innerText.slice(0, 20000)

  return { rawText, url: location.href, pageTitle: document.title }
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
    reply({ ok: true, data: scrapeRaw() })
    return true
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
