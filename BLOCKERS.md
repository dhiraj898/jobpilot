# JobPilot Build Blockers

## Status: BLOCKED — Cannot start build

The agentic build loop has been stopped because critical prerequisites are
missing from this machine. All blockers below must be resolved before the
build can proceed.

---

## Blocker 1: Node.js 20+ not installed

**What is missing:** Node.js (v20.0.0 or later) and npm are not found anywhere
on this system. The PATH checked:
- `/usr/local/bin`
- `/opt/homebrew/bin`
- `~/.nvm/versions/`
- `~/.volta/bin/`

**What you need to do:**

Option A — Install via Homebrew (recommended on macOS ARM):
```bash
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
brew install node@20
```

Option B — Install via nvm:
```bash
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash
source ~/.zshrc
nvm install 20
nvm use 20
```

Option C — Download directly from https://nodejs.org/en/download (choose v20 LTS for macOS ARM64)

**Verify with:** `node --version` (must show v20.x.x or higher)

---

## Blocker 2: PostgreSQL 16 not installed

**What is missing:** `psql` is not in PATH and no PostgreSQL service is running
via Homebrew services.

**What you need to do:**

Option A — Install via Homebrew (after Homebrew is installed):
```bash
brew install postgresql@16
brew services start postgresql@16
```

Option B — Install Postgres.app (easiest on macOS):
Download from https://postgresapp.com — drag to Applications, open it,
click Initialize. It runs PostgreSQL 16 locally on port 5432.

**Verify with:** `psql --version` (must show 16.x)

---

## Blocker 3: .env file needs to be created and filled in

**What is missing:** The `.env` file with secrets. Once Node.js is available,
copy the example and fill it in:

```bash
cd jobpilot
cp .env.example .env
```

Then edit `.env` and fill in:
- `DATABASE_URL` — your local PostgreSQL connection string, e.g.:
  `postgresql://postgres:password@localhost:5432/jobpilot`
- `JWT_SECRET` — generate with: `openssl rand -hex 32`
- `ENCRYPTION_KEY` — generate with: `openssl rand -hex 16`

---

## What to do after resolving blockers

Once Node.js, npm, and PostgreSQL are installed and running, and `.env` is
filled in, restart this conversation (or continue it) and say:
"The blockers are resolved — please continue building JobPilot."

The build will resume from Phase 1, Task 1.1.
