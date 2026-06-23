# Plan: Chrome Extension UX Polish

## Goal
Make the Chrome extension sidepanel experience smooth: clear status during scraping/tailoring, helpful errors, a progress indicator, and a clean result state showing the tailored resume was downloaded.

## Context
- Extension lives in `extension/src/sidepanel/`
- `index.ts` = main sidepanel logic (scraping, calling backend, showing status)
- `api.ts` = HTTP calls to backend
- Build: `cd extension && npm run build` → outputs to `extension/dist/`

## Tasks

### Task 1: Show scraping status clearly
- File: `extension/src/sidepanel/index.ts`
- When user clicks "Tailor Resume", show a status bar: "Reading page…" → "Extracting job details…" → "Tailoring resume…" → "Downloading…" → "Done!"
- If any step fails, show the exact error message (not a generic one) so user knows what went wrong
- Current state: errors sometimes show "Could not read job content" even when text was found. Fix this.

### Task 2: Improve JD extraction UI feedback
- After extract-jd succeeds, display the extracted job title and company in the sidepanel so the user can confirm it's correct before tailoring.
- Add a small "Looks wrong? Re-scrape" button that re-runs the scrape.

### Task 3: Scraper: fallback to full body text always returns `ready: true`
- File: `extension/src/sidepanel/index.ts` — `pageScrapeOnce()`
- Already done: always returns `ready: true` with bodyText fallback.
- VERIFY this is actually in the current file and the `ready` check in the click handler isn't blocking.

### Task 4: Download success state
- After `.docx` downloads, show a green "Resume downloaded! Check your Downloads folder." banner in the sidepanel.
- Auto-dismiss after 5 seconds, or user can close it.

### Task 5: Handle "No resume uploaded" gracefully
- File: `extension/src/sidepanel/index.ts`
- If backend returns 400 "No resume on file", show a helpful message: "Upload your base resume first — open the JobPilot app and go to Profile."
- Include a button that opens `chrome.tabs.create({ url: '<app-url>' })`

### Task 6: Extension build must pass
- Run: `cd /Users/dhirajghosal/Documents/AutoResume/jobpilot/extension && npm run build`
- No TypeScript errors, no esbuild errors

### Task 7: Commit
- Files: `extension/src/sidepanel/index.ts`, `extension/src/sidepanel/api.ts`
- Commit message: `feat(extension): status feedback, JD preview, download confirmation`

## Verify gates
```bash
cd /Users/dhirajghosal/Documents/AutoResume/jobpilot/extension && npm run build
```

## ENV-PENDING (manual)
- Load unpacked extension in Chrome → go to any job page → open sidepanel → verify status messages appear during each phase → confirm .docx downloads and success banner shows.
