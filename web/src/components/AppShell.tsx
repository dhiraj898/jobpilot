import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../store/auth'

const NAV = [
  { path: '/dashboard', label: 'Dashboard', icon: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/>
    </svg>) },
  { path: '/applications', label: 'Applications', icon: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/>
    </svg>) },
  { path: '/profile', label: 'Profile', icon: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>
    </svg>) },
  { path: '/settings', label: 'Settings', icon: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
    </svg>) },
]

export default function AppShell({ children }: { children: React.ReactNode }) {
  const location = useLocation()
  const logout = useAuth(s => s.logout)
  const user = useAuth(s => s.user)
  const navigate = useNavigate()

  function handleLogout() { logout(); navigate('/login') }

  const initials = user?.email ? user.email[0].toUpperCase() : 'U'

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: '#F4F6F9', fontFamily: "-apple-system, BlinkMacSystemFont, 'Inter', 'Segoe UI', sans-serif" }}>
      {/* Sidebar */}
      <aside style={{
        width: 220, flexShrink: 0, background: '#0D1117', display: 'flex',
        flexDirection: 'column', padding: '20px 0', position: 'fixed',
        height: '100vh', zIndex: 10, borderRight: '1px solid #1C2333'
      }}>
        {/* Logo */}
        <div style={{ padding: '0 20px 24px', borderBottom: '1px solid #1C2333', marginBottom: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{
              width: 32, height: 32, background: 'linear-gradient(135deg, #3B5BFF 0%, #6941C6 100%)',
              borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 13, fontWeight: 800, color: '#fff', letterSpacing: '-0.5px'
            }}>JP</div>
            <span style={{ color: '#fff', fontWeight: 700, fontSize: 15, letterSpacing: '-0.3px' }}>JobPilot</span>
          </div>
        </div>

        {/* Nav items */}
        <nav style={{ flex: 1, padding: '0 10px', display: 'flex', flexDirection: 'column', gap: 2 }}>
          {NAV.map(n => {
            const active = location.pathname === n.path
            return (
              <Link key={n.path} to={n.path} style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '9px 12px', borderRadius: 8, textDecoration: 'none',
                color: active ? '#fff' : '#8B949E',
                background: active ? '#1C2333' : 'transparent',
                fontWeight: active ? 600 : 400, fontSize: 14,
                transition: 'all 0.15s',
              }}>
                <span style={{ color: active ? '#3B5BFF' : '#8B949E', flexShrink: 0 }}>{n.icon}</span>
                {n.label}
                {active && <div style={{ marginLeft: 'auto', width: 5, height: 5, borderRadius: '50%', background: '#3B5BFF' }} />}
              </Link>
            )
          })}
        </nav>

        {/* User footer */}
        <div style={{ padding: '16px 20px', borderTop: '1px solid #1C2333', display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            width: 32, height: 32, borderRadius: '50%',
            background: 'linear-gradient(135deg, #3B5BFF, #6941C6)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 13, fontWeight: 700, color: '#fff', flexShrink: 0
          }}>{initials}</div>
          <div style={{ flex: 1, overflow: 'hidden' }}>
            <p style={{ fontSize: 12, color: '#E6EDF3', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {user?.email}
            </p>
          </div>
          <button onClick={handleLogout} title="Sign out" style={{
            background: 'none', border: 'none', cursor: 'pointer', color: '#8B949E', padding: 4,
            flexShrink: 0, display: 'flex', alignItems: 'center'
          }}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/>
            </svg>
          </button>
        </div>
      </aside>

      {/* Main content */}
      <main style={{ marginLeft: 220, flex: 1, minHeight: '100vh', overflow: 'auto' }}>
        {children}
      </main>
    </div>
  )
}
