import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import AppShell from '../components/AppShell'
import { api } from '../api/client'

interface Application {
  id: string; role: string; company: string; status: string; source: string; appliedAt: string
}

const STATUS_META: Record<string, { color: string; bg: string; dot: string }> = {
  saved:     { color: '#374151', bg: '#F3F4F6', dot: '#9CA3AF' },
  applied:   { color: '#1D4ED8', bg: '#EFF6FF', dot: '#3B82F6' },
  interview: { color: '#92400E', bg: '#FEF3C7', dot: '#F59E0B' },
  offer:     { color: '#065F46', bg: '#ECFDF5', dot: '#10B981' },
  rejected:  { color: '#991B1B', bg: '#FEF2F2', dot: '#EF4444' },
}

function timeAgo(date: string) {
  const d = Math.floor((Date.now() - new Date(date).getTime()) / 1000)
  if (d < 3600) return `${Math.floor(d / 60)}m ago`
  if (d < 86400) return `${Math.floor(d / 3600)}h ago`
  return `${Math.floor(d / 86400)}d ago`
}

function Card({ title, children, style }: { title: string; children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={{
      background: '#fff', borderRadius: 12, border: '1px solid #E2E8F0',
      boxShadow: '0 1px 4px rgba(0,0,0,0.05)', overflow: 'hidden', ...style
    }}>
      <div style={{ padding: '14px 20px', borderBottom: '1px solid #F1F5F9', background: '#FAFBFF' }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: '#1E293B', letterSpacing: '-0.2px' }}>{title}</span>
      </div>
      <div style={{ padding: 20 }}>{children}</div>
    </div>
  )
}

export default function Dashboard() {
  const navigate = useNavigate()
  const [apps, setApps] = useState<Application[]>([])
  const [total, setTotal] = useState(0)
  const [profile, setProfile] = useState<{ name?: string; resumeFileName?: string; skills?: string[]; currentTitle?: string; sarvamApiKey?: string } | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    api.get('/applications?limit=200')
      .then(r => { setApps(r.data.data.applications); setTotal(r.data.data.total) })
      .catch(err => setError(err.message || 'Failed to load dashboard data'))
    api.get('/profile')
      .then(r => setProfile(r.data.data))
      .catch(err => setError(err.message || 'Failed to load profile'))
  }, [])

  const saved     = apps.filter(a => a.status === 'saved').length
  const interviews = apps.filter(a => a.status === 'interview').length
  const offers     = apps.filter(a => a.status === 'offer').length
  const rejected   = apps.filter(a => a.status === 'rejected').length
  const applied    = apps.filter(a => a.status === 'applied').length
  const responseRate  = total ? Math.round((interviews + offers) / total * 100) : 0
  const interviewRate = total ? Math.round(interviews / total * 100) : 0
  const offerRate     = interviews ? Math.round(offers / interviews * 100) : 0

  const companyCounts: Record<string, number> = {}
  apps.forEach(a => { companyCounts[a.company] = (companyCounts[a.company] || 0) + 1 })
  const topCompanies = Object.entries(companyCounts).sort((a, b) => b[1] - a[1]).slice(0, 5)
  const maxCo = topCompanies[0]?.[1] || 1

  const recent = [...apps].sort((a, b) => new Date(b.appliedAt).getTime() - new Date(a.appliedAt).getTime()).slice(0, 8)

  const weeklyData = Array.from({ length: 8 }, (_, i) => {
    const end = new Date(); end.setDate(end.getDate() - (7 - i) * 7)
    const start = new Date(end); start.setDate(start.getDate() - 7)
    const count = apps.filter(a => { const d = new Date(a.appliedAt); return d >= start && d < end }).length
    return { label: end.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }), count }
  })
  const maxWeekly = Math.max(...weeklyData.map(w => w.count), 1)

  const checks = [
    { label: 'Profile name', done: !!profile?.name },
    { label: 'Resume uploaded', done: !!profile?.resumeFileName },
    { label: 'Skills added', done: !!(profile?.skills?.length) },
    { label: 'First application', done: total > 0 },
    { label: 'Got an interview', done: interviews > 0 },
    { label: 'Configure AI key', done: !!profile?.sarvamApiKey },
  ]
  const completeness = Math.round(checks.filter(c => c.done).length / checks.length * 100)
  const circum = 2 * Math.PI * 15.9
  const dash = (completeness / 100) * circum

  const greeting = (() => {
    const h = new Date().getHours()
    if (h < 12) return 'Good morning'
    if (h < 17) return 'Good afternoon'
    return 'Good evening'
  })()
  const today = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })

  const pipeline = [
    { label: 'Saved',      count: saved,      color: '#6B7280', bg: '#F3F4F6' },
    { label: 'Applied',    count: total,      color: '#3B5BFF', bg: '#EEF2FF' },
    { label: 'Interviews', count: interviews,  color: '#7C3AED', bg: '#F5F3FF' },
    { label: 'Offers',     count: offers,      color: '#0891B2', bg: '#ECFEFF' },
    { label: 'Rejected',   count: rejected,    color: '#DC2626', bg: '#FEF2F2' },
  ]
  const convRates = [
    total      ? `${Math.round(applied / Math.max(saved,1) * 100)}%` : '—',
    total      ? `${interviewRate}%` : '—',
    interviews ? `${offerRate}%` : '—',
    offers     ? `${Math.round(offers / total * 100)}%` : '—',
  ]

  const metCards = [
    { label: 'Response Rate',      value: `${responseRate}%`, sub: 'of applications got a response', color: '#3B5BFF' },
    { label: 'Interview Rate',     value: `${interviewRate}%`, sub: 'made it to interview stage',     color: '#7C3AED' },
    { label: 'Offer Conversion',   value: `${offerRate}%`,    sub: 'of interviews led to offers',    color: '#0891B2' },
    { label: 'Active Pipeline',    value: `${applied + interviews}`, sub: 'roles currently in play', color: '#F59E0B' },
  ]

  return (
    <AppShell>
      <div style={{ padding: '24px 32px 40px', background: '#F4F6F9', minHeight: '100vh' }}>

        {error && (
          <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded text-amber-800 text-sm">
            {error} — try refreshing the page.
          </div>
        )}

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 28 }}>
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 700, color: '#0D1117', marginBottom: 2, letterSpacing: '-0.4px' }}>
              {greeting}{profile?.name ? `, ${profile.name.split(' ')[0]}` : ''}
            </h1>
            <p style={{ fontSize: 13, color: '#64748B' }}>{today}</p>
          </div>
          <button onClick={() => navigate('/applications')} style={{
            display: 'flex', alignItems: 'center', gap: 6, textDecoration: 'none',
            background: '#3B5BFF', color: '#fff', padding: '9px 18px', borderRadius: 8,
            fontSize: 13, fontWeight: 600, boxShadow: '0 2px 8px rgba(59,91,255,0.3)',
            border: 'none', cursor: 'pointer'
          }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            View All
          </button>
        </div>

        {/* Pipeline funnel */}
        <Card title="Application Pipeline" style={{ marginBottom: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 0 }}>
            {pipeline.map((s, i) => (
              <div key={s.label} style={{ display: 'flex', alignItems: 'center', flex: 1 }}>
                <div style={{ flex: 1, background: s.bg, borderTop: `3px solid ${s.color}`, borderRadius: 10, padding: '14px 16px', textAlign: 'center' }}>
                  <p style={{ fontSize: 32, fontWeight: 800, color: s.color, lineHeight: 1, marginBottom: 4, letterSpacing: '-1px' }}>{s.count}</p>
                  <p style={{ fontSize: 11, fontWeight: 600, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{s.label}</p>
                </div>
                {i < pipeline.length - 1 && (
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '0 10px', flexShrink: 0 }}>
                    <span style={{ fontSize: 11, fontWeight: 700, color: '#94A3B8', marginBottom: 2 }}>{convRates[i]}</span>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#CBD5E1" strokeWidth="2"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>
                  </div>
                )}
              </div>
            ))}
          </div>
        </Card>

        {/* Metric cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14, marginBottom: 20 }}>
          {metCards.map(m => (
            <div key={m.label} style={{ background: '#fff', borderRadius: 12, border: '1px solid #E2E8F0', boxShadow: '0 1px 4px rgba(0,0,0,0.05)', padding: '20px 22px' }}>
              <p style={{ fontSize: 11, fontWeight: 700, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>{m.label}</p>
              <p style={{ fontSize: 36, fontWeight: 800, color: m.color, lineHeight: 1, letterSpacing: '-1.5px', marginBottom: 6 }}>{m.value}</p>
              <p style={{ fontSize: 12, color: '#64748B', lineHeight: 1.4 }}>{m.sub}</p>
            </div>
          ))}
        </div>

        {/* Activity feed + sidebar */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 280px', gap: 14, marginBottom: 20 }}>

          {/* Activity feed */}
          <Card title="Recent Activity">
            {recent.length === 0
              ? <p style={{ fontSize: 13, color: '#94A3B8', textAlign: 'center', padding: '24px 0' }}>No activity yet — use the extension on a LinkedIn job page to start applying.</p>
              : recent.map(a => {
                  const m = STATUS_META[a.status] || STATUS_META.applied
                  return (
                    <div key={a.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: '10px 0', borderBottom: '1px solid #F8FAFC' }}>
                      <div style={{ width: 9, height: 9, borderRadius: '50%', background: m.dot, marginTop: 5, flexShrink: 0 }} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 3 }}>
                          <span style={{ fontSize: 13, fontWeight: 600, color: '#1E293B', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.role}</span>
                          <span style={{ fontSize: 11, color: '#94A3B8', flexShrink: 0, marginLeft: 8 }}>{timeAgo(a.appliedAt)}</span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span style={{ fontSize: 12, color: '#64748B' }}>{a.company}</span>
                          <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 5, background: m.bg, color: m.color, textTransform: 'capitalize', marginLeft: 'auto' }}>{a.status}</span>
                        </div>
                      </div>
                    </div>
                  )
                })
            }
          </Card>

          {/* Right column */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

            {/* Top companies */}
            <Card title="Top Companies">
              {topCompanies.length === 0
                ? <p style={{ fontSize: 12, color: '#94A3B8', textAlign: 'center', padding: '12px 0' }}>No data yet</p>
                : topCompanies.map(([name, count]) => (
                    <div key={name} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                      <div style={{ width: 28, height: 28, borderRadius: 7, background: 'linear-gradient(135deg,#3B5BFF20,#6941C620)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, color: '#3B5BFF', flexShrink: 0 }}>
                        {name[0].toUpperCase()}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{ fontSize: 12, fontWeight: 600, color: '#1E293B', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginBottom: 4 }}>{name}</p>
                        <div style={{ height: 4, background: '#F1F5F9', borderRadius: 2, overflow: 'hidden' }}>
                          <div style={{ height: '100%', width: `${Math.round(count / maxCo * 100)}%`, background: 'linear-gradient(90deg,#3B5BFF,#6941C6)', borderRadius: 2 }} />
                        </div>
                      </div>
                      <span style={{ fontSize: 12, fontWeight: 700, color: '#64748B', flexShrink: 0 }}>{count}</span>
                    </div>
                  ))
              }
            </Card>

            {/* Profile setup */}
            <Card title="Profile Setup">
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
                <div style={{ position: 'relative', width: 56, height: 56, flexShrink: 0 }}>
                  <svg viewBox="0 0 36 36" style={{ width: 56, height: 56, transform: 'rotate(-90deg)' }}>
                    <circle cx="18" cy="18" r="15.9" fill="none" stroke="#F1F5F9" strokeWidth="3.2" />
                    <circle cx="18" cy="18" r="15.9" fill="none" stroke="url(#pg)" strokeWidth="3.2"
                      strokeDasharray={`${dash} ${circum - dash}`} strokeLinecap="round" />
                    <defs>
                      <linearGradient id="pg" x1="0%" y1="0%" x2="100%" y2="0%">
                        <stop offset="0%" stopColor="#3B5BFF" /><stop offset="100%" stopColor="#6941C6" />
                      </linearGradient>
                    </defs>
                  </svg>
                  <span style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 800, color: '#3B5BFF' }}>{completeness}%</span>
                </div>
                <div>
                  <p style={{ fontSize: 13, fontWeight: 700, color: '#1E293B' }}>Setup complete</p>
                  <p style={{ fontSize: 11, color: '#64748B', marginTop: 2 }}>{checks.filter(c => c.done).length} of {checks.length} steps done</p>
                </div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {checks.map(c => (
                  <div key={c.label} style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                    <div style={{ width: 18, height: 18, borderRadius: 5, background: c.done ? '#3B5BFF' : '#F1F5F9', color: c.done ? '#fff' : '#CBD5E1', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, flexShrink: 0 }}>
                      {c.done ? '✓' : ''}
                    </div>
                    <span style={{ fontSize: 12, color: c.done ? '#1E293B' : '#94A3B8' }}>{c.label}</span>
                    {c.label === 'Configure AI key' && !c.done && (
                      <button onClick={() => navigate('/settings')} style={{ fontSize: 11, color: '#3B5BFF', textDecoration: 'underline', background: 'none', border: 'none', cursor: 'pointer', marginLeft: 4, padding: 0 }}>
                        Go to Settings
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </Card>
          </div>
        </div>

        {/* Weekly chart */}
        <Card title="Applications Over Time">
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8, height: 100 }}>
            {weeklyData.map((w, i) => (
              <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, height: '100%', justifyContent: 'flex-end' }}>
                {w.count > 0 && <span style={{ fontSize: 11, fontWeight: 700, color: '#3B5BFF' }}>{w.count}</span>}
                <div style={{
                  width: '100%', borderRadius: '4px 4px 0 0',
                  height: w.count > 0 ? `${Math.max(w.count / maxWeekly * 70, 8)}px` : '2px',
                  background: w.count > 0 ? 'linear-gradient(180deg,#3B5BFF,#6941C6)' : '#E2E8F0'
                }} />
                <span style={{ fontSize: 10, color: '#94A3B8', whiteSpace: 'nowrap' }}>{w.label}</span>
              </div>
            ))}
          </div>
        </Card>

      </div>
    </AppShell>
  )
}
