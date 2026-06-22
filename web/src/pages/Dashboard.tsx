import { useEffect, useRef, useState } from 'react'
import { DashboardLayoutComponent } from '@syncfusion/ej2-react-layouts'
import '@syncfusion/ej2-base/styles/tailwind3.css'
import '@syncfusion/ej2-react-layouts/styles/tailwind3.css'
import AppShell from '../components/AppShell'
import { api } from '../api/client'

interface Application {
  id: string; role: string; company: string; status: string; source: string; appliedAt: string
}

const STATUS_META: Record<string, { color: string; bg: string; dot: string }> = {
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

export default function Dashboard() {
  const dashboardRef = useRef<DashboardLayoutComponent>(null)
  const [apps, setApps] = useState<Application[]>([])
  const [total, setTotal] = useState(0)
  const [profile, setProfile] = useState<{ name?: string; resumeFileName?: string; skills?: string[]; currentTitle?: string } | null>(null)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    Promise.all([
      api.get('/applications?limit=100').then(r => { setApps(r.data.data.applications); setTotal(r.data.data.total) }),
      api.get('/profile').then(r => setProfile(r.data.data)),
    ]).catch(() => {}).finally(() => setReady(true))
  }, [])

  const interviews = apps.filter(a => a.status === 'interview').length
  const offers     = apps.filter(a => a.status === 'offer').length
  const rejected   = apps.filter(a => a.status === 'rejected').length
  const applied    = apps.filter(a => a.status === 'applied').length
  const responseRate = total ? Math.round((interviews + offers) / total * 100) : 0
  const interviewRate = total ? Math.round(interviews / total * 100) : 0
  const offerRate    = interviews ? Math.round(offers / interviews * 100) : 0

  // Weekly data — last 8 weeks
  const weeklyData = Array.from({ length: 8 }, (_, i) => {
    const end = new Date(); end.setDate(end.getDate() - (7 - i) * 7)
    const start = new Date(end); start.setDate(start.getDate() - 7)
    const count = apps.filter(a => { const d = new Date(a.appliedAt); return d >= start && d < end }).length
    const mo = end.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    return { label: mo, count }
  })
  const maxWeekly = Math.max(...weeklyData.map(w => w.count), 1)

  // Top companies
  const companyCounts: Record<string, number> = {}
  apps.forEach(a => { companyCounts[a.company] = (companyCounts[a.company] || 0) + 1 })
  const topCompanies = Object.entries(companyCounts).sort((a, b) => b[1] - a[1]).slice(0, 5)

  // Recent 8 apps sorted by date
  const recent = [...apps].sort((a, b) => new Date(b.appliedAt).getTime() - new Date(a.appliedAt).getTime()).slice(0, 8)

  // Profile completeness
  const checks = [
    { label: 'Profile name', done: !!profile?.name },
    { label: 'Resume uploaded', done: !!profile?.resumeFileName },
    { label: 'Skills added', done: !!(profile?.skills?.length) },
    { label: 'First application', done: total > 0 },
    { label: 'Got an interview', done: interviews > 0 },
  ]
  const completeness = Math.round(checks.filter(c => c.done).length / checks.length * 100)

  const today = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })
  const greeting = (() => {
    const h = new Date().getHours()
    if (h < 12) return 'Good morning'
    if (h < 17) return 'Good afternoon'
    return 'Good evening'
  })()

  const panels = [
    // Pipeline — full width
    { id: 'pipeline',    row: 0, col: 0, sizeX: 4, sizeY: 1, header: '<span class="ph">Application Pipeline</span>',   content: '<div id="pc-pipeline"></div>' },
    // Metric cards row
    { id: 'met-resp',   row: 1, col: 0, sizeX: 1, sizeY: 1, header: '<span class="ph">Response Rate</span>',           content: '<div id="pc-resp"></div>' },
    { id: 'met-int',    row: 1, col: 1, sizeX: 1, sizeY: 1, header: '<span class="ph">Interview Rate</span>',           content: '<div id="pc-int"></div>' },
    { id: 'met-offer',  row: 1, col: 2, sizeX: 1, sizeY: 1, header: '<span class="ph">Offer Conversion</span>',        content: '<div id="pc-offer"></div>' },
    { id: 'met-active', row: 1, col: 3, sizeX: 1, sizeY: 1, header: '<span class="ph">Active Pipeline</span>',         content: '<div id="pc-active"></div>' },
    // Recent activity + top companies
    { id: 'activity',   row: 2, col: 0, sizeX: 3, sizeY: 2, header: '<span class="ph">Recent Activity</span>',         content: '<div id="pc-activity"></div>' },
    { id: 'companies',  row: 2, col: 3, sizeX: 1, sizeY: 1, header: '<span class="ph">Top Companies</span>',           content: '<div id="pc-companies"></div>' },
    { id: 'setup',      row: 3, col: 3, sizeX: 1, sizeY: 1, header: '<span class="ph">Profile Setup</span>',           content: '<div id="pc-setup"></div>' },
    // Weekly chart — full width
    { id: 'chart',      row: 4, col: 0, sizeX: 4, sizeY: 1, header: '<span class="ph">Applications Over Time</span>',  content: '<div id="pc-chart"></div>' },
  ]

  useEffect(() => {
    if (!ready) return
    const t = setTimeout(() => {
      const set = (id: string, html: string) => { const el = document.getElementById(id); if (el) el.innerHTML = html }

      // Pipeline funnel
      const stages = [
        { label: 'Applied',    count: total,      color: '#3B5BFF', bg: '#EEF2FF' },
        { label: 'Interviews', count: interviews,  color: '#7C3AED', bg: '#F5F3FF' },
        { label: 'Offers',     count: offers,      color: '#0891B2', bg: '#ECFEFF' },
        { label: 'Rejected',   count: rejected,    color: '#DC2626', bg: '#FEF2F2' },
      ]
      const convArr = [
        total ? `${interviewRate}%` : '—',
        interviews ? `${offerRate}%` : '—',
        offers ? `${Math.round(offers / total * 100)}%` : '—',
      ]
      set('pc-pipeline', `<div class="pipe-wrap">
        ${stages.map((s, i) => `
          <div class="pipe-stage">
            <div class="pipe-card" style="background:${s.bg};border-top:3px solid ${s.color}">
              <p class="pipe-num" style="color:${s.color}">${s.count}</p>
              <p class="pipe-lbl">${s.label}</p>
            </div>
            ${i < stages.length - 1 ? `
              <div class="pipe-arrow">
                <span class="pipe-rate">${convArr[i]}</span>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#CBD5E1" stroke-width="2"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>
              </div>` : ''}
          </div>`).join('')}
      </div>`)

      // Metric cards
      const metCard = (val: string, sub: string, color: string, trend?: string) =>
        `<div class="met-wrap">
          <p class="met-val" style="color:${color}">${val}</p>
          <p class="met-sub">${sub}</p>
          ${trend ? `<span class="met-trend" style="color:${trend.startsWith('+') ? '#10B981' : '#EF4444'}">${trend}</span>` : ''}
        </div>`

      set('pc-resp',   metCard(`${responseRate}%`, 'of applications got a response', '#3B5BFF'))
      set('pc-int',    metCard(`${interviewRate}%`, 'made it to interview stage', '#7C3AED'))
      set('pc-offer',  metCard(`${offerRate}%`, 'of interviews led to offers', '#0891B2'))
      set('pc-active', metCard(`${applied + interviews}`, 'roles currently in play', '#F59E0B'))

      // Recent activity feed
      const feedItems = recent.length
        ? recent.map(a => {
            const m = STATUS_META[a.status] || STATUS_META.applied
            return `<div class="feed-row">
              <div class="feed-dot" style="background:${m.dot}"></div>
              <div class="feed-body">
                <div class="feed-top">
                  <span class="feed-role">${a.role}</span>
                  <span class="feed-time">${timeAgo(a.appliedAt)}</span>
                </div>
                <div class="feed-bot">
                  <span class="feed-co">${a.company}</span>
                  <span class="feed-badge" style="background:${m.bg};color:${m.color}">${a.status}</span>
                </div>
              </div>
            </div>`
          }).join('')
        : `<div style="padding:40px;text-align:center;color:#94A3B8;font-size:13px">No activity yet — use the extension on a LinkedIn job page to start applying.</div>`
      set('pc-activity', `<div class="feed-wrap">${feedItems}</div>`)

      // Top companies
      const maxCo = topCompanies[0]?.[1] || 1
      set('pc-companies', topCompanies.length
        ? `<div class="co-wrap">${topCompanies.map(([name, count]) => `
            <div class="co-row">
              <div class="co-avatar">${name[0].toUpperCase()}</div>
              <div class="co-body">
                <p class="co-name">${name}</p>
                <div class="co-bar-track"><div class="co-bar-fill" style="width:${Math.round(count/maxCo*100)}%"></div></div>
              </div>
              <span class="co-count">${count}</span>
            </div>`).join('')}
          </div>`
        : `<div style="padding:24px;text-align:center;color:#94A3B8;font-size:12px">No data yet</div>`)

      // Profile setup
      set('pc-setup', `<div class="setup-wrap">
        <div class="setup-ring-row">
          <div style="position:relative;width:56px;height:56px;flex-shrink:0">
            <svg viewBox="0 0 36 36" style="width:56px;height:56px">
              <circle cx="18" cy="18" r="15.9" fill="none" stroke="#F1F5F9" stroke-width="3.2"/>
              <circle cx="18" cy="18" r="15.9" fill="none" stroke="url(#grad)" stroke-width="3.2"
                stroke-dasharray="${completeness} ${100-completeness}" stroke-linecap="round"
                style="transform:rotate(-90deg);transform-origin:50% 50%"/>
              <defs><linearGradient id="grad" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stop-color="#3B5BFF"/><stop offset="100%" stop-color="#6941C6"/>
              </linearGradient></defs>
            </svg>
            <span style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:800;color:#3B5BFF">${completeness}%</span>
          </div>
          <div>
            <p class="setup-title">Setup complete</p>
            <p class="setup-sub">${checks.filter(c=>c.done).length} of ${checks.length} steps done</p>
          </div>
        </div>
        <div class="setup-checks">
          ${checks.map(c => `<div class="setup-check">
            <div class="check-icon" style="background:${c.done?'#3B5BFF':'#F1F5F9'};color:${c.done?'#fff':'#CBD5E1'}">
              ${c.done ? '✓' : ''}
            </div>
            <span style="font-size:12px;color:${c.done?'#1E293B':'#94A3B8'}">${c.label}</span>
          </div>`).join('')}
        </div>
      </div>`)

      // Weekly chart
      const maxH = 60
      set('pc-chart', `<div class="chart-outer">
        ${weeklyData.map(w => `
          <div class="chart-col2">
            <span class="chart-val2" style="opacity:${w.count>0?1:0}">${w.count}</span>
            <div class="chart-bar2" style="height:${w.count>0?Math.max(w.count/maxWeekly*maxH,8):2}px;background:${w.count>0?'linear-gradient(180deg,#3B5BFF,#6941C6)':'#E2E8F0'}"></div>
            <span class="chart-lbl2">${w.label}</span>
          </div>`).join('')}
      </div>`)
    }, 250)
    return () => clearTimeout(t)
  }, [ready, apps, total, interviews, offers, rejected, applied, responseRate, interviewRate, offerRate, recent, weeklyData, maxWeekly, topCompanies, completeness, checks, profile])

  return (
    <AppShell>
      {/* Top bar */}
      <div style={{ padding: '24px 32px 0', background: '#F4F6F9' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 700, color: '#0D1117', marginBottom: 2, letterSpacing: '-0.4px' }}>
              {greeting}{profile?.name ? `, ${profile.name.split(' ')[0]}` : ''}
            </h1>
            <p style={{ fontSize: 13, color: '#64748B' }}>{today} · Drag panels to customise your view</p>
          </div>
          <a href="/applications" style={{
            display: 'flex', alignItems: 'center', gap: 6, textDecoration: 'none',
            background: '#3B5BFF', color: '#fff', padding: '9px 18px', borderRadius: 8,
            fontSize: 13, fontWeight: 600, boxShadow: '0 2px 8px rgba(59,91,255,0.3)'
          }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            View All
          </a>
        </div>
      </div>

      {/* Styles */}
      <style>{`
        .e-dashboardlayout .e-panel {
          background: #ffffff !important;
          border: 1px solid #E2E8F0 !important;
          border-radius: 12px !important;
          box-shadow: 0 1px 4px rgba(0,0,0,0.05) !important;
          overflow: hidden !important;
          transition: box-shadow 0.2s, transform 0.2s !important;
        }
        .e-dashboardlayout .e-panel:hover {
          box-shadow: 0 4px 16px rgba(0,0,0,0.09) !important;
        }
        .e-dashboardlayout .e-panel .e-panel-header {
          height: 44px !important;
          display: flex !important;
          align-items: center !important;
          border-bottom: 1px solid #F1F5F9 !important;
          background: #FAFBFF !important;
          cursor: grab !important;
          padding: 0 !important;
        }
        .e-dashboardlayout .e-panel .e-panel-header:active { cursor: grabbing !important; }
        .e-dashboardlayout .e-panel .e-panel-content {
          height: calc(100% - 44px) !important;
          overflow: auto !important;
          padding: 0 !important;
        }
        .e-dashboardlayout .e-drag {
          opacity: 0.92 !important;
          box-shadow: 0 16px 48px rgba(0,0,0,0.16) !important;
          transform: rotate(1deg) !important;
        }
        .ph { font-size: 13px; font-weight: 700; color: #1E293B; padding: 0 18px; letter-spacing: -0.2px }

        /* Pipeline */
        .pipe-wrap { display:flex; align-items:center; padding:16px 20px; gap:0; height:100% }
        .pipe-stage { display:flex; align-items:center; flex:1; gap:0 }
        .pipe-card { flex:1; padding:14px 16px; border-radius:10px; text-align:center }
        .pipe-num { font-size:32px; font-weight:800; line-height:1; margin-bottom:4px; letter-spacing:-1px }
        .pipe-lbl { font-size:11px; font-weight:600; color:#64748B; text-transform:uppercase; letter-spacing:0.05em }
        .pipe-arrow { display:flex; flex-direction:column; align-items:center; gap:2px; padding:0 10px; flex-shrink:0 }
        .pipe-rate { font-size:11px; font-weight:700; color:#94A3B8 }

        /* Metric cards */
        .met-wrap { padding:20px 22px; height:100%; display:flex; flex-direction:column; justify-content:center }
        .met-val { font-size:38px; font-weight:800; line-height:1; margin-bottom:5px; letter-spacing:-1.5px }
        .met-sub { font-size:12px; color:#64748B; line-height:1.4 }
        .met-trend { font-size:12px; font-weight:600; margin-top:6px; display:block }

        /* Activity feed */
        .feed-wrap { padding:8px 0; }
        .feed-row { display:flex; align-items:flex-start; gap:12px; padding:12px 20px; border-bottom:1px solid #F8FAFC; transition:background 0.1s }
        .feed-row:hover { background:#FAFBFF }
        .feed-row:last-child { border-bottom:none }
        .feed-dot { width:9px; height:9px; border-radius:50%; margin-top:5px; flex-shrink:0 }
        .feed-body { flex:1; min-width:0 }
        .feed-top { display:flex; justify-content:space-between; align-items:baseline; gap:8px; margin-bottom:3px }
        .feed-role { font-size:13px; font-weight:600; color:#1E293B; overflow:hidden; text-overflow:ellipsis; white-space:nowrap }
        .feed-time { font-size:11px; color:#94A3B8; flex-shrink:0 }
        .feed-bot { display:flex; align-items:center; gap:8px }
        .feed-co { font-size:12px; color:#64748B }
        .feed-badge { font-size:11px; font-weight:600; padding:2px 8px; border-radius:5px; text-transform:capitalize; margin-left:auto }

        /* Top companies */
        .co-wrap { padding:12px 18px }
        .co-row { display:flex; align-items:center; gap:10px; margin-bottom:12px }
        .co-avatar { width:28px; height:28px; border-radius:7px; background:linear-gradient(135deg,#3B5BFF20,#6941C620); display:flex; align-items:center; justify-content:center; font-size:12px; font-weight:700; color:#3B5BFF; flex-shrink:0 }
        .co-body { flex:1; min-width:0 }
        .co-name { font-size:12px; font-weight:600; color:#1E293B; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; margin-bottom:4px }
        .co-bar-track { height:4px; background:#F1F5F9; border-radius:2px; overflow:hidden }
        .co-bar-fill { height:100%; background:linear-gradient(90deg,#3B5BFF,#6941C6); border-radius:2px }
        .co-count { font-size:12px; font-weight:700; color:#64748B; flex-shrink:0 }

        /* Profile setup */
        .setup-wrap { padding:16px 18px }
        .setup-ring-row { display:flex; align-items:center; gap:12px; margin-bottom:14px }
        .setup-title { font-size:13px; font-weight:700; color:#1E293B }
        .setup-sub { font-size:11px; color:#64748B; margin-top:2px }
        .setup-checks { display:flex; flex-direction:column; gap:8px }
        .setup-check { display:flex; align-items:center; gap:9px }
        .check-icon { width:18px; height:18px; border-radius:5px; display:flex; align-items:center; justify-content:center; font-size:11px; font-weight:700; flex-shrink:0 }

        /* Chart */
        .chart-outer { display:flex; align-items:flex-end; gap:6px; padding:12px 20px 14px; height:calc(100% - 26px) }
        .chart-col2 { flex:1; display:flex; flex-direction:column; align-items:center; gap:4px }
        .chart-val2 { font-size:11px; font-weight:700; color:#3B5BFF; min-height:15px }
        .chart-bar2 { width:100%; border-radius:4px 4px 0 0; min-height:2px; transition:height 0.5s }
        .chart-lbl2 { font-size:10px; color:#94A3B8; white-space:nowrap }
      `}</style>

      {/* Dashboard */}
      <div style={{ padding: '0 32px 32px' }}>
        <DashboardLayoutComponent
          ref={dashboardRef}
          id="jobpilot-dashboard"
          columns={4}
          cellSpacing={[14, 14]}
          cellAspectRatio={2.4}
          panels={panels}
          allowDragging={true}
          allowResizing={false}
          allowFloating={true}
          enablePersistence={true}
          mediaQuery="max-width:900px"
          draggableHandle=".e-panel-header"
        />
      </div>
    </AppShell>
  )
}
