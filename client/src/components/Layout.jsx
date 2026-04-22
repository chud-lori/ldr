import { useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { store } from '../lib/store'
import { useTheme } from '../hooks/useTheme'
import { api } from '../lib/api'
import {
  Home, BookOpen, Tv, ListChecks, HelpCircle, PuzzleIcon, Pencil,
  History, X, PenLine, Music2,
} from '../lib/icons'

const nav = [
  { to: '/dashboard', label: 'Home',        Icon: Home },
  { to: '/journal',   label: 'Journal',     Icon: BookOpen },
  { to: '/watch',     label: 'Watch',       Icon: Tv },
  { to: '/bucket',    label: 'Bucket List', Icon: ListChecks },
  { to: '/trivia',    label: 'Trivia',      Icon: HelpCircle },
  { to: '/puzzle',    label: 'Puzzle',      Icon: PuzzleIcon },
  { to: '/draw',      label: 'Draw',        Icon: Pencil },
  { to: '/music',     label: 'Music',       Icon: Music2 },
  { to: '/timeline',  label: 'Timeline',    Icon: History },
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
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center p-3 sm:p-4 overflow-y-auto">
      <div className="bg-white rounded-t-2xl sm:rounded-2xl shadow-xl w-full max-w-xs p-5 space-y-4 max-h-[92vh] overflow-y-auto">
        <div className="flex items-center justify-between">
          <h3 className="font-bold text-slate-800">My Profile</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 p-1 -m-1 rounded" aria-label="Close">
            <X className="h-5 w-5" strokeWidth={2} />
          </button>
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
        <span className={`font-bold ${t.accent} text-lg tracking-wide`}>LDR</span>

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
            className="w-7 h-7 flex items-center justify-center rounded-full text-slate-400 hover:text-slate-600 hover:bg-slate-50 transition-colors"
            title="How to use"
            aria-label="Guide"
          >
            <HelpCircle className="h-4 w-4" strokeWidth={2} />
          </button>

          {/* Your name + settings */}
          <button
            onClick={() => setShowUserSettings(true)}
            className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-700 transition-colors"
            title="Profile settings"
          >
            <span className={`h-2 w-2 rounded-full ${ws?.connected ? 'bg-emerald-500' : 'bg-slate-300'}`} aria-hidden="true" />
            <span>{name}</span>
            <PenLine className="h-3.5 w-3.5 text-slate-300" strokeWidth={2} aria-hidden="true" />
          </button>
        </div>
      </header>

      <nav className="bg-white border-b border-slate-100 flex overflow-x-auto shadow-sm">
        {nav.map(({ to, label, Icon }) => {
          const active = pathname === to || (to !== '/dashboard' && pathname.startsWith(to))
          return (
            <Link
              key={to}
              to={to}
              className={`px-4 py-2.5 text-sm whitespace-nowrap font-medium border-b-2 transition-colors inline-flex items-center gap-1.5 ${
                active ? `border-b-2 ${t.navActive}` : `border-transparent text-slate-500 ${t.navHover}`
              }`}
            >
              <Icon className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
              <span>{label}</span>
            </Link>
          )
        })}
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
