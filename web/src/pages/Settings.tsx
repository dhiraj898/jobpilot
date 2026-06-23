import { useEffect, useState } from 'react'
import AppShell from '../components/AppShell'
import { api } from '../api/client'

const PROVIDERS = [
  {
    label: 'Sarvam AI',
    url: 'https://api.sarvam.ai/v1',
    placeholder: 'sk_…',
    models: [
      { id: 'sarvam-m', label: 'Sarvam-M (recommended — fast, accurate)' },
      { id: 'sarvam-105b', label: 'Sarvam-105B (most capable)' },
    ],
  },
]

export default function Settings() {
  const [selectedProvider, setSelectedProvider] = useState(PROVIDERS[0])
  const [model, setModel] = useState(PROVIDERS[0].models[0].id)
  const [apiKey, setApiKey] = useState('')
  const [hasKey, setHasKey] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [msg, setMsg] = useState('')

  useEffect(() => {
    api.get('/profile').then(r => {
      const d = r.data.data
      setHasKey(d.hasAiKey)
      if (d.aiModel) setModel(d.aiModel)
      if (d.aiProvider) {
        const found = PROVIDERS.find(p => p.url === d.aiProvider)
        if (found) {
          setSelectedProvider(found)
          // keep existing model if it matches provider
          if (!found.models.find((m: { id: string }) => m.id === d.aiModel)) {
            setModel(found.models[0].id)
          }
        }
      }
    })
  }, [])

  function handleProviderSelect(p: typeof PROVIDERS[0]) {
    setSelectedProvider(p)
    setModel(p.models[0].id)
    setApiKey('')
    setMsg('')
  }

  async function save() {
    setSaving(true); setMsg('')
    try {
      await api.put('/profile', {
        aiProvider: selectedProvider.url,
        aiModel: model,
        ...(apiKey ? { aiKey: apiKey } : {}),
      })
      setSaved(true); setHasKey(true); setApiKey('')
      setTimeout(() => setSaved(false), 2500)
    } catch {
      setMsg('Failed to save. Please try again.')
    } finally { setSaving(false) }
  }

  return (
    <AppShell>
      <div className="px-8 py-8 bg-gray-50 min-h-screen">
      <div className="max-w-2xl">
        <h1 className="text-xl font-medium text-gray-900 mb-6">Settings</h1>
        <div className="bg-white rounded-xl border border-gray-100 p-6">
          <h2 className="text-sm font-medium text-gray-900 mb-1">AI provider</h2>
          <p className="text-xs text-gray-500 mb-2">
            JobPilot uses your own API key — stored AES-256 encrypted in the database, never logged or shared.
          </p>
          <p className="text-xs bg-blue-50 text-blue-700 rounded-lg px-3 py-2 mb-4">
            JobPilot uses <strong>Sarvam AI</strong> for JD extraction and resume tailoring. Get your API key at <a href="https://dashboard.sarvam.ai" target="_blank" rel="noreferrer" className="underline">dashboard.sarvam.ai</a>.
          </p>

          {/* Model dropdown */}
          <div className="mb-4">
            <label className="text-xs text-gray-500 block mb-1">Model</label>
            <select
              value={model}
              onChange={e => setModel(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-brand bg-white"
            >
              {selectedProvider.models.map(m => (
                <option key={m.id} value={m.id}>{m.label}</option>
              ))}
            </select>
          </div>

          {/* API Key */}
          <div className="mb-5">
            <label className="text-xs text-gray-500 block mb-1">
              API Key
              {hasKey && <span className="ml-2 text-green-600 font-medium">✓ key saved</span>}
            </label>
            <input
              type="password"
              value={apiKey}
              onChange={e => setApiKey(e.target.value)}
              placeholder={hasKey ? 'Enter new key to replace existing' : selectedProvider.placeholder}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:border-brand"
            />
            <p className="text-xs text-gray-400 mt-1">
              Stored encrypted in your account. Used only to call {selectedProvider.label} on your behalf.
            </p>
          </div>

          {msg && <p className="text-sm text-red-600 mb-3">{msg}</p>}

          <button
            onClick={save}
            disabled={saving}
            className="bg-brand text-white px-5 py-2 rounded-lg text-sm font-medium hover:bg-blue-600 disabled:opacity-50 transition-colors"
          >
            {saving ? 'Saving…' : saved ? 'Saved ✓' : 'Save settings'}
          </button>
        </div>
      </div>
      </div>
    </AppShell>
  )
}
