import { Link, useLocation } from 'react-router-dom'
import { store } from '../lib/store'
import { useTheme } from '../hooks/useTheme'

const nav = [
  { to: '/dashboard', label: '🏠 Home' },
  { to: '/journal', label: '📓 Journal' },
  { to: '/watch', label: '🎬 Watch' },
  { to: '/bucket', label: '🗺️ Bucket List' },
  { to: '/trivia', label: '🎯 Trivia' },
  { to: '/puzzle', label: '🧩 Puzzle' },
]

export default function Layout({ children, ws }) {
  const { pathname } = useLocation()
  const { t } = useTheme()
  const name = store.get('userName')

  return (
    <div className={`min-h-screen ${t.appBg} flex flex-col`}>
      <header className={`bg-white border-b ${t.headerBg} px-4 py-3 flex items-center justify-between sticky top-0 z-10 shadow-sm`}>
        <span className={`font-bold ${t.accent} text-lg`}>💑 LDR</span>
        <span className="text-xs text-slate-400 flex items-center gap-1.5">
          {name}
          <span className={ws?.connected ? 'text-emerald-500' : 'text-slate-300'}>●</span>
        </span>
      </header>

      <nav className="bg-white border-b border-slate-100 flex overflow-x-auto shadow-sm">
        {nav.map(({ to, label }) => (
          <Link
            key={to}
            to={to}
            className={`px-4 py-2.5 text-sm whitespace-nowrap font-medium border-b-2 transition-colors ${
              pathname.startsWith(to) && to !== '/dashboard'
                ? `border-b-2 ${t.navActive}`
                : pathname === to && to === '/dashboard'
                ? `border-b-2 ${t.navActive}`
                : `border-transparent text-slate-500 ${t.navHover}`
            }`}
          >
            {label}
          </Link>
        ))}
      </nav>

      <main className="flex-1 max-w-2xl w-full mx-auto p-4">
        {children}
      </main>
    </div>
  )
}
