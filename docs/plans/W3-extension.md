# W3: Chrome Extension Fixes

## Files touched (only these — do not edit others)
- extension/src/sidepanel/api.ts
- extension/src/sidepanel/index.ts
- extension/manifest.json
- extension/build.mjs

## Gate
`cd /Users/dhirajghosal/Documents/AutoResume/jobpilot/extension && node build.mjs`

---

## Task 1 — Inject API base URL at build time (CRITICAL)
**Files:** `extension/build.mjs` and `extension/src/sidepanel/api.ts`

**Step A — build.mjs:** Add `API_BASE_DEFINE` alongside the existing `APP_URL_DEFINE`. Find the `esbuild.build({...})` call for sidepanel and add to its `define` block:

```javascript
define: {
  'APP_URL_DEFINE': JSON.stringify(process.env.APP_URL || 'http://localhost:5173'),
  'API_BASE_DEFINE': JSON.stringify(process.env.API_BASE || 'http://localhost:3001'),
}
```

If `api.ts` is bundled separately or in a different esbuild entry, ensure both entries get the same `define` block. Check all `esbuild.build` calls — every one that processes sidepanel files needs the define.

**Step B — api.ts:** Replace:
```typescript
const BASE = 'http://localhost:3001'
```
With:
```typescript
declare const API_BASE_DEFINE: string
const BASE = typeof API_BASE_DEFINE !== 'undefined' ? API_BASE_DEFINE : 'http://localhost:3001'
```

---

## Task 2 — Add `tabs` permission to manifest
**File:** `extension/manifest.json`

Find the `"permissions"` array:
```json
"permissions": ["sidePanel", "storage", "activeTab", "scripting"]
```

Add `"tabs"`:
```json
"permissions": ["sidePanel", "storage", "activeTab", "scripting", "tabs"]
```

---

## Task 3 — Handle 401 with re-auth redirect
**File:** `extension/src/sidepanel/index.ts`

Currently 401 responses produce "AI extraction failed: Unauthorized" with no way to re-login. Add a helper that detects this and clears the token:

Find where API errors are caught and displayed (look for patterns like `setError(...)` or where the error message is set from a catch block). Add 401 detection in the main API-call error handlers:

```typescript
function handle401(err: Error | string) {
  const msg = typeof err === 'string' ? err : err.message
  if (msg.includes('401') || msg.toLowerCase().includes('unauthorized')) {
    chrome.storage.local.remove(['token', 'user'])
    // Re-render the login view — set the state that controls which view is shown
    setView('login') // or whatever state/function controls the login screen
    return true
  }
  return false
}
```

Call `handle401(error)` in each catch block that currently sets an error string. If it returns true, the login screen shows — don't also set the error string.

The exact function name for controlling the view depends on the current code structure. Read `index.ts` to find the existing state variable that controls login vs main view, then use that.

---

## Task 4 — Fix revokeObjectURL race condition
**File:** `extension/src/sidepanel/api.ts`

Find the download function that calls `URL.revokeObjectURL`. It likely looks like:
```typescript
a.click()
URL.revokeObjectURL(url)
```

Change to:
```typescript
a.click()
setTimeout(() => URL.revokeObjectURL(url), 1000)
```

---

## Task 5 — Replace alert() with proper error state
**File:** `extension/src/sidepanel/index.ts`

Find `alert('Could not save`)` or similar `alert(` calls in the saveApp / save functionality. Replace with the same error-display mechanism used elsewhere in the extension (setError, a toast, or UI state — read the file to see what pattern is used for other errors, then use the same).

---

## Task 6 — Fix LinkedIn scrape timing
**File:** `extension/src/sidepanel/index.ts`

Find the `pageScrapeOnce` call or LinkedIn content-script scraping logic. The issue is that `pageScrapeOnce()` immediately returns `ready: true` before LinkedIn's dynamic job-detail panel has finished loading.

Add a 1500ms delay before the scrape attempt when on a LinkedIn URL:

```typescript
// Wait for LinkedIn's dynamic panel to load before scraping
await new Promise(resolve => setTimeout(resolve, 1500))
const result = await pageScrapeOnce()
```

If there's already a setTimeout or polling loop, ensure the initial wait is at least 1500ms.

---

## Verify
```bash
cd /Users/dhirajghosal/Documents/AutoResume/jobpilot/extension && node build.mjs
```
Must exit 0. The build output should NOT contain the literal string `'http://localhost:3001'` in `dist/sidepanel.js` when `API_BASE` env var is set. Verify with:
```bash
API_BASE='https://jobpilot.vercel.app' node build.mjs && grep -c 'localhost:3001' dist/sidepanel.js || true
```
Output should be 0 if injection worked.
