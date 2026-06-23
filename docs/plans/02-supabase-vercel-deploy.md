# Plan: Supabase + Vercel Production Deployment

## Goal
Get the app live on Vercel (frontend + backend) with Supabase as the production database, so real users can access it via a public URL.

## Context
- Frontend: React + Vite in `web/` → Vercel static + SPA rewrites
- Backend: Express in `backend/` → Vercel serverless via `api/index.ts`
- Database: PostgreSQL via Prisma — currently a local/dev DB
- `web/vercel.json` and `backend/vercel.json` already exist

## Tasks

### Task 1: Fix backend Prisma for serverless (connection pooling)
- File: `backend/src/lib/db.ts`
- Serverless functions open a new DB connection on every invocation. Without pooling, Supabase will hit connection limits.
- Use `@prisma/client` with connection URL that uses Supabase's **pgbouncer** (port 6543, `?pgbouncer=true&connection_limit=1`)
- Ensure `DATABASE_URL` env var in Vercel backend project will use the pooler URL
- Add a `DIRECT_URL` env var for Prisma migrations (port 5432, no pgbouncer)
- Update `backend/prisma/schema.prisma` to add:
  ```prisma
  datasource db {
    provider  = "postgresql"
    url       = env("DATABASE_URL")
    directUrl = env("DIRECT_URL")
  }
  ```

### Task 2: Add CORS for production frontend URL
- File: `backend/src/index.ts`
- Currently CORS allows localhost only (or wildcard).
- Update CORS config to allow both `http://localhost:5173` (dev) AND the Vercel frontend domain (use env var `ALLOWED_ORIGIN` so it can be set in Vercel without code changes)
- Pattern:
  ```typescript
  const allowedOrigins = [
    'http://localhost:5173',
    process.env.ALLOWED_ORIGIN,
  ].filter(Boolean)
  app.use(cors({ origin: allowedOrigins, credentials: true }))
  ```

### Task 3: Frontend API URL configuration
- File: `web/src/api/client.ts` (or wherever axios baseURL is set)
- The frontend must call the production backend URL in production, localhost in dev.
- Use `import.meta.env.VITE_API_URL` already in place — verify it is the only place the URL is set.
- Confirm `web/.env.example` or similar documents `VITE_API_URL=https://<backend>.vercel.app`

### Task 4: Create deployment documentation
- File: `docs/plans/DEPLOYMENT.md`
- Write step-by-step manual instructions for the user to:
  1. Create Supabase project → get `DATABASE_URL` (pooler, port 6543) and `DIRECT_URL` (port 5432)
  2. Run `npx prisma migrate deploy` against `DIRECT_URL`
  3. Deploy backend to Vercel: `cd backend && vercel --prod` with env vars: `DATABASE_URL`, `DIRECT_URL`, `JWT_SECRET`, `ENCRYPTION_KEY`, `ALLOWED_ORIGIN`
  4. Deploy frontend to Vercel: `cd web && vercel --prod` with env var: `VITE_API_URL=https://<backend-vercel-url>`
  5. Test the live URL

### Task 5: Add `engines` field to backend package.json for Vercel Node version
- File: `backend/package.json`
- Add: `"engines": { "node": "18.x" }`
- Vercel needs this to select the correct Node runtime

### Task 6: Verify Vercel build config handles TypeScript
- File: `backend/vercel.json`
- Confirm `@vercel/node` can compile `api/index.ts` (it uses `tsconfig.json`)
- Check `backend/tsconfig.json` has `"module": "commonjs"` or `"esModuleInterop": true` so the serverless handler exports correctly

### Task 7: TypeScript build gate
- Run: `cd backend && npm run build` — must pass
- Run: `cd web && npm run build` — must pass

### Task 8: Commit deployment-ready changes
- Files: `backend/src/index.ts`, `backend/prisma/schema.prisma`, `backend/package.json`, `backend/tsconfig.json` (if changed), `docs/plans/DEPLOYMENT.md`
- Commit message: `feat: production-ready config for Supabase + Vercel deployment`

## Verify gates
```bash
cd /Users/dhirajghosal/Documents/AutoResume/jobpilot/backend && npm run build
cd /Users/dhirajghosal/Documents/AutoResume/jobpilot/web && npm run build
```

## ENV-PENDING (manual steps for the user)
1. Create Supabase project at supabase.com — copy the two DB URLs
2. Run `npx prisma migrate deploy` with DIRECT_URL set
3. `vercel --prod` in backend dir with all 5 env vars set
4. `vercel --prod` in web dir with VITE_API_URL set
5. Open the live frontend URL, register, upload resume, scrape a job, tailor.
