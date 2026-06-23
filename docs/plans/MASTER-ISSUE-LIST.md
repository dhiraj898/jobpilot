# JobPilot — Master Issue List (Verified Against Code)
Generated from parallel audit of all subsystems. Every item verified against actual file contents.

---

## 🔴 CRITICAL — Breaks All Users in Production

### C1. ENCRYPTION_KEY falls back to all-zero key
- **File:** `backend/src/services/encrypt.ts:7`
- **Code:** `process.env.ENCRYPTION_KEY || '0'.repeat(64)`
- **Impact:** If ENCRYPTION_KEY is not set on Vercel, every user's Sarvam API key is "encrypted" with a known all-zero key. Database read access = decrypt all keys. App does not crash — silently ships broken encryption.
- **Fix:** Throw at startup if ENCRYPTION_KEY is missing or not 64 hex chars.

### C2. No startup environment validation
- **File:** `backend/src/index.ts` (missing)
- **Impact:** App boots and serves requests with missing JWT_SECRET, ENCRYPTION_KEY, DATABASE_URL. First request fails cryptically instead of failing fast at deploy.
- **Fix:** Add `validateEnv()` at top of index.ts that throws immediately.

### C3. Extension API URL hardcoded to localhost
- **File:** `extension/src/sidepanel/api.ts:1`
- **Code:** `const BASE = 'http://localhost:3001'`
- **Impact:** Every API call from the extension hits localhost. 100% failure for any real user.
- **Fix:** Add `declare const API_BASE_DEFINE: string` + esbuild `--define:API_BASE_DEFINE` in build.mjs.

### C4. .docx download fails for PDF resume users
- **File:** `backend/src/routes/ai.ts:715-740`
- **Code:** `if (profile?.resumeDocx) { surgical } else { return 400 }`
- **Impact:** Users who upload PDF (most common format) get "No original .docx found" error. The `docx` library is imported (line 14) but never used for generation.
- **Fix:** If no resumeDocx, generate .docx from tailoredPayload using the `docx` library.

### C5. No rate limiting anywhere
- **File:** `backend/src/index.ts` (missing)
- **Impact:** /auth/login has zero brute-force protection. /ai/* endpoints have no throttle — one user can trigger unlimited paid Sarvam API calls.
- **Fix:** Add `express-rate-limit` to auth routes (10/min) and AI routes (20/min per user).

---

## 🟠 HIGH — Breaks Core User Flows

### H1. `saved` status missing from entire pipeline
- **File:** `web/src/pages/Applications.tsx:7`
- **Code:** `const STATUSES = ['all', 'applied', 'interview', 'offer', 'rejected']` — no 'saved'
- **Also:** Status dropdown (line 73) only has applied/interview/offer/rejected. Dashboard funnel has no 'Saved' stage.
- **Impact:** Users can't track jobs they're interested in before applying. Core workflow missing.
- **Fix:** Add `saved` to STATUSES, STATUS_BADGE, status dropdown, Dashboard funnel.

### H2. Applications.tsx load() has no .catch()
- **File:** `web/src/pages/Applications.tsx:23`
- **Code:** `.then(r => { setApps(...); setLoading(false) })` — no .catch
- **Impact:** API failure leaves loading=true forever. Infinite spinner with no error message.
- **Fix:** Add `.catch(err => { setError(err.message); setLoading(false) })`

### H3. Dashboard swallows all API errors
- **File:** `web/src/pages/Dashboard.tsx:43-44`
- **Code:** `.catch(() => {})` on both fetches
- **Impact:** Expired JWT, DB error, network issue → user sees zeros with no explanation.
- **Fix:** Set error state, show banner.

### H4. scoreResume maxTokens too low
- **File:** `backend/src/routes/ai.ts:288`
- **Code:** `maxTokens: 1200`
- **Impact:** AI truncates response mid-JSON for keyword-heavy JDs. JSON.parse fails. Score silently zeroed out — user sees 0% match with no indication it's a system failure.
- **Fix:** Raise to `3000`.

### H5. Extension 401 shows generic error, no re-auth
- **File:** `extension/src/sidepanel/index.ts:175,325`
- **Impact:** Expired token shows "AI extraction failed: Unauthorized". User has no path to re-login.
- **Fix:** Detect 401/Unauthorized error string, clear token, render login screen.

### H6. auth.ts routes have no try/catch
- **File:** `backend/src/routes/auth.ts` — all three routes
- **Impact:** DB connection failure throws unhandled rejection. Express 5 forwards to error handler, but there is no error handler registered — sends HTML 500 to browser, breaking frontend JSON parsing.
- **Fix:** Wrap all routes in try/catch + add global error handler.

### H7. applications.ts routes have no try/catch
- **File:** `backend/src/routes/applications.ts` — all four routes
- **Impact:** Same as H6.
- **Fix:** Wrap all routes in try/catch.

---

## 🟡 MEDIUM — Degrades UX / Creates Reliability Risk

### M1. `tabs` permission missing from extension manifest
- **File:** `extension/manifest.json:4`
- **Code:** `"permissions": ["sidePanel", "storage", "activeTab", "scripting"]` — no "tabs"
- **Impact:** `chrome.tabs.query()` (used throughout) requires "tabs" permission. Works in some Chrome versions but can silently fail.
- **Fix:** Add `"tabs"` to permissions array.

### M2. URL.revokeObjectURL race condition
- **File:** `extension/src/sidepanel/api.ts:63-64`
- **Code:** `a.click(); URL.revokeObjectURL(url)` — revoked immediately
- **Impact:** Download may not have started when URL is revoked → intermittent silent download failure on slow connections.
- **Fix:** Revoke after a 1000ms delay.

### M3. No AI call timeout
- **File:** `backend/src/services/aiProxy.ts:42`
- **Code:** `fetch(url, { method, headers, body })` — no AbortController
- **Impact:** Slow/unresponsive Sarvam AI → requests hang indefinitely. The 4-call tailor chain can exhaust Vercel's 10s function timeout silently.
- **Fix:** Add AbortController with 45s timeout.

### M4. No global Express error handler
- **File:** `backend/src/index.ts` (missing)
- **Impact:** Unhandled errors from any route send HTML error pages. Frontend JSON parsing breaks.
- **Fix:** Add `app.use((err, req, res, next) => res.status(500).json({...}))`.

### M5. Application Notes field never rendered
- **File:** `web/src/pages/Applications.tsx`
- **Notes field:** In `Application` interface (line 5), fetched from API, but never displayed or editable in the table.
- **Fix:** Add notes column or expandable row with editable textarea.

### M6. No delete confirmation dialog
- **File:** `web/src/pages/Applications.tsx:73`
- **Code:** `onClick={() => api.delete(...).then(...)` — single click deletes permanently
- **Fix:** Show `confirm()` or inline confirmation before deleting.

### M7. app.listen() called on Vercel
- **File:** `backend/src/index.ts:34`
- **Code:** `if (process.env.NODE_ENV !== 'test') { app.listen(...) }`
- **Impact:** On Vercel, NODE_ENV='production', so app.listen() runs. Wastes startup time, logs confusing message.
- **Fix:** Add `&& !process.env.VERCEL` condition.

### M8. Empty-string bullets from heuristic segmenter
- **File:** `backend/src/services/resumeSegmenter.ts`
- **Impact:** When heuristic fallback runs, may produce `['']` (empty string bullets). These appear as blank lines in the tailored resume and .docx.
- **Fix:** Filter out empty/whitespace-only strings from bullets arrays.

### M9. No "Set API key" in onboarding checklist
- **File:** `web/src/pages/Dashboard.tsx`
- **Impact:** New users set up profile but don't know Settings → API key is required. They hit walls without understanding why.
- **Fix:** Add "Configure AI key" checklist item that links to /settings.

### M10. scoreAfter silently set to scoreBefore on failure
- **File:** `backend/src/routes/ai.ts:263`
- **Code:** `scoreAfter = { ...scoreBefore }` on catch — delta = 0
- **Impact:** User sees no improvement even when resume was tailored. No indication of the failure.
- **Fix:** Surface a warning in the response when scoring fails.

### M11. `saveApp` in extension uses alert()
- **File:** `extension/src/sidepanel/index.ts:418` (approx)
- **Code:** `alert('Could not save — are you signed in?')`
- **Fix:** Use proper UI error state consistent with rest of extension.

### M12. Dashboard "View All" uses hard `<a>` not React Router Link
- **File:** `web/src/pages/Dashboard.tsx`
- **Code:** `<a href="/applications">` — causes full page reload
- **Fix:** Use `useNavigate()` or React Router `<Link>`.

### M13. Missing Prisma indexes on Application table
- **File:** `backend/prisma/schema.prisma`
- **Impact:** `findMany({ where: { userId } })` does full table scan as data grows.
- **Fix:** Add `@@index([userId])` and `@@index([userId, status])` to Application model.

### M14. health check doesn't probe DB
- **File:** `backend/src/index.ts:29`
- **Impact:** /health returns 200 even when DB is down. Misleads monitoring.
- **Fix:** Add `await db.$queryRaw\`SELECT 1\`` and return 503 on failure.

### M15. Extension LinkedIn polling loop is dead code
- **File:** `extension/src/sidepanel/index.ts`
- `pageScrapeOnce()` always returns `ready: true`, so the 8s polling loop exits on first iteration regardless of whether LinkedIn's dynamic panel has loaded.
- **Fix:** Add a 1-2s initial delay before scraping on LinkedIn to let dynamic content render, OR check for selector presence before declaring ready.

---

## Workstream Assignment (no file conflicts)

| Workstream | Files Touched | Issues Covered |
|---|---|---|
| W1: Backend Security | encrypt.ts, index.ts, auth.ts, applications.ts, aiProxy.ts, prisma/schema.prisma | C1, C2, C5, H6, H7, M3, M4, M7, M13, M14 |
| W2: Backend AI + DOCX | routes/ai.ts, services/resumeSegmenter.ts | C4, H4, M8, M10 |
| W3: Extension | sidepanel/api.ts, sidepanel/index.ts, manifest.json, build.mjs | C3, H5, M1, M2, M11, M15 |
| W4: Frontend | pages/Dashboard.tsx, pages/Applications.tsx | H1, H2, H3, M5, M6, M9, M12 |
