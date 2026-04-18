import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { store } from '../lib/store'
import { api } from '../lib/api'
import { useTheme } from '../hooks/useTheme'

function calcStreak(allDates) {
  const bothDays = new Set(
    allDates.filter((d) => d.myEntry && d.partnerEntry).map((d) => d.date)
  )
  const today = new Date().toISOString().split('T')[0]
  let streak = 0
  // If today isn't written yet, start counting from yesterday
  const startOffset = bothDays.has(today) ? 0 : 1
  for (let i = startOffset; i < 400; i++) {
    const d = new Date()
    d.setDate(d.getDate() - i)
    if (bothDays.has(d.toISOString().split('T')[0])) streak++
    else break
  }
  return streak
}

const MILESTONES = [
  { key: 'room7',    check: (s) => s.roomDays >= 7,   emoji: '🌱', label: '1 week together' },
  { key: 'room30',   check: (s) => s.roomDays >= 30,  emoji: '🌸', label: '1 month together' },
  { key: 'room100',  check: (s) => s.roomDays >= 100, emoji: '💫', label: '100 days together' },
  { key: 'room365',  check: (s) => s.roomDays >= 365, emoji: '🎂', label: '1 year together' },
  { key: 'jnl1',    check: (s) => s.journalDays >= 1,  emoji: '✏️', label: 'First journal day' },
  { key: 'jnl7',    check: (s) => s.journalDays >= 7,  emoji: '📓', label: '7 journal days' },
  { key: 'jnl30',   check: (s) => s.journalDays >= 30, emoji: '📚', label: '30 journal days' },
  { key: 'streak3',  check: (s) => s.streak >= 3,  emoji: '🔥', label: '3-day streak' },
  { key: 'streak7',  check: (s) => s.streak >= 7,  emoji: '🔥🔥', label: '7-day streak' },
  { key: 'streak14', check: (s) => s.streak >= 14, emoji: '⚡', label: '14-day streak' },
]

function StatsCard({ code, roomData, t }) {
  const [stats, setStats] = useState(null)

  useEffect(() => {
    api.get(`/rooms/${code}/journal/all`).then((data) => {
      const all = Array.isArray(data) ? data : []
      const streak = calcStreak(all)
      const journalDays = all.filter((d) => d.myEntry && d.partnerEntry).length
      const roomDays = roomData?.createdAt
        ? Math.floor((Date.now() - new Date(roomData.createdAt)) / 86400000)
        : 0
      setStats({ streak, journalDays, roomDays })
    }).catch(() => {})
  }, [code, roomData])

  if (!stats) return null

  const unlocked = MILESTONES.filter((m) => m.check(stats))
  const locked   = MILESTONES.filter((m) => !m.check(stats))

  return (
    <div className="bg-white rounded-2xl p-4 shadow-sm border border-slate-100 space-y-4">
      {/* Numbers row */}
      <div className="grid grid-cols-3 gap-3 text-center">
        {[
          { val: stats.streak, label: 'day streak', emoji: '🔥' },
          { val: stats.journalDays, label: 'journal days', emoji: '📓' },
          { val: stats.roomDays, label: 'days together', emoji: '💑' },
        ].map(({ val, label, emoji }) => (
          <div key={label} className={`rounded-xl py-3 px-2 ${t.codeBg}`}>
            <div className="text-xl mb-0.5">{emoji}</div>
            <div className={`text-2xl font-bold ${t.accent}`}>{val}</div>
            <div className="text-xs text-slate-500 leading-tight mt-0.5">{label}</div>
          </div>
        ))}
      </div>

      {/* Milestones */}
      {(unlocked.length > 0 || locked.length > 0) && (
        <div>
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Milestones</p>
          <div className="flex flex-wrap gap-2">
            {unlocked.map((m) => (
              <span key={m.key} className={`flex items-center gap-1 text-xs px-2.5 py-1 rounded-full font-medium ${t.accentBg} ${t.accent}`}>
                {m.emoji} {m.label}
              </span>
            ))}
            {locked.slice(0, 3).map((m) => (
              <span key={m.key} className="flex items-center gap-1 text-xs px-2.5 py-1 rounded-full font-medium bg-slate-100 text-slate-400">
                🔒 {m.label}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function WelcomeBanner({ code, t }) {
  const [visible, setVisible] = useState(() => !store.get('seenWelcome'))
  const [copied, setCopied] = useState(false)
  const uid = store.get('userId') || ''
  const personalLink = `${location.origin}/?roomCode=${code}&userId=${uid}`

  function dismiss() {
    store.set('seenWelcome', '1')
    setVisible(false)
  }

  function copy() {
    navigator.clipboard.writeText(personalLink).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  if (!visible) return null

  return (
    <div className={`rounded-2xl p-4 border-2 ${t.codeBg} relative`}>
      <button onClick={dismiss} className="absolute top-3 right-3 text-slate-400 hover:text-slate-600 text-lg leading-none">×</button>
      <div className="pr-6">
        <p className={`font-bold ${t.accent} mb-1`}>👋 Welcome! One important thing first.</p>
        <p className="text-sm text-slate-600 mb-3 leading-relaxed">
          Your session is stored in this browser only. Save your <strong>personal link</strong> now so you can
          get back in from any device — phone, laptop, or a new browser.
        </p>
        <button onClick={copy} className={`w-full ${t.btn} rounded-xl py-2.5 text-sm font-semibold mb-2`}>
          {copied ? '✓ Copied! Now save it somewhere safe.' : '🔗 Copy my personal link'}
        </button>
        <div className="flex items-center justify-between">
          <Link to="/guide" className={`text-xs ${t.accent} underline underline-offset-2`}>Learn how everything works →</Link>
          <button onClick={dismiss} className="text-xs text-slate-400 hover:text-slate-500">Dismiss</button>
        </div>
      </div>
    </div>
  )
}

function Countdown({ target, t }) {
  const [diff, setDiff] = useState(null)

  useEffect(() => {
    if (!target) return
    const tick = () => {
      const ms = new Date(target) - Date.now()
      if (ms <= 0) { setDiff(null); return }
      setDiff({
        d: Math.floor(ms / 86400000),
        h: Math.floor((ms % 86400000) / 3600000),
        m: Math.floor((ms % 3600000) / 60000),
      })
    }
    tick()
    const timer = setInterval(tick, 60000)
    return () => clearInterval(timer)
  }, [target])

  if (!diff) return null
  return (
    <div className="flex gap-6 justify-center mt-2">
      {[['days', diff.d], ['hours', diff.h], ['mins', diff.m]].map(([label, val]) => (
        <div key={label} className="text-center">
          <div className={`text-3xl font-bold ${t.accent}`}>{val}</div>
          <div className="text-xs text-slate-400 mt-0.5">{label}</div>
        </div>
      ))}
    </div>
  )
}

function RoomCode({ code, t }) {
  const [copied, setCopied] = useState(false)
  const [copiedLink, setCopiedLink] = useState(false)
  const uid = store.get('userId') || ''

  function copy() {
    navigator.clipboard.writeText(code).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  function copyPersonalLink() {
    const url = `${location.origin}/?roomCode=${code}&userId=${uid}`
    navigator.clipboard.writeText(url).then(() => {
      setCopiedLink(true)
      setTimeout(() => setCopiedLink(false), 2000)
    })
  }

  return (
    <div className="space-y-2">
      <button
        onClick={copy}
        className={`w-full flex items-center justify-between ${t.codeBg} border-2 border-dashed rounded-2xl px-5 py-4 transition-all group`}
        title="Tap to copy room code"
      >
        <div className="text-left">
          <div className={`text-xs font-medium mb-1 ${t.indicator}`}>Room Code · tap to copy</div>
          <div className={`font-mono text-3xl font-bold tracking-[0.3em] ${t.codeText}`}>{code}</div>
        </div>
        <div className={`text-sm font-medium transition-all ${copied ? 'text-emerald-500' : `${t.indicator} group-hover:${t.accent}`}`}>
          {copied ? '✓ Copied!' : '📋'}
        </div>
      </button>
      <button
        onClick={copyPersonalLink}
        className="w-full flex items-center justify-center gap-2 text-xs text-slate-400 hover:text-slate-600 py-1.5 transition-colors"
        title="Copy your personal link to re-join from any device"
      >
        <span>🔗</span>
        <span>{copiedLink ? '✓ Personal link copied!' : 'Copy my personal link (for switching devices)'}</span>
      </button>
    </div>
  )
}

function SettingsPanel({ code, roomData, onSaved, onClose, t }) {
  const { themeKey, setTheme, themes } = useTheme()
  const [name, setName] = useState(roomData?.name || '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function save() {
    setSaving(true)
    setError('')
    try {
      const updated = await api.patch(`/rooms/${code}`, { name, theme: themeKey })
      store.set('roomData', updated)
      onSaved(updated)
      onClose()
    } catch (err) {
      setError(err.message || 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-5 space-y-5">
        <div className="flex items-center justify-between">
          <h3 className="font-bold text-slate-800 text-lg">Room Settings</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-xl leading-none">×</button>
        </div>

        {/* Rename */}
        <div>
          <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide block mb-1.5">Room Name</label>
          <input
            className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-slate-400 text-slate-800"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Our Room"
          />
        </div>

        {/* Theme picker */}
        <div>
          <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide block mb-2">Theme</label>
          <div className="grid grid-cols-5 gap-2">
            {Object.entries(themes).map(([key, theme]) => (
              <button
                key={key}
                onClick={() => setTheme(key)}
                title={theme.name}
                className={`flex flex-col items-center gap-1 p-2 rounded-xl border-2 transition-all ${
                  themeKey === key ? 'border-slate-700 shadow-md scale-105' : 'border-transparent hover:border-slate-200'
                }`}
              >
                <span className="text-xl">{theme.emoji}</span>
                <span className="text-xs text-slate-500">{theme.name}</span>
              </button>
            ))}
          </div>
        </div>

        {error && <p className="text-xs text-red-500 text-center">{error}</p>}

        <button
          onClick={save}
          disabled={saving}
          className={`w-full ${t.btn} rounded-xl py-2.5 text-sm font-semibold disabled:opacity-50`}
        >
          {saving ? 'Saving...' : 'Save Changes'}
        </button>
      </div>
    </div>
  )
}

function ExpiryWarning({ roomData, t }) {
  if (!roomData?.lastActiveAt) return null
  const daysInactive = Math.floor((Date.now() - new Date(roomData.lastActiveAt)) / 86400000)
  if (daysInactive < 23) return null
  const daysLeft = 30 - daysInactive
  if (daysLeft <= 0) return null
  return (
    <div className="rounded-2xl bg-amber-50 border border-amber-200 px-4 py-3 flex items-start gap-3">
      <span className="text-lg shrink-0">⚠️</span>
      <div>
        <p className="text-sm font-semibold text-amber-800">Room expires in {daysLeft} day{daysLeft !== 1 ? 's' : ''}</p>
        <p className="text-xs text-amber-700 mt-0.5">Rooms with no activity for 30 days are automatically deleted. Open the app together to keep it alive.</p>
      </div>
    </div>
  )
}

export default function Dashboard({ ws, online = [] }) {
  const nav = useNavigate()
  const { t } = useTheme()
  const code = store.get('roomCode')

  const [roomData, setRoomData] = useState(store.get('roomData'))
  const [meetup, setMeetup] = useState('')
  const [showSettings, setShowSettings] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)

  useEffect(() => {
    api.get(`/rooms/${code}`).then((data) => {
      setRoomData(data)
      store.set('roomData', data)
    }).catch(() => {})
  }, [code])

  async function saveMeetup() {
    if (!meetup) return
    await api.put(`/rooms/${code}/meetup`, { date: meetup })
    const updated = await api.get(`/rooms/${code}`)
    setRoomData(updated)
    store.set('roomData', updated)
  }

  async function deleteRoom() {
    setDeleting(true)
    try {
      await api.del(`/rooms/${code}`)
      store.clear()
      nav('/')
    } catch {
      setDeleting(false)
      setConfirmDelete(false)
    }
  }

  const features = [
    { to: '/journal', emoji: '📓', label: 'Journal', desc: 'Write together daily' },
    { to: '/watch', emoji: '🎬', label: 'Watch Party', desc: 'YouTube sync + chat' },
    { to: '/bucket', emoji: '🗺️', label: 'Bucket List', desc: 'Plan your next meetup' },
    { to: '/trivia', emoji: '🎯', label: 'Trivia', desc: 'How well do you know each other?' },
    { to: '/puzzle', emoji: '🧩', label: 'Puzzle', desc: 'Solve together in real-time' },
  ]

  return (
    <div className="space-y-4">
      <WelcomeBanner code={code} t={t} />
      <ExpiryWarning roomData={roomData} t={t} />

      {/* Room card */}
      <div className="bg-white rounded-2xl p-4 shadow-sm border border-slate-100 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-bold text-slate-800">{roomData?.name || 'Our Room'}</h2>
            <div className="flex gap-2 mt-1.5 flex-wrap">
              {roomData?.members?.map((m) => {
                const isOnline = online.some((u) => u.userId === m.userId)
                return (
                  <span key={m.userId} className={`text-xs px-2.5 py-1 rounded-full font-medium flex items-center gap-1 ${
                    isOnline ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'
                  }`}>
                    <span className="text-[9px]">{isOnline ? '●' : '○'}</span> {m.name}
                  </span>
                )
              })}
            </div>
          </div>
          <button
            onClick={() => setShowSettings(true)}
            className="p-2 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-50 transition-all"
            title="Room settings"
          >
            ⚙️
          </button>
        </div>

        <RoomCode code={code} t={t} />

        <div>
          {!confirmDelete ? (
            <button onClick={() => setConfirmDelete(true)} className="text-xs text-slate-300 hover:text-red-400 transition-colors">
              Delete room
            </button>
          ) : (
            <div className="flex items-center gap-3 bg-red-50 rounded-xl px-3 py-2">
              <span className="text-xs text-red-700 flex-1 font-medium">Delete room and all data?</span>
              <button onClick={deleteRoom} disabled={deleting}
                className="text-xs font-semibold text-white bg-red-500 hover:bg-red-600 px-3 py-1.5 rounded-lg disabled:opacity-50">
                {deleting ? '...' : 'Delete'}
              </button>
              <button onClick={() => setConfirmDelete(false)} className="text-xs text-slate-500 hover:text-slate-700">Cancel</button>
            </div>
          )}
        </div>
      </div>

      {/* Meetup countdown */}
      <div className="bg-white rounded-2xl p-4 shadow-sm border border-slate-100">
        <h3 className="font-semibold text-slate-700 mb-3">💗 Next Meetup</h3>
        {roomData?.nextMeetup
          ? <Countdown target={roomData.nextMeetup} t={t} />
          : <p className="text-sm text-slate-400 text-center">No date set yet</p>
        }
        <div className="flex gap-2 mt-4">
          <input type="date" value={meetup} onChange={(e) => setMeetup(e.target.value)}
            className="flex-1 border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-slate-400 text-slate-700" />
          <button onClick={saveMeetup} className={`${t.btn} px-4 rounded-xl text-sm font-medium`}>Set</button>
        </div>
      </div>

      <StatsCard code={code} roomData={roomData} t={t} />

      {/* Feature grid */}
      <div className="grid grid-cols-2 gap-3">
        {features.map(({ to, emoji, label, desc }) => (
          <Link key={to} to={to}
            className={`bg-white rounded-2xl p-4 shadow-sm border ${t.card} hover:shadow-md transition-all`}>
            <div className="text-3xl mb-2">{emoji}</div>
            <div className="font-semibold text-slate-700 text-sm">{label}</div>
            <div className="text-xs text-slate-400 mt-1">{desc}</div>
          </Link>
        ))}
      </div>

      {showSettings && (
        <SettingsPanel
          code={code}
          roomData={roomData}
          onSaved={(updated) => {
            setRoomData(updated)
            if (updated.theme) ws?.send('room:theme', { theme: updated.theme })
          }}
          onClose={() => setShowSettings(false)}
          t={t}
        />
      )}
    </div>
  )
}
