import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { store } from '../lib/store'
import { api } from '../lib/api'
import { useTheme } from '../hooks/useTheme'

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
  function copy() {
    navigator.clipboard.writeText(code).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }
  return (
    <button
      onClick={copy}
      className={`w-full flex items-center justify-between ${t.codeBg} border-2 border-dashed rounded-2xl px-5 py-4 transition-all group`}
      title="Click to copy"
    >
      <div className="text-left">
        <div className={`text-xs font-medium mb-1 ${t.indicator}`}>Room Code · tap to copy</div>
        <div className={`font-mono text-3xl font-bold tracking-[0.3em] ${t.codeText}`}>{code}</div>
      </div>
      <div className={`text-sm font-medium transition-all ${copied ? 'text-emerald-500' : `${t.indicator} group-hover:${t.accent}`}`}>
        {copied ? '✓ Copied!' : '📋'}
      </div>
    </button>
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
          onSaved={setRoomData}
          onClose={() => setShowSettings(false)}
          t={t}
        />
      )}
    </div>
  )
}
