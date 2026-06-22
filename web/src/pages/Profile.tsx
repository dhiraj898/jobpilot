import { useEffect, useRef, useState } from 'react'
import AppShell from '../components/AppShell'
import { api } from '../api/client'

interface ProfileData {
  name: string
  currentTitle: string
  currentCompany: string
  location: string
  yearsExp: number  // e.g. 5.3 = 5 years 3 months
  summary: string
  rolesHeld: string[]
  targetRoles: string[]
  skills: string[]
  education: string
  certifications: string[]
  resumeFileName: string
  resumeText: string
  hasAiKey: boolean
}

const EMPTY: ProfileData = {
  name: '', currentTitle: '', currentCompany: '', location: '',
  yearsExp: 0, summary: '', rolesHeld: [], targetRoles: [],
  skills: [], education: '', certifications: [],
  resumeFileName: '', resumeText: '', hasAiKey: false,
}

function TagInput({ label, values, onChange, placeholder }: {
  label: string; values: string[]; onChange: (v: string[]) => void; placeholder?: string
}) {
  const [input, setInput] = useState('')
  function add() {
    const v = input.trim()
    if (v && !values.includes(v)) { onChange([...values, v]); setInput('') }
  }
  return (
    <div>
      <label className="text-xs font-medium text-gray-500 uppercase tracking-wide block mb-2">{label}</label>
      <div className="flex flex-wrap gap-1.5 mb-2 min-h-[28px]">
        {values.map(v => (
          <span key={v} className="inline-flex items-center gap-1 text-xs bg-blue-50 text-blue-700 border border-blue-100 px-2.5 py-1 rounded-full">
            {v}
            <button onClick={() => onChange(values.filter(x => x !== v))}
              className="text-blue-400 hover:text-blue-700 ml-0.5 leading-none">×</button>
          </span>
        ))}
        {values.length === 0 && <span className="text-xs text-gray-400 italic">None yet — add below</span>}
      </div>
      <div className="flex gap-2">
        <input value={input} onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), add())}
          placeholder={placeholder || `Add ${label.toLowerCase()}…`}
          className="flex-1 border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-100" />
        <button onClick={add}
          className="px-3 py-1.5 text-sm bg-gray-100 text-gray-600 rounded-lg hover:bg-gray-200 transition-colors">+ Add</button>
      </div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-xs font-medium text-gray-500 uppercase tracking-wide block mb-1.5">{label}</label>
      {children}
    </div>
  )
}

function TextInput({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <input value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-100" />
  )
}

export default function Profile() {
  const [profile, setProfile] = useState<ProfileData>(EMPTY)
  const [phase, setPhase] = useState<'upload' | 'parsing' | 'edit'>('upload')
  const [parseMsg, setParseMsg] = useState('')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    api.get('/profile').then(r => {
      const data = r.data.data
      if (data?.name) {
        setProfile({ ...EMPTY, ...data })
        setPhase('edit')
      }
    }).catch(() => {})
  }, [])

  async function handleFile(file: File) {
    setError('')
    setPhase('parsing')
    setParseMsg('Reading your resume…')

    const form = new FormData()
    form.append('resume', file)

    try {
      setParseMsg('Extracting your professional profile with AI…')
      const res = await api.post('/ai/parse-resume', form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      const parsed = res.data.data
      setProfile(p => ({
        ...p,
        name: parsed.name || p.name,
        currentTitle: parsed.currentTitle || p.currentTitle,
        currentCompany: parsed.currentCompany || p.currentCompany,
        location: parsed.location || p.location,
        yearsExp: parsed.yearsExp ?? p.yearsExp,
        summary: parsed.summary || p.summary,
        rolesHeld: parsed.rolesHeld?.length ? parsed.rolesHeld : p.rolesHeld,
        targetRoles: parsed.targetRoles?.length ? parsed.targetRoles : p.targetRoles,
        skills: parsed.skills?.length ? parsed.skills : p.skills,
        education: parsed.education || p.education,
        certifications: parsed.certifications?.length ? parsed.certifications : p.certifications,
        resumeFileName: file.name,
        resumeText: parsed.rawText || '',
      }))
      setPhase('edit')
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { error?: string } } })?.response?.data?.error || 'Could not parse resume'
      setError(msg)
      setPhase('upload')
    }
  }

  async function save() {
    setSaving(true); setError('')
    try {
      await api.put('/profile', profile)
      setSaved(true); setTimeout(() => setSaved(false), 2500)
    } catch {
      setError('Save failed — please try again')
    }
    setSaving(false)
  }

  // ── Upload phase ─────────────────────────────────────────────────────────────
  if (phase === 'upload') {
    return (
      <AppShell>
        <div className="px-8 py-8 bg-gray-50 min-h-screen">
        <div className="max-w-xl">
          <h1 className="text-xl font-medium text-gray-900 mb-1">Profile</h1>
          <p className="text-sm text-gray-500 mb-8">Upload your resume and we'll auto-fill your profile using AI.</p>

          <div
            className="border-2 border-dashed border-gray-200 rounded-2xl p-12 text-center hover:border-blue-300 hover:bg-blue-50/30 transition-all cursor-pointer group"
            onClick={() => fileRef.current?.click()}
            onDragOver={e => e.preventDefault()}
            onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f && /\.(pdf|docx|txt)$/i.test(f.name)) handleFile(f) }}
          >
            <div className="text-4xl mb-4">📄</div>
            <p className="text-base font-medium text-gray-700 mb-1 group-hover:text-blue-700 transition-colors">
              Drop your resume here
            </p>
            <p className="text-sm text-gray-400 mb-4">or click to browse</p>
            <span className="inline-block px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors">
              Choose file
            </span>
            <p className="text-xs text-gray-400 mt-4">PDF, Word (.docx), or TXT · max 10 MB</p>
            <p className="text-xs text-blue-500 mt-2 font-medium">Upload .docx to preserve your original formatting when downloading tailored CVs</p>
          </div>
          <input ref={fileRef} type="file" accept=".pdf,.docx,.txt" className="hidden"
            onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f) }} />

          {error && <p className="mt-4 text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-4 py-3">{error}</p>}

          <button onClick={() => setPhase('edit')}
            className="mt-6 text-sm text-gray-400 hover:text-gray-600 underline underline-offset-2 transition-colors">
            Skip and fill in manually →
          </button>
        </div>
        </div>
      </AppShell>
    )
  }

  // ── Parsing phase ─────────────────────────────────────────────────────────────
  if (phase === 'parsing') {
    return (
      <AppShell>
        <div className="px-8 py-8 bg-gray-50 min-h-screen flex items-start">
        <div className="max-w-xl w-full flex flex-col items-center justify-center py-24 text-center">
          <div className="w-12 h-12 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin mb-6" />
          <p className="text-base font-medium text-gray-700 mb-1">{parseMsg}</p>
          <p className="text-sm text-gray-400">This takes a few seconds</p>
        </div>
        </div>
      </AppShell>
    )
  }

  // ── Edit phase ────────────────────────────────────────────────────────────────
  return (
    <AppShell>
      <div className="px-8 py-8 bg-gray-50 min-h-screen">
      <div className="max-w-2xl">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-xl font-medium text-gray-900">Profile</h1>
            {profile.resumeFileName &&
              <p className="text-xs text-gray-400 mt-0.5">Extracted from <span className="font-medium text-gray-600">{profile.resumeFileName}</span></p>}
          </div>
          <button onClick={() => { setPhase('upload'); setError('') }}
            className="text-sm text-blue-600 hover:text-blue-700 border border-blue-200 hover:border-blue-300 px-3 py-1.5 rounded-lg transition-colors">
            ↑ Re-upload resume
          </button>
        </div>

        {error && <p className="mb-4 text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-4 py-3">{error}</p>}

        <div className="bg-white rounded-2xl border border-gray-100 divide-y divide-gray-50">

          {/* Identity */}
          <div className="p-6 space-y-4">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest">Identity</p>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Full name">
                <TextInput value={profile.name} onChange={v => setProfile(p => ({ ...p, name: v }))} placeholder="Your full name" />
              </Field>
              <Field label="Location">
                <TextInput value={profile.location} onChange={v => setProfile(p => ({ ...p, location: v }))} placeholder="City, Country" />
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Current title">
                <TextInput value={profile.currentTitle} onChange={v => setProfile(p => ({ ...p, currentTitle: v }))} placeholder="e.g. Senior Product Manager" />
              </Field>
              <Field label="Current company">
                <TextInput value={profile.currentCompany} onChange={v => setProfile(p => ({ ...p, currentCompany: v }))} placeholder="Where you work now" />
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Years of experience">
                <input type="number" min={0} max={50} step={0.1} value={profile.yearsExp}
                  onChange={e => setProfile(p => ({ ...p, yearsExp: parseFloat(e.target.value) || 0 }))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-100" />
              </Field>
              <Field label="Education">
                <TextInput value={profile.education} onChange={v => setProfile(p => ({ ...p, education: v }))} placeholder="Degree · Institution" />
              </Field>
            </div>
          </div>

          {/* Summary */}
          <div className="p-6">
            <Field label="Professional summary">
              <textarea value={profile.summary} onChange={e => setProfile(p => ({ ...p, summary: e.target.value }))}
                rows={3} placeholder="A concise summary of your professional arc and what you bring to the table"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-100 resize-none" />
            </Field>
          </div>

          {/* Roles */}
          <div className="p-6 space-y-4">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest">Career</p>
            <TagInput label="Roles you've held" values={profile.rolesHeld}
              onChange={v => setProfile(p => ({ ...p, rolesHeld: v }))}
              placeholder="Add a past title…" />
            <TagInput label="Roles you're targeting" values={profile.targetRoles}
              onChange={v => setProfile(p => ({ ...p, targetRoles: v }))}
              placeholder="e.g. VP of Product…" />
          </div>

          {/* Skills */}
          <div className="p-6">
            <TagInput label="Skills & tools" values={profile.skills}
              onChange={v => setProfile(p => ({ ...p, skills: v }))}
              placeholder="e.g. SQL, Figma, Jira…" />
          </div>

          {/* Certifications */}
          <div className="p-6">
            <TagInput label="Certifications" values={profile.certifications}
              onChange={v => setProfile(p => ({ ...p, certifications: v }))}
              placeholder="e.g. PMP, AWS Solutions Architect…" />
          </div>

        </div>

        <div className="mt-6 flex items-center gap-4">
          <button onClick={save} disabled={saving}
            className="bg-blue-600 text-white px-6 py-2.5 rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors">
            {saving ? 'Saving…' : saved ? '✓ Saved' : 'Save profile'}
          </button>
          {saved && <p className="text-sm text-green-600">Profile saved successfully.</p>}
        </div>
      </div>
      </div>
    </AppShell>
  )
}
