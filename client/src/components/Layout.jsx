import { useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { store } from '../lib/store'
import { useTheme } from '../hooks/useTheme'
import { api } from '../lib/api'

const nav = [
  { to: '/dashboard', label: '🏠 Home' },
  { to: '/journal', label: '📓 Journal' },
  { to: '/watch', label: '🎬 Watch' },
  { to: '/bucket', label: '🗺️ Bucket List' },
  { to: '/trivia', label: '🎯 Trivia' },
  { to: '/puzzle', label: '🧩 Puzzle' },
]

function UserSettings({ onClose, t }) {
  const code = store.get('roomCode')
  const [name, setName] = useState(store.get('userName') || '')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')

  async function save(e) {
    e.preventDefault()
    if (!name.trim()) return
    setSaving(true)
    setError('')
    try {
      await api.patch(`/rooms/${code}/me`, { name: name.trim() })
      store.set('userName', name.trim())
      setSaved(true)
      setTimeout(() => { setSaved(false); onClose() }, 800)
    } catch (err) {
      setError(err.message || 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-xs p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-bold text-slate-800">My Profile</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-xl leading-none">×</button>
        </div>

        <form onSubmit={save} className="space-y-3">
          <div>
            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide block mb-1.5">
              Display Name
            </label>
            <input
              className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-slate-400 text-slate-800"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Your name"
              autoFocus
            />
          </div>
          {error && <p className="text-xs text-red-500">{error}</p>}
          <button
            type="submit"
            disabled={saving || !name.trim()}
            className={`w-full ${t.btn} rounded-xl py-2.5 text-sm font-semibold disabled:opacity-50`}
          >
            {saved ? '✓ Saved!' : saving ? 'Saving…' : 'Save Name'}
          </button>
        </form>
      </div>
    </div>
  )
}

export default function Layout({ children, ws, online = [] }) {
  const { pathname } = useLocation()
  const { t } = useTheme()
  const navigate = useNavigate()
  const name = store.get('userName')
  const uid = store.get('userId')
  const [showUserSettings, setShowUserSettings] = useState(false)

  const isOnline = online.some((u) => u.userId === uid)
  const otherOnline = online.filter((u) => u.userId !== uid)

  return (
    <div className={`min-h-screen ${t.appBg} flex flex-col`}>
      <header className={`bg-white border-b ${t.headerBg} px-4 py-3 flex items-center justify-between sticky top-0 z-10 shadow-sm`}>
        <span className={`font-bold ${t.accent} text-lg`}>💑 LDR</span>

        <div className="flex items-center gap-2">
          {/* Partner online indicator */}
          {otherOnline.length > 0 && (
            <span className="flex items-center gap-1.5 text-xs text-emerald-600 bg-emerald-50 px-2.5 py-1 rounded-full font-medium">
              <span className="text-[9px]">●</span>
              {otherOnline.map(u => u.name).join(', ')} online
            </span>
          )}

          {/* Guide */}
          <button
            onClick={() => navigate('/guide')}
            className="w-7 h-7 flex items-center justify-center rounded-full text-slate-400 hover:text-slate-600 hover:bg-slate-50 text-sm font-bold transition-colors"
            title="How to use"
          >?</button>

          {/* Your name + settings */}
          <button
            onClick={() => setShowUserSettings(true)}
            className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-700 transition-colors"
            title="Profile settings"
          >
            <span className={`text-[9px] ${ws?.connected ? 'text-emerald-500' : 'text-slate-300'}`}>●</span>
            <span>{name}</span>
            <span className="text-slate-300">✎</span>
          </button>
        </div>
      </header>

      <nav className="bg-white border-b border-slate-100 flex overflow-x-auto shadow-sm">
        {nav.map(({ to, label }) => (
          <Link
            key={to}
            to={to}
            className={`px-4 py-2.5 text-sm whitespace-nowrap font-medium border-b-2 transition-colors ${
              pathname === to || (to !== '/dashboard' && pathname.startsWith(to))
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

      {showUserSettings && (
        <UserSettings onClose={() => setShowUserSettings(false)} t={t} />
      )}
    </div>
  )
}
