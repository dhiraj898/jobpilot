# W1: Backend Security & Environment Hardening

## Files touched (only these — do not edit others)
- backend/src/services/encrypt.ts
- backend/src/index.ts
- backend/src/routes/auth.ts
- backend/src/routes/applications.ts
- backend/src/services/aiProxy.ts
- backend/prisma/schema.prisma

## Gate
`cd /Users/dhirajghosal/Documents/AutoResume/jobpilot/backend && npm run build`

---

## Task 1 — Fix ENCRYPTION_KEY zero-fallback (CRITICAL)
**File:** `backend/src/services/encrypt.ts`

Change `getKey()` so that if ENCRYPTION_KEY is absent or not exactly 64 hex chars, it throws immediately with a clear message instead of silently using zeros.

```typescript
function getKey(): Buffer {
  const key = process.env.ENCRYPTION_KEY
  if (!key || !/^[0-9a-fA-F]{64}$/.test(key)) {
    throw new Error('ENCRYPTION_KEY must be a 64-character hex string. Generate one with: openssl rand -hex 32')
  }
  return Buffer.from(key, 'hex')
}
```

---

## Task 2 — Add startup environment validation (CRITICAL)
**File:** `backend/src/index.ts`

Add a `validateEnv()` function called BEFORE any route registration. It must throw on startup (not at first request) if any required env var is missing.

```typescript
function validateEnv() {
  const required = ['DATABASE_URL', 'JWT_SECRET', 'ENCRYPTION_KEY']
  const missing = required.filter(k => !process.env[k])
  if (missing.length) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}. Check your .env file or Vercel project settings.`)
  }
  if (!/^[0-9a-fA-F]{64}$/.test(process.env.ENCRYPTION_KEY!)) {
    throw new Error('ENCRYPTION_KEY must be exactly 64 hex characters. Generate with: openssl rand -hex 32')
  }
}
validateEnv() // call before app setup
```

---

## Task 3 — Add rate limiting (CRITICAL)
**File:** `backend/src/index.ts`

Install `express-rate-limit` (it is already likely in package.json — check first. If not, add it).

```bash
cd /Users/dhirajghosal/Documents/AutoResume/jobpilot/backend && npm install express-rate-limit
```

Add two limiters after `app.use(express.json(...))`:

```typescript
import rateLimit from 'express-rate-limit'

// Auth endpoints: 10 requests per minute per IP (brute-force protection)
const authLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: 'Too many requests. Please wait a minute before trying again.' },
})

// AI endpoints: 30 requests per 10 minutes per IP (cost control)
const aiLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: 'AI rate limit reached. Please wait before making more requests.' },
})

app.use('/auth', authLimiter)
app.use('/ai', aiLimiter)
```

---

## Task 4 — Add global Express error handler
**File:** `backend/src/index.ts`

Add AFTER all route registrations, BEFORE `app.listen`:

```typescript
// Global error handler — catches any error thrown from async routes in Express 5
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('[unhandled error]', err.message, err.stack?.split('\n')[1])
  res.status(500).json({ success: false, error: 'Internal server error' })
})
```

---

## Task 5 — Wrap auth.ts routes in try/catch
**File:** `backend/src/routes/auth.ts`

All three routes (/register, /login, /me) need try/catch so DB errors don't crash the process.

Wrap each route handler body:
```typescript
router.post('/register', async (req, res) => {
  try {
    // ... existing code ...
  } catch (e) {
    res.status(500).json({ success: false, error: 'Registration failed. Please try again.' })
  }
})
```
Do the same for /login and /me.

---

## Task 6 — Wrap applications.ts routes in try/catch
**File:** `backend/src/routes/applications.ts`

All four routes (GET /, POST /, PUT /:id, DELETE /:id) need try/catch.

```typescript
router.get('/', async (req: AuthRequest, res: Response) => {
  try {
    // ... existing code ...
  } catch (e) {
    res.status(500).json({ success: false, error: 'Failed to load applications' })
  }
})
```
Do the same for all other routes.

---

## Task 7 — Fix app.listen() on Vercel
**File:** `backend/src/index.ts`

Change:
```typescript
if (process.env.NODE_ENV !== 'test') {
```
To:
```typescript
if (process.env.NODE_ENV !== 'test' && !process.env.VERCEL) {
```

---

## Task 8 — Add AI call timeout (AbortController)
**File:** `backend/src/services/aiProxy.ts`

Wrap the fetch call with a 45-second timeout:

```typescript
const controller = new AbortController()
const timeout = setTimeout(() => controller.abort(), 45_000)
try {
  const res = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body), signal: controller.signal })
  // ... rest of existing code ...
} catch (e) {
  if (e instanceof Error && e.name === 'AbortError') {
    throw new Error('AI request timed out after 45 seconds. Please try again.')
  }
  throw e
} finally {
  clearTimeout(timeout)
}
```

---

## Task 9 — Add Prisma indexes on Application model
**File:** `backend/prisma/schema.prisma`

Add to the `Application` model (after the existing fields):
```prisma
@@index([userId])
@@index([userId, status])
```

After editing, run:
```bash
cd /Users/dhirajghosal/Documents/AutoResume/jobpilot/backend && npx prisma generate
```
(Do NOT run migrate — this is for local dev. The index will apply on next deploy.)

---

## Task 10 — Add DB health check to /health
**File:** `backend/src/index.ts`

Replace the simple /health route with:
```typescript
app.get('/health', async (_req, res) => {
  try {
    await db.$queryRaw`SELECT 1`
    res.json({ success: true, data: { status: 'ok', db: 'connected' } })
  } catch {
    res.status(503).json({ success: false, data: { status: 'degraded', db: 'unreachable' } })
  }
})
```
Import `db` from `./lib/db` at the top of index.ts.

---

## Task 11 — Add email validation on register
**File:** `backend/src/routes/auth.ts`

In /register, after the existing checks, add:
```typescript
const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
if (!emailRegex.test(email)) {
  return res.status(400).json({ success: false, error: 'Please enter a valid email address' })
}
```

---

## Verify
```bash
cd /Users/dhirajghosal/Documents/AutoResume/jobpilot/backend && npm run build
```
Must exit 0 with no TypeScript errors.
