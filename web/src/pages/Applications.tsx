import { useEffect, useState } from 'react'
import AppShell from '../components/AppShell'
import { api } from '../api/client'

interface Application { id: string; role: string; company: string; status: string; source: string; appliedAt: string; notes: string; url: string }

const STATUSES = ['all', 'applied', 'interview', 'offer', 'rejected']
const STATUS_BADGE: Record<string, string> = {
  applied: 'bg-blue-50 text-blue-700',
  interview: 'bg-amber-50 text-amber-700',
  offer: 'bg-green-50 text-green-700',
  rejected: 'bg-red-50 text-red-700',
}

export default function Applications() {
  const [apps, setApps] = useState<Application[]>([])
  const [filter, setFilter] = useState('all')
  const [loading, setLoading] = useState(true)

  function load(status: string) {
    setLoading(true)
    const q = status !== 'all' ? `?status=${status}&` : '?'
    api.get(`/applications${q}limit=100`).then(r => { setApps(r.data.data.applications); setLoading(false) })
  }

  useEffect(() => { load(filter) }, [filter])

  async function updateStatus(id: string, status: string) {
    await api.put(`/applications/${id}`, { status })
    setApps(prev => prev.map(a => a.id === id ? { ...a, status } : a))
  }

  return (
    <AppShell>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-medium text-gray-900">Applications</h1>
        <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
          {STATUSES.map(s => (
            <button key={s} onClick={() => setFilter(s)}
              className={`px-3 py-1 rounded-md text-xs font-medium capitalize transition-colors
                ${filter === s ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
              {s}
            </button>
          ))}
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50">
            <tr>{['Role', 'Company', 'Applied', 'Source', 'Status', 'Actions'].map(h => (
              <th key={h} className="text-left text-xs text-gray-400 font-medium px-5 py-3">{h}</th>
            ))}</tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan={6} className="px-5 py-8 text-center text-sm text-gray-400">Loading...</td></tr>}
            {!loading && apps.map(a => (
              <tr key={a.id} className="border-t border-gray-50 hover:bg-gray-50">
                <td className="px-5 py-3 font-medium text-gray-900">
                  {a.url ? <a href={a.url} target="_blank" rel="noreferrer" className="hover:text-brand">{a.role}</a> : a.role}
                </td>
                <td className="px-5 py-3 text-gray-600">{a.company}</td>
                <td className="px-5 py-3 text-gray-400 text-xs">{new Date(a.appliedAt).toLocaleDateString()}</td>
                <td className="px-5 py-3 text-gray-400 text-xs capitalize">{a.source}</td>
                <td className="px-5 py-3">
                  <select value={a.status} onChange={e => updateStatus(a.id, e.target.value)}
                    className={`text-xs font-medium px-2 py-0.5 rounded border-0 cursor-pointer ${STATUS_BADGE[a.status] || 'bg-gray-100 text-gray-600'}`}>
                    {['applied','interview','offer','rejected'].map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </td>
                <td className="px-5 py-3">
                  <button onClick={() => api.delete(`/applications/${a.id}`).then(() => setApps(prev => prev.filter(x => x.id !== a.id)))}
                    className="text-xs text-gray-400 hover:text-red-500">Remove</button>
                </td>
              </tr>
            ))}
            {!loading && apps.length === 0 && (
              <tr><td colSpan={6} className="px-5 py-8 text-center text-sm text-gray-400">No applications found.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </AppShell>
  )
}
