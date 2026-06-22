// Content script — only handles AUTOFILL. Scraping is done via executeScript in the sidepanel.

chrome.runtime.onMessage.addListener((msg, _sender, reply) => {
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
