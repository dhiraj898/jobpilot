# Deployment Guide: Supabase + Vercel

## Prerequisites

- Vercel CLI: `npm i -g vercel`
- Supabase account at https://supabase.com

---

## Step 1: Create a Supabase Project

1. Go to https://supabase.com and create a new project.
2. Once provisioned, go to **Project Settings → Database**.
3. Copy the two connection strings:
   - **Transaction pooler (pgbouncer)** — port 6543 — this is your `DATABASE_URL`:
     ```
     postgresql://postgres.[ref]:[password]@aws-0-[region].pooler.supabase.com:6543/postgres?pgbouncer=true&connection_limit=1
     ```
   - **Direct connection** — port 5432 — this is your `DIRECT_URL`:
     ```
     postgresql://postgres.[ref]:[password]@aws-0-[region].pooler.supabase.com:5432/postgres
     ```

---

## Step 2: Run Prisma Migrations

From the `backend/` directory, run migrations using the direct URL (not pgbouncer):

```bash
cd backend
DIRECT_URL="<your-direct-url>" DATABASE_URL="<your-pooler-url>" npx prisma migrate deploy
```

---

## Step 3: Deploy Backend to Vercel

```bash
cd backend
vercel --prod
```

When prompted, set the following environment variables in the Vercel dashboard
(Settings → Environment Variables) or via the CLI:

| Variable         | Value                                      |
|------------------|--------------------------------------------|
| `DATABASE_URL`   | Supabase pooler URL (port 6543)            |
| `DIRECT_URL`     | Supabase direct URL (port 5432)            |
| `JWT_SECRET`     | A long random secret string                |
| `ENCRYPTION_KEY` | 64-char hex string (32 bytes)              |
| `ALLOWED_ORIGIN` | Your frontend Vercel URL (added in step 4) |

After deploy, note your backend URL, e.g. `https://jobpilot-backend.vercel.app`.

---

## Step 4: Deploy Frontend to Vercel

```bash
cd web
vercel --prod
```

Set this environment variable:

| Variable       | Value                                       |
|----------------|---------------------------------------------|
| `VITE_API_URL` | Backend Vercel URL from step 3              |

After deploy, note your frontend URL, e.g. `https://jobpilot-web.vercel.app`.

---

## Step 5: Link Frontend URL to Backend CORS

Go back to your **backend** Vercel project → Settings → Environment Variables and update:

```
ALLOWED_ORIGIN=https://jobpilot-web.vercel.app
```

Then redeploy the backend:

```bash
cd backend
vercel --prod
```

---

## Step 6: Smoke Test

1. Open your frontend URL in the browser.
2. Register a new account.
3. Upload a resume.
4. Scrape a job posting.
5. Tailor the resume — confirm the AI response appears.

---

## Generating Secrets

```bash
# JWT_SECRET
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# ENCRYPTION_KEY (must be 64 hex chars = 32 bytes)
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```
