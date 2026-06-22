import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../store/auth'

const NAV = [
  { path: '/dashboard', label: 'Dashboard' },
  { path: '/applications', label: 'Applications' },
  { path: '/profile', label: 'Profile' },
  { path: '/settings', label: 'Settings' },
]

export default function Layout({ children }: { children: React.ReactNode }) {
  const location = useLocation()
  const logout = useAuth(s => s.logout)
  const user = useAuth(s => s.user)
  const navigate = useNavigate()

  function handleLogout() { logout(); navigate('/login') }

  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-white border-b border-gray-100 px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 bg-brand rounded-lg flex items-center justify-center text-white text-xs">JP</div>
          <span className="font-medium text-gray-900">JobPilot</span>
        </div>
        <div className="flex items-center gap-1">
          {NAV.map(n => (
            <Link key={n.path} to={n.path}
              className={`px-3 py-1.5 rounded-lg text-sm transition-colors
                ${location.pathname === n.path ? 'bg-blue-50 text-blue-700 font-medium' : 'text-gray-500 hover:text-gray-800 hover:bg-gray-100'}`}>
              {n.label}
            </Link>
          ))}
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm text-gray-500">{user?.email}</span>
          <button onClick={handleLogout} className="text-sm text-gray-500 hover:text-gray-800">Sign out</button>
        </div>
      </nav>
      <main className="max-w-6xl mx-auto px-6 py-8">{children}</main>
    </div>
  )
}
