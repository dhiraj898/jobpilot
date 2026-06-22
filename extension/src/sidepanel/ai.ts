import type { AIConfig, JD } from './store'

async function callAI(config: AIConfig, system: string, user: string): Promise<string> {
  const url = `${config.provider.replace(/\/$/, '')}/chat/completions`
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${config.apiKey}`,
      'x-api-key': config.apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: config.model,
      max_tokens: 4000,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
    }),
  })
  if (!res.ok) {
    const err = await res.text()
    throw new Error(`AI error ${res.status}: ${err.slice(0, 200)}`)
  }
  const data = await res.json() as { choices: { message: { content: string } }[] }
  return data.choices[0].message.content.trim()
}

// Step 1: extract structured JD from raw page text
export async function extractJD(config: AIConfig, rawText: string, url: string): Promise<JD> {
  const system = `You extract job posting information from raw webpage text. Return ONLY valid JSON, no markdown, no explanation.`
  const user = `Extract the job details from this webpage text. Return JSON with exactly these fields:
{
  "title": "job title",
  "company": "company name",
  "description": "full job description text, preserve all details",
  "skills": ["skill1", "skill2"],
  "requirements": ["requirement1", "requirement2"]
}

If a field is not found, use an empty string or empty array.

PAGE TEXT:
${rawText}`

  const raw = await callAI(config, system, user)
  // Strip markdown fences if present
  const cleaned = raw.replace(/^```(?:json)?\n?/i, '').replace(/\n?```$/i, '').trim()
  const parsed = JSON.parse(cleaned) as JD
  parsed.url = url
  return parsed
}

// Step 2: tailor resume to extracted JD
export async function tailorResume(config: AIConfig, jd: JD, baseResume: string): Promise<string> {
  const system = `You are an expert resume writer. Tailor the provided resume to match the job description. Preserve all facts — do NOT invent experience. Rewrite bullet points to use keywords from the JD. Return ONLY the tailored resume text, no explanation.`
  const user = `JOB: ${jd.title} at ${jd.company}

JOB DESCRIPTION:
${jd.description}

BASE RESUME:
${baseResume}

Tailor the resume to this job.`
  return callAI(config, system, user)
}

// Step 3: generate outreach message
export async function generateOutreach(config: AIConfig, jd: JD, contacts: { name: string }[]): Promise<string> {
  const system = `Write a concise, personalised LinkedIn referral outreach message (under 150 words). Sound human, not salesy. Return ONLY the message text.`
  const user = `Role: ${jd.title} at ${jd.company}
${contacts.length ? `Contact: ${contacts[0].name}` : ''}
JD summary: ${jd.description.slice(0, 500)}`
  return callAI(config, system, user)
}
