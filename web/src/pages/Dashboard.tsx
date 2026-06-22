import { useEffect, useState } from 'react'
import Layout from '../components/Layout'
import { api } from '../api/client'

interface Application { id: string; role: string; company: string; status: string; source: string; appliedAt: string }

const STATUS_BADGE: Record<string, string> = {
  applied: 'bg-blue-50 text-blue-700',
  interview: 'bg-amber-50 text-amber-700',
  offer: 'bg-green-50 text-green-700',
  rejected: 'bg-red-50 text-red-700',
}

export default function Dashboard() {
  const [apps, setApps] = useState<Application[]>([])
  const [total, setTotal] = useState(0)

  useEffect(() => {
    api.get('/applications?limit=5').then(r => {
      setApps(r.data.data.applications)
      setTotal(r.data.data.total)
    })
  }, [])

  const interviews = apps.filter(a => a.status === 'interview').length
  const offers = apps.filter(a => a.status === 'offer').length
  const responseRate = total ? Math.round((interviews + offers) / total * 100) : 0

  return (
    <Layout>
      <h1 className="text-xl font-medium text-gray-900 mb-1">Dashboard</h1>
      <p className="text-sm text-gray-500 mb-6">Your job search at a glance</p>

      <div className="grid grid-cols-4 gap-4 mb-8">
        {[
          { label: 'Total applied', value: total },
          { label: 'Interviews', value: interviews },
          { label: 'Offers', value: offers },
          { label: 'Response rate', value: `${responseRate}%` },
        ].map(s => (
          <div key={s.label} className="bg-white rounded-xl border border-gray-100 p-4">
            <p className="text-xs text-gray-400 mb-1">{s.label}</p>
            <p className="text-2xl font-medium text-gray-900">{s.value}</p>
          </div>
        ))}
      </div>

      <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h2 className="text-sm font-medium text-gray-900">Recent applications</h2>
          <a href="/applications" className="text-xs text-brand hover:underline">View all →</a>
        </div>
        <table className="w-full text-sm">
          <thead className="bg-gray-50">
            <tr>{['Role', 'Company', 'Applied', 'Source', 'Status'].map(h => (
              <th key={h} className="text-left text-xs text-gray-400 font-medium px-5 py-3">{h}</th>
            ))}</tr>
          </thead>
          <tbody>
            {apps.map(a => (
              <tr key={a.id} className="border-t border-gray-50">
                <td className="px-5 py-3 font-medium text-gray-900">{a.role}</td>
                <td className="px-5 py-3 text-gray-600">{a.company}</td>
                <td className="px-5 py-3 text-gray-400 text-xs">{new Date(a.appliedAt).toLocaleDateString()}</td>
                <td className="px-5 py-3 text-gray-400 text-xs capitalize">{a.source}</td>
                <td className="px-5 py-3">
                  <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium capitalize ${STATUS_BADGE[a.status] || 'bg-gray-100 text-gray-600'}`}>
                    {a.status}
                  </span>
                </td>
              </tr>
            ))}
            {apps.length === 0 && (
              <tr><td colSpan={5} className="px-5 py-8 text-center text-sm text-gray-400">
                No applications yet. Open the extension on a job page to get started.
              </td></tr>
            )}
          </tbody>
        </table>
      </div>
    </Layout>
  )
}
