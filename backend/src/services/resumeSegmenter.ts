// ── Shared types ─────────────────────────────────────────────────────────────

export interface ResumeExperience {
  title: string    // LOCKED
  company: string  // LOCKED
  dates: string    // LOCKED
  bullets: string[] // MUTABLE
}

export interface ResumePayload {
  summary: string             // MUTABLE
  experience: ResumeExperience[]
  locked: {
    skills: string[]   // LOCKED
    education: string  // LOCKED
    contact: string    // LOCKED
  }
}

export interface MatchScoreResult {
  score: number
  matchedKeywords: string[]
  missingKeywords: string[]
  topMissingForSummary: string[]
  topMissingForBullets: string[]
  breakdown: {
    skillsMatch: number
    expMatch: number
    summaryMatch: number
  }
  summary: string
}

export interface TailorResult {
  tailoredPayload: ResumePayload
  tailoredResume: string
  scoreBefore: MatchScoreResult
  scoreAfter: MatchScoreResult
  delta: number
  changeLog: string[]
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const SECTION_HEADERS = /^(SUMMARY|OBJECTIVE|PROFILE|ABOUT|EXPERIENCE|WORK EXPERIENCE|EMPLOYMENT|SKILLS|EDUCATION|CERTIFICATIONS|CONTACT|REFERENCES|PROJECTS|ACHIEVEMENTS|AWARDS|LANGUAGES|VOLUNTEERING|PUBLICATIONS|INTERESTS|HOBBIES)\b/i

const DATE_PATTERN = /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec|january|february|march|april|june|july|august|september|october|november|december)?\s*\d{4}\s*[-–—to]+\s*(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec|january|february|march|april|june|july|august|september|october|november|december)?\s*(\d{4}|present|current|now)/i

function looksLikeSectionHeader(line: string): boolean {
  const t = line.trim()
  if (!t) return false
  if (t.length > 60) return false
  return SECTION_HEADERS.test(t) || /^[A-Z][A-Z\s\/&]{3,30}$/.test(t)
}

function looksLikeBullet(line: string): boolean {
  return /^[-•·▪▸*]\s/.test(line.trim()) || /^\d+\.\s/.test(line.trim())
}

function stripBulletChar(line: string): string {
  return line.trim().replace(/^[-•·▪▸*]\s+/, '').replace(/^\d+\.\s+/, '').trim()
}

// ── Heuristic segmenter ───────────────────────────────────────────────────────

export function segmentResume(text: string): ResumePayload {
  const lines = text.split('\n').map(l => l.trimEnd())

  // Identify section boundaries
  const sections: { name: string; start: number }[] = []
  for (let i = 0; i < lines.length; i++) {
    if (looksLikeSectionHeader(lines[i])) {
      sections.push({ name: lines[i].trim().toUpperCase(), start: i })
    }
  }

  function sectionLines(name: string): string[] {
    const idx = sections.findIndex(s => s.name.includes(name))
    if (idx === -1) return []
    const start = sections[idx].start + 1
    const end = idx + 1 < sections.length ? sections[idx + 1].start : lines.length
    return lines.slice(start, end).filter(l => l.trim())
  }

  function bodyBetween(startIdx: number, endIdx: number): string[] {
    return lines.slice(startIdx + 1, endIdx).filter(l => l.trim())
  }

  // ── Contact: first few non-empty lines before first section header ──────────
  const firstSection = sections[0]?.start ?? lines.length
  const headerBlock = lines.slice(0, Math.min(firstSection, 6)).filter(l => l.trim())
  const contact = headerBlock.join(' | ')

  // ── Summary ─────────────────────────────────────────────────────────────────
  const summarySection = sections.find(s =>
    s.name.includes('SUMMARY') || s.name.includes('OBJECTIVE') ||
    s.name.includes('PROFILE') || s.name.includes('ABOUT')
  )
  let summary = ''
  if (summarySection) {
    const nextIdx = sections.findIndex(s => s === summarySection) + 1
    const nextStart = nextIdx < sections.length ? sections[nextIdx].start : lines.length
    summary = bodyBetween(summarySection.start, nextStart).join(' ').trim()
  }

  // ── Skills ───────────────────────────────────────────────────────────────────
  const skillsLines = sectionLines('SKILL')
  const skills: string[] = []
  for (const line of skillsLines) {
    const stripped = looksLikeBullet(line) ? stripBulletChar(line) : line.trim()
    for (const part of stripped.split(/[,·|•]\s*/)) {
      const s = part.trim().replace(/^[-·•]\s*/, '')
      if (s && s.length < 50) skills.push(s)
    }
  }

  // ── Education ────────────────────────────────────────────────────────────────
  const education = sectionLines('EDUCATION').join(' ').trim()

  // ── Experience ───────────────────────────────────────────────────────────────
  const expSection = sections.find(s =>
    s.name.includes('EXPERIENCE') || s.name.includes('EMPLOYMENT') || s.name.includes('WORK')
  )
  const experience: ResumeExperience[] = []

  if (expSection) {
    const expIdx = sections.findIndex(s => s === expSection)
    const expEnd = expIdx + 1 < sections.length ? sections[expIdx + 1].start : lines.length
    const expLines = lines.slice(expSection.start + 1, expEnd)

    // Each job entry: look for a line with a date range, treat lines above as title/company
    let i = 0
    while (i < expLines.length) {
      const line = expLines[i].trim()
      if (!line) { i++; continue }

      // Try to find a date range on this or the next line
      const dateLine = DATE_PATTERN.test(line) ? line
        : (i + 1 < expLines.length && DATE_PATTERN.test(expLines[i + 1].trim())) ? expLines[i + 1].trim()
        : null

      if (!dateLine) { i++; continue }

      const dateMatch = dateLine.match(DATE_PATTERN)
      const dates = dateMatch ? dateMatch[0].trim() : dateLine.trim()

      // Title is the current line (or the line above the date line if date was on next line)
      let titleLine = DATE_PATTERN.test(line) ? (i > 0 ? expLines[i - 1].trim() : '') : line
      // Advance past the date line
      const dateLineIdx = DATE_PATTERN.test(line) ? i : i + 1

      // Company: the other part of the title line (split by ' | ', ' at ', ' - ')
      let title = titleLine
      let company = ''
      const sep = titleLine.match(/\s+(?:at|@|\||-{1,2})\s+/)
      if (sep) {
        title = titleLine.slice(0, sep.index!).trim()
        company = titleLine.slice(sep.index! + sep[0].length).trim()
      } else if (dateLineIdx + 1 < expLines.length && !DATE_PATTERN.test(expLines[dateLineIdx + 1]) && !looksLikeBullet(expLines[dateLineIdx + 1]) && expLines[dateLineIdx + 1].trim()) {
        company = expLines[dateLineIdx + 1].trim()
      }

      // Collect bullets until next date or end
      const bullets: string[] = []
      let j = dateLineIdx + 1
      if (company && expLines[j]?.trim() === company) j++ // skip company line we already captured

      while (j < expLines.length) {
        const bl = expLines[j].trim()
        if (!bl) { j++; continue }
        if (DATE_PATTERN.test(bl)) break // next job entry starts
        if (looksLikeSectionHeader(bl)) break
        if (looksLikeBullet(bl)) {
          bullets.push(stripBulletChar(bl))
        } else if (bl.length > 20 && !DATE_PATTERN.test(bl)) {
          // prose line — treat as bullet
          bullets.push(bl)
        }
        j++
      }

      if (title) {
        const filteredBullets = bullets.filter(b => b.trim().length > 0)
        experience.push({
          title: title.replace(/\s+\d{4}.*$/, '').trim(), // strip trailing dates from title
          company,
          dates,
          bullets: filteredBullets.length ? filteredBullets : ['See role description above']
        })
      }

      i = j
    }
  }

  return {
    summary: summary || 'Experienced professional with a strong background in the field.',
    experience,
    locked: { skills, education, contact }
  }
}

// ── Reconstruct plain text from payload ──────────────────────────────────────

export function reconstructResume(payload: ResumePayload): string {
  const parts: string[] = []

  if (payload.locked.contact) {
    parts.push(payload.locked.contact)
    parts.push('')
  }

  if (payload.summary) {
    parts.push('SUMMARY')
    parts.push(payload.summary)
    parts.push('')
  }

  if (payload.experience.length) {
    parts.push('EXPERIENCE')
    for (const exp of payload.experience) {
      parts.push(`${exp.title}${exp.company ? ' | ' + exp.company : ''}  ${exp.dates}`)
      for (const bullet of exp.bullets) {
        if (bullet) parts.push(`• ${bullet}`)
      }
      parts.push('')
    }
  }

  if (payload.locked.skills.length) {
    parts.push('SKILLS')
    parts.push(payload.locked.skills.join(', '))
    parts.push('')
  }

  if (payload.locked.education) {
    parts.push('EDUCATION')
    parts.push(payload.locked.education)
  }

  return parts.join('\n').trim()
}

// ── JSON extraction helper ────────────────────────────────────────────────────

export function extractJSON(raw: string): string {
  const stripped = raw.replace(/^```(?:json)?\n?/im, '').replace(/\n?```$/im, '').trim()
  const start = stripped.indexOf('{')
  const end = stripped.lastIndexOf('}')
  if (start === -1 || end === -1) throw new Error(`No JSON object found in AI response. Got: ${raw.slice(0, 200)}`)
  return stripped.slice(start, end + 1)
}
