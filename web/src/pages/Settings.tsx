import { useEffect, useState } from 'react'
import Layout from '../components/Layout'
import { api } from '../api/client'

const PROVIDERS = [
  { label: 'Anthropic', url: 'https://api.anthropic.com/v1', placeholder: 'sk-ant-...' },
  { label: 'OpenAI', url: 'https://api.openai.com/v1', placeholder: 'sk-...' },
  { label: 'OpenRouter', url: 'https://openrouter.ai/api/v1', placeholder: 'sk-or-...' },
  { label: 'Custom', url: '', placeholder: 'https://your-endpoint/v1' },
]

export default function Settings() {
  const [provider, setProvider] = useState(PROVIDERS[0])
  const [customUrl, setCustomUrl] = useState('')
  const [model, setModel] = useState('claude-sonnet-4-6')
  const [apiKey, setApiKey] = useState('')
  const [hasKey, setHasKey] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [msg, setMsg] = useState('')

  useEffect(() => {
    api.get('/profile').then(r => {
      setHasKey(r.data.data.hasAiKey)
      if (r.data.data.aiModel) setModel(r.data.data.aiModel)
      if (r.data.data.aiProvider) {
        const found = PROVIDERS.find(p => p.url === r.data.data.aiProvider)
        if (found) setProvider(found)
        else { setProvider(PROVIDERS[3]); setCustomUrl(r.data.data.aiProvider) }
      }
    })
  }, [])

  async function save() {
    setSaving(true); setMsg('')
    const providerUrl = provider.url || customUrl
    if (!providerUrl) { setMsg('Enter a provider URL'); setSaving(false); return }
    await api.put('/profile', { aiProvider: providerUrl, aiModel: model, ...(apiKey ? { aiKey: apiKey } : {}) })
    setSaving(false); setSaved(true); setHasKey(true); setApiKey('')
    setTimeout(() => setSaved(false), 2000)
  }

  return (
    <Layout>
      <div className="max-w-2xl">
        <h1 className="text-xl font-medium text-gray-900 mb-6">Settings</h1>
        <div className="bg-white rounded-xl border border-gray-100 p-6">
          <h2 className="text-sm font-medium text-gray-900 mb-1">AI provider</h2>
          <p className="text-xs text-gray-500 mb-4">
            JobPilot uses your own API key — you pay your provider directly, your key is stored encrypted.
          </p>
          <div className="space-y-4">
            <div>
              <label className="text-xs text-gray-500 block mb-1">Provider</label>
              <div className="grid grid-cols-2 gap-2">
                {PROVIDERS.map(p => (
                  <button key={p.label} onClick={() => setProvider(p)}
                    className={`text-left px-3 py-2 rounded-lg border text-sm transition-colors
                      ${provider.label === p.label ? 'border-brand bg-blue-50 text-blue-700 font-medium' : 'border-gray-200 text-gray-700 hover:border-gray-300'}`}>
                    {p.label}
                  </button>
                ))}
              </div>
            </div>
            {provider.label === 'Custom' && (
              <div>
                <label className="text-xs text-gray-500 block mb-1">Provider base URL</label>
                <input value={customUrl} onChange={e => setCustomUrl(e.target.value)}
                  placeholder="https://your-endpoint/v1"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-brand" />
              </div>
            )}
            <div>
              <label className="text-xs text-gray-500 block mb-1">Model</label>
              <input value={model} onChange={e => setModel(e.target.value)}
                placeholder="e.g. claude-sonnet-4-6 or gpt-4o"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-brand" />
            </div>
            <div>
              <label className="text-xs text-gray-500 block mb-1">
                API key {hasKey && <span className="text-green-600 ml-1">✓ key saved</span>}
              </label>
              <input type="password" value={apiKey} onChange={e => setApiKey(e.target.value)}
                placeholder={hasKey ? 'Enter new key to replace existing' : provider.placeholder}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:border-brand" />
              <p className="text-xs text-gray-400 mt-1">Stored encrypted with AES-256. Never logged or shared.</p>
            </div>
            {msg && <p className="text-sm text-red-600">{msg}</p>}
            <button onClick={save} disabled={saving}
              className="bg-brand text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-600 disabled:opacity-50 transition-colors">
              {saving ? 'Saving...' : saved ? 'Saved ✓' : 'Save settings'}
            </button>
          </div>
        </div>
      </div>
    </Layout>
  )
}
