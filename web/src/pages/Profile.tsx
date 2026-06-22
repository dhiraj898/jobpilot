import { useEffect, useState } from 'react'
import Layout from '../components/Layout'
import { api } from '../api/client'

interface ProfileData {
  name: string; currentTitle: string; yearsExp: number;
  targetRoles: string[]; skills: string[]; locations: string[];
  resumeFileName: string; hasAiKey: boolean;
}

function TagInput({ label, values, onChange }: { label: string; values: string[]; onChange: (v: string[]) => void }) {
  const [input, setInput] = useState('')
  function add() {
    if (input.trim() && !values.includes(input.trim())) { onChange([...values, input.trim()]); setInput('') }
  }
  return (
    <div>
      <label className="text-xs text-gray-500 block mb-1">{label}</label>
      <div className="flex flex-wrap gap-1.5 mb-2">
        {values.map(v => (
          <span key={v} className="flex items-center gap-1 text-xs bg-gray-100 text-gray-700 px-2 py-1 rounded-md">
            {v} <button onClick={() => onChange(values.filter(x => x !== v))} className="text-gray-400 hover:text-gray-700">×</button>
          </span>
        ))}
      </div>
      <div className="flex gap-2">
        <input value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), add())}
          placeholder={`Add ${label.toLowerCase()}...`}
          className="flex-1 border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-brand" />
        <button onClick={add} className="px-3 py-1.5 text-sm bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200">Add</button>
      </div>
    </div>
  )
}

export default function Profile() {
  const [profile, setProfile] = useState<ProfileData>({ name: '', currentTitle: '', yearsExp: 0, targetRoles: [], skills: [], locations: [], resumeFileName: '', hasAiKey: false })
  const [resumeText, setResumeText] = useState('')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => { api.get('/profile').then(r => setProfile(r.data.data)) }, [])

  async function handleResumeFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const text = await file.text()
    setResumeText(text)
    setProfile(p => ({ ...p, resumeFileName: file.name }))
  }

  async function save() {
    setSaving(true)
    await api.put('/profile', { ...profile, resumeText: resumeText || undefined })
    setSaving(false); setSaved(true); setTimeout(() => setSaved(false), 2000)
  }

  return (
    <Layout>
      <div className="max-w-2xl">
        <h1 className="text-xl font-medium text-gray-900 mb-6">Profile</h1>
        <div className="bg-white rounded-xl border border-gray-100 p-6 space-y-5">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs text-gray-500 block mb-1">Full name</label>
              <input value={profile.name} onChange={e => setProfile(p => ({ ...p, name: e.target.value }))}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-brand" />
            </div>
            <div>
              <label className="text-xs text-gray-500 block mb-1">Current title</label>
              <input value={profile.currentTitle} onChange={e => setProfile(p => ({ ...p, currentTitle: e.target.value }))}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-brand" />
            </div>
          </div>
          <div>
            <label className="text-xs text-gray-500 block mb-1">Years of experience</label>
            <input type="number" min={0} max={40} value={profile.yearsExp}
              onChange={e => setProfile(p => ({ ...p, yearsExp: parseInt(e.target.value) || 0 }))}
              className="w-32 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-brand" />
          </div>
          <TagInput label="Target roles" values={profile.targetRoles} onChange={v => setProfile(p => ({ ...p, targetRoles: v }))} />
          <TagInput label="Skills" values={profile.skills} onChange={v => setProfile(p => ({ ...p, skills: v }))} />
          <TagInput label="Preferred locations" values={profile.locations} onChange={v => setProfile(p => ({ ...p, locations: v }))} />
          <div>
            <label className="text-xs text-gray-500 block mb-2">Base resume</label>
            {profile.resumeFileName && <div className="text-sm text-gray-700 mb-2">📄 {profile.resumeFileName}</div>}
            <input type="file" accept=".pdf,.docx,.txt" onChange={handleResumeFile} className="text-sm text-gray-600" />
            <p className="text-xs text-gray-400 mt-1">Upload PDF, DOCX, or TXT — your base resume for AI tailoring</p>
          </div>
          <button onClick={save} disabled={saving}
            className="bg-brand text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-600 disabled:opacity-50 transition-colors">
            {saving ? 'Saving...' : saved ? 'Saved ✓' : 'Save profile'}
          </button>
        </div>
      </div>
    </Layout>
  )
}
