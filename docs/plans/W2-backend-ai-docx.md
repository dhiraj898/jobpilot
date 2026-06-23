# W2: Backend AI Robustness & .docx Generation

## Files touched (only these — do not edit others)
- backend/src/routes/ai.ts
- backend/src/services/resumeSegmenter.ts

## Gate
`cd /Users/dhirajghosal/Documents/AutoResume/jobpilot/backend && npm run build`

---

## Task 1 — Raise scoreResume maxTokens from 1200 to 3000
**File:** `backend/src/routes/ai.ts`

Find the `scoreResume` function (around line 277). Change:
```typescript
maxTokens: 1200,
```
To:
```typescript
maxTokens: 3000,
```
There is exactly one occurrence inside `scoreResume`. Do not change maxTokens elsewhere.

---

## Task 2 — Surface scoring failure to user (not silent zero)
**File:** `backend/src/routes/ai.ts`

In `runTailorChain`, the scoreBefore catch block (around line 183) currently sets score=0 silently. Change it to include a warning flag:

```typescript
scoreBefore = {
  score: 0, matchedKeywords: [], missingKeywords: [],
  topMissingForSummary: [], topMissingForBullets: [],
  breakdown: { skillsMatch: 0, expMatch: 0, summaryMatch: 0 },
  summary: 'Scoring unavailable — tailoring will proceed without keyword prioritisation'
}
```

Also add a `scoreWarning` field to the return value of `runTailorChain` when scoring failed, so callers can surface it. Add `scoreWarning?: string` to the return object:

```typescript
return {
  tailoredPayload: tailored,
  tailoredResume: tailoredText,
  scoreBefore,
  scoreAfter,
  delta: scoreAfter.score - scoreBefore.score,
  changeLog,
  scoreWarning: scoreBefore.score === 0 && !scoreBefore.matchedKeywords.length
    ? 'Match scoring was unavailable for this tailoring session'
    : undefined,
}
```

---

## Task 3 — Fix empty-string bullets in heuristic segmenter
**File:** `backend/src/services/resumeSegmenter.ts`

In the `segmentResume` function, wherever `bullets` arrays are built, filter out empty/whitespace-only strings.

Find every place that assigns to a `bullets` array and apply:
```typescript
bullets: bullets.filter(b => b.trim().length > 0)
```

If `bullets` would be empty after filtering, use `['See role description above']` as a single placeholder bullet rather than an empty array (the AI system prompt requires non-empty bullet arrays).

---

## Task 4 — Generate .docx from scratch for PDF/non-docx users (CRITICAL)
**File:** `backend/src/routes/ai.ts`

The `docx` library is already imported at line 14. The `/download-resume` endpoint currently returns a 400 error if no `.docx` was uploaded. Replace the fallback error with actual generation.

The existing endpoint structure:
```typescript
router.post('/download-resume', async (req: AuthRequest, res: Response) => {
  const { resumeText, tailoredPayload, filename } = req.body
  if (!resumeText) return res.status(400).json(...)

  if (tailoredPayload && req.userId) {
    try {
      const profile = await db.profile.findUnique(...)
      if (profile?.resumeDocx) {
        // surgical replacement — keep this path as-is
        ...
        return res.send(buffer)
      }
    } catch (e) { ... }
  }

  // REPLACE THIS:
  res.status(400).json({ success: false, error: 'No original .docx found ...' })
})
```

Replace the final fallback with a function `generateDocxFromPayload(payload, resumeText)` that:

1. Uses the `docx` library (Document, Packer, Paragraph, TextRun, etc.) to build a clean .docx
2. Builds sections in this order:
   - **Contact/Name header**: from `payload.locked.contact` — bold, 16pt, centered
   - **Summary**: label "Summary" (bold, 11pt), then summary paragraph (10pt)
   - **Experience**: for each role in `payload.experience`:
     - Title + Company + Dates on one line (bold title, separator, dates right-aligned)
     - Each bullet as a paragraph with `•` prefix, 10pt
   - **Skills**: label "Skills", then `payload.locked.skills.join(' · ')`
   - **Education**: label "Education", then `payload.locked.education`
3. Use US Letter page size (12240 × 15840 DXA), 1-inch margins
4. Return as a Buffer from `Packer.toBuffer(doc)`

If `tailoredPayload` is not provided but `resumeText` is, generate a minimal single-section document with the resume text as paragraphs (split by newline).

The generated .docx must:
- NOT use any Syncfusion or third-party UI library
- Work with the `docx` npm package already installed
- Produce a file Word, Pages, and Google Docs can open

After implementing, the endpoint should:
- If resumeDocx + tailoredPayload → surgical replacement (existing path)
- If tailoredPayload but no resumeDocx → generate from payload (new path)
- If only resumeText (no payload) → generate simple text document (new path)

---

## Task 5 — Fix misleading error on surgical replacement failure
**File:** `backend/src/routes/ai.ts`

Currently when surgical replacement fails, the code falls through to the 400 error saying "please re-upload your .docx". Change so that surgical failure falls through to the new `generateDocxFromPayload` path instead:

```typescript
try {
  const profile = await db.profile.findUnique({ where: { userId: req.userId } })
  if (profile?.resumeDocx) {
    const buffer = await surgicalDocxReplacement(profile.resumeDocx as Buffer, tailoredPayload as ResumePayload)
    // ... send buffer ...
    return res.send(buffer)
  }
} catch (e) {
  console.error('[download-resume] surgical replacement failed, falling back to generation:', e)
  // Fall through to generation below
}

// Generate from payload (works for PDF users or when surgical fails)
if (tailoredPayload) {
  const buffer = await generateDocxFromPayload(tailoredPayload as ResumePayload)
  // ... send buffer ...
  return res.send(buffer)
}

// Last resort: plain text document
if (resumeText) {
  const buffer = await generateSimpleDocx(resumeText as string, filename as string)
  return res.send(buffer)
}

return res.status(400).json({ success: false, error: 'No resume content to generate document from' })
```

---

## Verify
```bash
cd /Users/dhirajghosal/Documents/AutoResume/jobpilot/backend && npm run build
```
Must exit 0. The docx generation code must compile without errors.
