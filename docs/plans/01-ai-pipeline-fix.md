# Plan: AI Pipeline Fix & End-to-End Verification

## Goal
Ensure the full flow — JD extraction → resume segmentation → scoring → tailoring → .docx download — works correctly using sarvam-105b for all JSON tasks.

## Context
- sarvam-30b is a reasoning model that outputs chain-of-thought via `reasoning_content`, NOT clean JSON.
- sarvam-105b is the standard model and outputs clean JSON in `content`.
- `jsonModel()` now always returns `sarvam-105b`. `SARVAM_MODEL` also fixed to `sarvam-105b`.
- Backend running at localhost:3001, frontend at localhost:5173.

## Tasks

### Task 1: Verify jsonModel fix compiles cleanly
- File: `backend/src/routes/ai.ts`
- Run: `cd backend && npm run build` — must exit 0 with no TS errors
- The `_creds` underscore prefix suppresses unused-param lint error

### Task 2: Fix max_tokens for sarvam-105b
- File: `backend/src/services/aiProxy.ts`
- The default `max_tokens: 2000` may be too low for full resume tailoring (which can be 3000+ tokens).
- Change default `maxTokens` fallback from `2000` to `4000`
- For the tailor call in `ai.ts`, ensure `maxTokens: 6000` is passed explicitly

### Task 3: Ensure extract-jd handles noisy LinkedIn page text gracefully
- File: `backend/src/routes/ai.ts`, extract-jd endpoint (~line 407)
- Add validation: if parsed JD has empty `description` or description is clearly LinkedIn boilerplate (< 200 chars), return a specific error: `"Job description too short — please scroll the full job posting into view before scraping."`
- Do NOT silently pass garbage to the tailor chain

### Task 4: Fix aiSegmentResume fallback — heuristic produces 0 bullets
- File: `backend/src/routes/ai.ts` — `runTailorChain` function
- When AI segmentation fails and heuristic fallback runs, `segmented 0 roles, bullets:` is logged → tailoring gets empty input → bad output
- Look at `segmentResume()` in `backend/src/services/resumeSegmenter.ts` — verify heuristic works on realistic resume text
- If heuristic is broken: fix the `segmentResume` function so it correctly parses roles from plain text

### Task 5: Resume parse-resume endpoint — return structured data
- File: `backend/src/routes/ai.ts`, parse-resume endpoint (~line 490)
- Currently uses `model = 'sarvam-105b'` (fixed). Verify the JSON schema returned matches what the frontend Profile page expects.
- Run: check `web/src/pages/Profile.tsx` to see what fields it reads from parse response.

### Task 6: Backend TypeScript build must pass
- Run: `cd /Users/dhirajghosal/Documents/AutoResume/jobpilot/backend && npm run build`
- Fix any TS errors introduced by model name changes

### Task 7: Frontend TypeScript build must pass
- Run: `cd /Users/dhirajghosal/Documents/AutoResume/jobpilot/web && npm run build`
- Fix any TS errors

### Task 8: Commit all fixes
- Stage: `backend/src/routes/ai.ts`, `backend/src/services/aiProxy.ts`
- Commit message: `fix: use sarvam-105b for all JSON-output AI tasks`

## Verify gates
```bash
cd /Users/dhirajghosal/Documents/AutoResume/jobpilot/backend && npm run build
cd /Users/dhirajghosal/Documents/AutoResume/jobpilot/web && npm run build
```

## ENV-PENDING (manual verification needed after)
- Live test: scrape a real job page in Chrome extension → verify JD extracted cleanly → tailor resume → download .docx → open in Word and confirm it looks right.
