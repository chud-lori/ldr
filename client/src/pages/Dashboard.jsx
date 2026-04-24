import { useEffect, useState, useCallback } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { store } from '../lib/store'
import { api } from '../lib/api'
import { useTheme } from '../hooks/useTheme'
import {
  Settings, X, Plus, Heart, Clock, Link2, CalendarHeart,
  Flame, BookOpen, BookMarked, Tv, ListChecks, HelpCircle, PuzzleIcon,
  Pencil, History, AlertTriangle, Sprout, Sparkles, Zap, Check, Copy,
  Cake, Plane, Pin, Lock, Music2, Smile, HandHeart, Mail, Send, Camera,
  ChevronRight, Paperclip,
} from '../lib/icons'
import { useToast } from '../components/Toast'
import { maybeRequestPermission } from '../lib/notify'
import { compressPhoto } from '../lib/media'

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
  { key: 'room7',    check: (s) => s.roomDays >= 7,   Icon: Sprout,   label: '1 week together' },
  { key: 'room30',   check: (s) => s.roomDays >= 30,  Icon: Heart,    label: '1 month together' },
  { key: 'room100',  check: (s) => s.roomDays >= 100, Icon: Sparkles, label: '100 days together' },
  { key: 'room365',  check: (s) => s.roomDays >= 365, Icon: Cake,     label: '1 year together' },
  { key: 'jnl1',     check: (s) => s.journalDays >= 1,  Icon: Pencil,     label: 'First journal day' },
  { key: 'jnl7',     check: (s) => s.journalDays >= 7,  Icon: BookOpen,   label: '7 journal days' },
  { key: 'jnl30',    check: (s) => s.journalDays >= 30, Icon: BookMarked, label: '30 journal days' },
  { key: 'streak3',  check: (s) => s.streak >= 3,  Icon: Flame, label: '3-day streak' },
  { key: 'streak7',  check: (s) => s.streak >= 7,  Icon: Flame, label: '7-day streak' },
  { key: 'streak14', check: (s) => s.streak >= 14, Icon: Zap,   label: '14-day streak' },
]

function StatsCard({ code, roomData, ws, t }) {
  const [stats, setStats] = useState(null)

  const refresh = useCallback(() => {
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

  useEffect(() => { refresh() }, [refresh])

  // Partner wrote an entry → streak / journal-days may have ticked
  useEffect(() => {
    if (!ws) return
    return ws.on('journal:saved', () => refresh())
  }, [ws, refresh])

  if (!stats) return null

  const unlocked = MILESTONES.filter((m) => m.check(stats))
  const locked   = MILESTONES.filter((m) => !m.check(stats))

  return (
    <div className="bg-white rounded-2xl p-4 shadow-sm border border-slate-100 space-y-4">
      {/* Numbers row */}
      <div className="grid grid-cols-3 gap-3 text-center">
        {[
          { val: stats.streak,      label: 'day streak',    Icon: Flame },
          { val: stats.journalDays, label: 'journal days',  Icon: BookOpen },
          { val: stats.roomDays,    label: 'days together', Icon: Heart },
        ].map(({ val, label, Icon }) => (
          <div key={label} className={`rounded-xl py-3 px-2 ${t.codeBg}`}>
            <Icon className={`h-5 w-5 mx-auto mb-1 ${t.accent}`} strokeWidth={2} aria-hidden="true" />
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
            {unlocked.map(({ key, Icon, label }) => (
              <span key={key} className={`flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full font-medium ${t.accentBg} ${t.accent}`}>
                <Icon className="h-3.5 w-3.5" strokeWidth={2} aria-hidden="true" />
                {label}
              </span>
            ))}
            {locked.slice(0, 3).map(({ key, label }) => (
              <span key={key} className="flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full font-medium bg-slate-100 text-slate-400">
                <Lock className="h-3 w-3" strokeWidth={2} aria-hidden="true" />
                {label}
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
    <div className={`flex items-center gap-2 px-3 py-2 rounded-xl border ${t.codeBg} text-xs`}>
      <Link2 className={`h-4 w-4 shrink-0 ${t.accent}`} strokeWidth={2} aria-hidden="true" />
      <span className="text-slate-600 flex-1 leading-snug">Save your <strong>personal link</strong> to rejoin from any device.</span>
      <button onClick={copy} className={`shrink-0 font-semibold px-2.5 py-1 rounded-lg ${t.accentBg} ${t.accent} whitespace-nowrap inline-flex items-center gap-1`}>
        {copied ? <><Check className="h-3.5 w-3.5" strokeWidth={2.5} /> Copied</> : 'Copy link'}
      </button>
      <button onClick={dismiss} className="shrink-0 text-slate-300 hover:text-slate-500 p-1 -m-1" aria-label="Dismiss">
        <X className="h-4 w-4" strokeWidth={2} />
      </button>
    </div>
  )
}

function formatTZ(tz) {
  if (!tz) return ''
  const parts = tz.split('/')
  return parts[parts.length - 1].replace(/_/g, ' ')
}

function localTime(tz) {
  try {
    return new Date().toLocaleTimeString([], {
      timeZone: tz,
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    })
  } catch {
    return '—:—'
  }
}

function TimezoneStrip({ ws, roomData, online, t }) {
  const [, setTick] = useState(0)
  const [sent, setSent] = useState(false)
  const [cooling, setCooling] = useState(false)
  const uid = store.get('userId')

  useEffect(() => {
    const timer = setInterval(() => setTick((n) => n + 1), 60000)
    return () => clearInterval(timer)
  }, [])

  const members = roomData?.members || []
  if (members.length === 0) return null

  const resolveTz = (m) => {
    if (m.userId === uid) return Intl.DateTimeFormat().resolvedOptions().timeZone
    const live = online.find((u) => u.userId === m.userId)?.timezone
    return live || m.timezone || ''
  }

  const resolveLocation = (m, tz) => m.location?.trim() || (tz ? formatTZ(tz) : '')

  const partner = members.find((m) => m.userId !== uid)
  const partnerOnline = partner && online.some((u) => u.userId === partner.userId)

  function sendNudge() {
    if (cooling || !ws?.connected || !partnerOnline) return
    ws.send('nudge:send', { emoji: '💗' })
    setSent(true)
    setCooling(true)
    setTimeout(() => setSent(false), 2000)
    setTimeout(() => setCooling(false), 5000)
    // Ask for notification permission the first time we *send*. Timing this
    // after a user-initiated action feels less spammy than asking on mount.
    maybeRequestPermission()
  }

  return (
    <div className="bg-white rounded-2xl p-4 shadow-sm border border-slate-100 space-y-3">
      <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide flex items-center gap-1.5">
        <Clock className="h-3.5 w-3.5" strokeWidth={2} aria-hidden="true" />
        Timezones
      </p>
      <div className="grid grid-cols-2 gap-3" data-testid="timezone-grid">
        {members.map((m) => {
          const tz = resolveTz(m)
          return (
            <div key={m.userId} data-testid={`tz-entry-${m.userId}`} className={`rounded-xl py-2.5 px-3 ${t.codeBg}`}>
              <div className="text-xs text-slate-500 truncate">{m.name}</div>
              <div className={`text-xl font-bold ${t.accent} font-mono leading-tight`}>
                {tz ? localTime(tz) : '—:—'}
              </div>
              <div className="text-[10px] text-slate-400 truncate mt-0.5">
                {tz ? resolveLocation(m, tz) : 'not yet online'}
              </div>
            </div>
          )
        })}
      </div>
      {partner && (
        <button
          onClick={sendNudge}
          disabled={cooling || !ws?.connected || !partnerOnline}
          className={`w-full rounded-xl py-2.5 text-sm font-semibold transition-all ${
            sent
              ? 'bg-emerald-50 text-emerald-600'
              : `${t.btn} disabled:opacity-50 disabled:cursor-not-allowed`
          }`}
          title={partnerOnline
            ? `Send ${partner.name} a thought`
            : `${partner.name} is offline right now`}
        >
          <span className="inline-flex items-center justify-center gap-2">
            {sent ? (
              <><Check className="h-4 w-4" strokeWidth={2.5} /> Sent</>
            ) : partnerOnline ? (
              <><Heart className="h-4 w-4" strokeWidth={2} /> Thinking of {partner.name}</>
            ) : (
              `${partner.name} is offline`
            )}
          </span>
        </button>
      )}
    </div>
  )
}

const MOODS = ['😊', '😔', '😍', '😴', '🥰', '😤', '😢', '🤩', '😌', '🥺']

function shortAgo(iso) {
  if (!iso) return ''
  const ms = Date.now() - new Date(iso).getTime()
  const m = Math.floor(ms / 60000)
  if (m < 1) return 'just now'
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}

// Renders only when the server has something to show — derived from
// counts of new content created since this user's lastSeenAt (which
// represents the end of their previous session, since we no longer touch
// it on ping).
function ActivityCard({ roomData, t }) {
  const code = store.get('roomCode')
  const uid = store.get('userId')
  const nav = useNavigate()
  const partner = (roomData?.members || []).find((m) => m.userId !== uid)
  const partnerName = partner?.name || 'Partner'

  const [items, setItems] = useState([])

  useEffect(() => {
    api.get(`/rooms/${code}/activity`)
      .then((d) => setItems(Array.isArray(d) ? d : []))
      .catch(() => {})
  }, [code])

  if (items.length === 0) return null

  const META = {
    'journal-new':     { Icon: BookOpen,    to: '/journal', label: (n) => `${partnerName} wrote ${n} journal ${n > 1 ? 'entries' : 'entry'}` },
    'journal-reacted': { Icon: Heart,       to: '/journal', label: (n) => `${partnerName} reacted on ${n} of your entries` },
    'bucket-new':      { Icon: ListChecks,  to: '/bucket',  label: (n) => `${partnerName} added ${n} bucket-list item${n > 1 ? 's' : ''}` },
    'trivia-new':      { Icon: HelpCircle,  to: '/trivia',  label: (n) => `${partnerName} asked ${n} new trivia question${n > 1 ? 's' : ''}` },
    'trivia-answered': { Icon: HelpCircle,  to: '/trivia',  label: (n) => `${partnerName} answered ${n} of your trivia question${n > 1 ? 's' : ''}` },
    'song-received':   { Icon: Music2,      to: '/music',   label: (n) => `${partnerName} sent you ${n} song${n > 1 ? 's' : ''}` },
    'song-feedback':   { Icon: Music2,      to: '/music',   label: (n) => `${partnerName} reacted to ${n} of your song${n > 1 ? 's' : ''}` },
  }

  return (
    <div className="bg-white rounded-2xl p-4 shadow-sm border border-slate-100 space-y-3">
      <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
        Since you were away
      </p>
      <div className="space-y-1.5">
        {items.map((it) => {
          const meta = META[it.kind]
          if (!meta) return null
          const Icon = meta.Icon
          return (
            <button
              key={it.kind}
              onClick={() => nav(meta.to)}
              data-testid={`activity-${it.kind}`}
              className={`w-full flex items-center gap-3 rounded-xl px-3 py-2 ${t.codeBg} hover:brightness-95 text-left transition-all`}
            >
              <Icon className={`h-4 w-4 ${t.accent} shrink-0`} strokeWidth={2} aria-hidden="true" />
              <span className="flex-1 text-sm text-slate-700 leading-tight">{meta.label(it.count)}</span>
              <ChevronRight className="h-4 w-4 text-slate-400 shrink-0" strokeWidth={2} aria-hidden="true" />
            </button>
          )
        })}
      </div>
    </div>
  )
}

function NotesCard({ ws, roomData, t }) {
  const toast = useToast()
  const code = store.get('roomCode')
  const uid = store.get('userId')
  const name = store.get('userName')
  const partner = (roomData?.members || []).find((m) => m.userId !== uid)

  const [unread, setUnread] = useState([])
  const [composing, setComposing] = useState(false)
  const [text, setText] = useState('')
  const [image, setImage] = useState(null)         // compressed File ready to upload
  const [imagePreview, setImagePreview] = useState(null)
  const [sending, setSending] = useState(false)

  const refresh = useCallback(() => {
    api.get(`/rooms/${code}/messages`)
      .then((d) => setUnread(Array.isArray(d) ? d : []))
      .catch(() => {})
  }, [code])

  useEffect(() => { refresh() }, [refresh])

  useEffect(() => {
    if (!ws) return
    return ws.on('message:new', (msg) => {
      if (msg.userId === uid) return
      refresh()
    })
  }, [ws, uid, refresh])

  // Free preview blob URL when component unmounts or preview changes.
  useEffect(() => {
    return () => { if (imagePreview) URL.revokeObjectURL(imagePreview) }
  }, [imagePreview])

  async function markRead(id) {
    setUnread((prev) => prev.filter((m) => m.id !== id))
    try {
      await api.post(`/rooms/${code}/messages/${id}/read`, {})
    } catch {
      refresh()
    }
  }

  async function pickImage(e) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file || !file.type.startsWith('image/')) return
    try {
      const compressed = await compressPhoto(file)
      setImage(compressed)
      if (imagePreview) URL.revokeObjectURL(imagePreview)
      setImagePreview(URL.createObjectURL(compressed))
    } catch {
      toast('Could not read that image', 'error')
    }
  }

  function clearImage() {
    if (imagePreview) URL.revokeObjectURL(imagePreview)
    setImage(null)
    setImagePreview(null)
  }

  function resetCompose() {
    setText('')
    clearImage()
    setComposing(false)
  }

  async function send() {
    const trimmed = text.trim()
    if ((!trimmed && !image) || sending) return
    setSending(true)
    try {
      const fd = new FormData()
      fd.append('name', name)
      fd.append('text', trimmed)
      if (image) fd.append('image', image)
      const res = await fetch(`/api/rooms/${code}/messages`, {
        method: 'POST',
        headers: { 'X-User-ID': uid },
        body: fd,
      })
      if (!res.ok) throw new Error(await res.text())
      resetCompose()
      toast(`Note sent to ${partner?.name || 'them'} 💗`, 'success')
    } catch (err) {
      toast(err?.message || 'Failed to send', 'error')
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="bg-white rounded-2xl p-4 shadow-sm border border-slate-100 space-y-3">
      <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide inline-flex items-center gap-1.5">
        <Mail className="h-3.5 w-3.5" strokeWidth={2} aria-hidden="true" />
        Notes
        {unread.length > 0 && (
          <span className="ml-1 text-[10px] font-bold bg-rose-500 text-white rounded-full px-1.5 py-0.5">
            {unread.length}
          </span>
        )}
      </p>

      {unread.length > 0 && (
        <div className="space-y-2">
          {unread.map((m) => (
            <div key={m.id} className={`rounded-xl p-3 ${t.codeBg} space-y-2`} data-testid={`note-${m.id}`}>
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-700">{m.senderName}</span>
                <span className="text-[10px] text-slate-400">{shortAgo(m.createdAt)}</span>
              </div>
              {m.imageFilename && (
                <img
                  src={`/api/rooms/${code}/messages/${m.id}/image`}
                  alt=""
                  className="rounded-xl max-h-72 w-full object-cover bg-slate-100"
                  loading="lazy"
                />
              )}
              {m.text && (
                <p className="text-sm text-slate-700 whitespace-pre-wrap leading-relaxed">{m.text}</p>
              )}
              <button
                onClick={() => markRead(m.id)}
                data-testid={`note-read-${m.id}`}
                className={`text-xs font-semibold ${t.accent} hover:underline`}
              >
                Mark read · note will fade
              </button>
            </div>
          ))}
        </div>
      )}

      {!composing && (
        <button
          onClick={() => setComposing(true)}
          data-testid="open-compose-note"
          className="w-full text-left text-sm text-slate-400 hover:text-slate-600 border border-dashed border-slate-200 rounded-xl px-3 py-2.5"
        >
          Leave {partner?.name || 'them'} a note…
        </button>
      )}

      {composing && (
        <div className="space-y-2">
          {imagePreview && (
            <div className="relative inline-block">
              <img
                src={imagePreview}
                alt=""
                className="rounded-xl max-h-40 object-cover border border-slate-200"
              />
              <button
                onClick={clearImage}
                aria-label="Remove image"
                className="absolute top-1 right-1 bg-black/60 hover:bg-black/80 text-white rounded-full w-6 h-6 flex items-center justify-center"
              >
                <X className="h-3.5 w-3.5" strokeWidth={2.5} />
              </button>
            </div>
          )}
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={image ? "Add a caption (optional)…" : "Whatever you want them to read when they come back…"}
            rows={3}
            maxLength={300}
            autoFocus
            data-testid="compose-note"
            className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-slate-400 resize-none text-slate-700"
          />
          <div className="flex items-center gap-1 flex-wrap">
            <label
              className="cursor-pointer text-slate-400 hover:text-slate-600 p-1.5 rounded-lg hover:bg-slate-50"
              title="Take a photo"
            >
              <Camera className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
              <input
                type="file"
                accept="image/*"
                capture="environment"
                onChange={pickImage}
                disabled={sending}
                className="hidden"
                data-testid="note-camera-input"
              />
            </label>
            <label
              className="cursor-pointer text-slate-400 hover:text-slate-600 p-1.5 rounded-lg hover:bg-slate-50"
              title="Choose a picture"
            >
              <Paperclip className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
              <input
                type="file"
                accept="image/*"
                onChange={pickImage}
                disabled={sending}
                className="hidden"
                data-testid="note-image-input"
              />
            </label>
            <span className="text-[10px] text-slate-400 tabular-nums ml-1">{300 - text.length}</span>
            <div className="flex-1" />
            <button
              onClick={resetCompose}
              className="text-xs text-slate-500 hover:text-slate-700 px-2 py-1.5"
            >
              Cancel
            </button>
            <button
              onClick={send}
              disabled={(!text.trim() && !image) || sending}
              data-testid="send-note"
              className={`${t.btn} px-3 py-1.5 rounded-xl text-xs font-semibold disabled:opacity-50 inline-flex items-center gap-1.5`}
            >
              <Send className="h-3.5 w-3.5" strokeWidth={2.5} />
              {sending ? 'Sending…' : 'Send'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function MoodCard({ ws, roomData, t }) {
  const uid = store.get('userId')
  const code = store.get('roomCode')
  const [moods, setMoods] = useState([])
  const [picking, setPicking] = useState(false)

  const refresh = useCallback(() => {
    api.get(`/rooms/${code}/moods`).then((data) => {
      setMoods(Array.isArray(data) ? data : [])
    }).catch(() => {})
  }, [code])

  useEffect(() => { refresh() }, [refresh])

  useEffect(() => {
    if (!ws) return
    return ws.on('mood:set', (msg) => {
      if (msg.userId === uid) return
      refresh()
    })
  }, [ws, uid, refresh])

  async function setMood(emoji) {
    // Optimistic update so the tap feels instant.
    const now = new Date().toISOString()
    setMoods((prev) => {
      const others = prev.filter((m) => m.userId !== uid)
      return [...others, { userId: uid, emoji, updatedAt: now }]
    })
    setPicking(false)
    try {
      await api.put(`/rooms/${code}/mood`, { emoji })
    } catch {
      refresh()
    }
  }

  const members = roomData?.members || []
  if (members.length === 0) return null

  return (
    <div className="bg-white rounded-2xl p-4 shadow-sm border border-slate-100 space-y-3">
      <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide inline-flex items-center gap-1.5">
        <Smile className="h-3.5 w-3.5" strokeWidth={2} aria-hidden="true" />
        Mood Check-in
      </p>
      <div className="grid grid-cols-2 gap-3">
        {members.map((m) => {
          const mood = moods.find((x) => x.userId === m.userId)
          const isMine = m.userId === uid
          return (
            <button
              key={m.userId}
              onClick={() => isMine && setPicking((p) => !p)}
              disabled={!isMine}
              data-testid={`mood-${isMine ? 'mine' : 'partner'}`}
              className={`rounded-xl py-3 px-3 text-left ${t.codeBg} ${isMine ? 'hover:brightness-95 cursor-pointer' : 'cursor-default'}`}
            >
              <div className="text-xs text-slate-500 truncate">{m.name}</div>
              <div className="text-3xl mt-0.5 leading-tight">{mood?.emoji || '—'}</div>
              <div className="text-[10px] text-slate-400 mt-0.5 truncate">
                {mood ? shortAgo(mood.updatedAt) : (isMine ? 'tap to set' : 'not set')}
              </div>
            </button>
          )
        })}
      </div>
      {picking && (
        <div className="flex gap-1.5 flex-wrap pt-1">
          {MOODS.map((e) => (
            <button
              key={e}
              onClick={() => setMood(e)}
              data-testid={`mood-pick-${e}`}
              className="text-2xl p-1.5 rounded-lg hover:bg-slate-50 transition-transform hover:scale-110"
            >
              {e}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function TouchCard({ ws, roomData, online, t }) {
  const uid = store.get('userId')
  const [selfPressed, setSelfPressed] = useState(false)
  const [partnerPressed, setPartnerPressed] = useState(false)
  const partner = (roomData?.members || []).find((m) => m.userId !== uid)
  const partnerOnline = partner && online.some((u) => u.userId === partner.userId)
  const connected = selfPressed && partnerPressed

  useEffect(() => {
    if (!ws) return
    const offs = [
      ws.on('touch:press', (msg) => {
        if (msg.userId === uid) return
        setPartnerPressed(true)
      }),
      ws.on('touch:release', (msg) => {
        if (msg.userId === uid) return
        setPartnerPressed(false)
      }),
    ]
    return () => offs.forEach((o) => o())
  }, [ws, uid])

  // Clear partner's press state if they go offline mid-hold.
  useEffect(() => {
    if (!partnerOnline) setPartnerPressed(false)
  }, [partnerOnline])

  function press() {
    if (!ws?.connected || selfPressed) return
    setSelfPressed(true)
    ws.send('touch:press', {})
    if ('vibrate' in navigator) navigator.vibrate?.(50)
  }

  function release() {
    if (!selfPressed) return
    setSelfPressed(false)
    ws?.send('touch:release', {})
  }

  const status = !partnerOnline
    ? `${partner?.name || 'Partner'} is offline`
    : connected
      ? "💗 you're both here"
      : partnerPressed
        ? `${partner?.name} is holding…`
        : selfPressed
          ? 'waiting for them…'
          : 'Tap and hold'

  return (
    <div className="bg-white rounded-2xl p-4 shadow-sm border border-slate-100 space-y-2">
      <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide inline-flex items-center gap-1.5">
        <HandHeart className="h-3.5 w-3.5" strokeWidth={2} aria-hidden="true" />
        Hold to feel them
      </p>
      <div className="flex flex-col items-center py-3 select-none" style={{ touchAction: 'none' }}>
        <button
          onPointerDown={press}
          onPointerUp={release}
          onPointerCancel={release}
          onPointerLeave={release}
          disabled={!partnerOnline || !ws?.connected}
          data-testid="touch-button"
          aria-label="Hold to feel them"
          className={`h-28 w-28 rounded-full transition-all duration-200 flex items-center justify-center disabled:opacity-40 disabled:cursor-not-allowed ${
            connected
              ? 'bg-rose-500 scale-110 shadow-2xl shadow-rose-300/60 animate-pulse'
              : selfPressed
                ? `${t.accentBg} scale-105 shadow-lg`
                : partnerPressed
                  ? `${t.codeBg} animate-pulse`
                  : 'bg-slate-100 hover:bg-slate-200'
          }`}
        >
          <Heart
            className={`h-10 w-10 ${
              connected ? 'text-white' : (selfPressed || partnerPressed) ? t.accent : 'text-slate-300'
            }`}
            strokeWidth={2}
            fill={connected ? 'currentColor' : 'none'}
            aria-hidden="true"
          />
        </button>
        <p className="text-xs text-slate-400 mt-3 min-h-[1em]">{status}</p>
      </div>
    </div>
  )
}

const KIND_META = {
  visit:       { Icon: Plane,         label: 'Visit' },
  anniversary: { Icon: CalendarHeart, label: 'Anniversary' },
  birthday:    { Icon: Cake,          label: 'Birthday' },
  custom:      { Icon: Pin,           label: 'Other' },
}

function shortDiff(target) {
  const ms = new Date(target) - Date.now()
  if (ms <= 0) return null
  const d = Math.floor(ms / 86400000)
  const h = Math.floor((ms % 86400000) / 3600000)
  if (d >= 1) return `${d}d ${h}h`
  const m = Math.floor((ms % 3600000) / 60000)
  return `${h}h ${m}m`
}

function MilestonesCard({ code, t }) {
  const [items, setItems] = useState([])
  const [loaded, setLoaded] = useState(false)
  const [adding, setAdding] = useState(false)
  const [title, setTitle] = useState('')
  const [date, setDate] = useState('')
  const [kind, setKind] = useState('visit')
  const [saving, setSaving] = useState(false)
  const [, setTick] = useState(0)

  async function load() {
    try {
      const data = await api.get(`/rooms/${code}/milestones`)
      setItems(Array.isArray(data) ? data : [])
    } catch {}
    setLoaded(true)
  }

  useEffect(() => { load() }, [code])

  // Re-render countdowns every minute
  useEffect(() => {
    const timer = setInterval(() => setTick((n) => n + 1), 60000)
    return () => clearInterval(timer)
  }, [])

  async function save(e) {
    e.preventDefault()
    if (!title.trim() || !date || saving) return
    setSaving(true)
    try {
      await api.post(`/rooms/${code}/milestones`, { title: title.trim(), date, kind })
      setTitle(''); setDate(''); setKind('visit'); setAdding(false)
      await load()
    } catch {}
    setSaving(false)
  }

  async function remove(id) {
    await api.del(`/rooms/${code}/milestones/${id}`)
    setItems((prev) => prev.filter((m) => m.id !== id))
  }

  const upcoming = items
    .filter((m) => new Date(m.date) > Date.now())
    .sort((a, b) => new Date(a.date) - new Date(b.date))

  if (!loaded) return null

  return (
    <div className="bg-white rounded-2xl p-4 shadow-sm border border-slate-100 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-slate-700 inline-flex items-center gap-2">
          <CalendarHeart className="h-4 w-4 text-slate-500" strokeWidth={2} aria-hidden="true" />
          Milestones
        </h3>
        {!adding && (
          <button onClick={() => setAdding(true)} className={`text-xs font-medium ${t.accent} inline-flex items-center gap-1`}>
            <Plus className="h-3.5 w-3.5" strokeWidth={2.5} />
            Add
          </button>
        )}
      </div>

      {upcoming.length === 0 && !adding && (
        <p className="text-sm text-slate-400 text-center py-2">No upcoming milestones</p>
      )}

      {upcoming.length > 0 && (
        <ul className="space-y-1.5">
          {upcoming.map((m) => {
            const meta = KIND_META[m.kind] || KIND_META.custom
            const KindIcon = meta.Icon
            const diff = shortDiff(m.date)
            return (
              <li key={m.id} className={`flex items-center gap-3 rounded-xl px-3 py-2 ${t.codeBg} group`}>
                <KindIcon className={`h-5 w-5 ${t.accent} shrink-0`} strokeWidth={2} aria-hidden="true" />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-slate-700 truncate">{m.title}</div>
                  <div className="text-[11px] text-slate-400">
                    {new Date(m.date).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })}
                  </div>
                </div>
                <div className={`text-sm font-semibold ${t.accent} tabular-nums`}>{diff}</div>
                <button
                  onClick={() => remove(m.id)}
                  aria-label="Remove milestone"
                  className="text-slate-300 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity p-1 -m-1"
                  title="Remove"
                >
                  <X className="h-4 w-4" strokeWidth={2} />
                </button>
              </li>
            )
          })}
        </ul>
      )}

      {adding && (
        <form onSubmit={save} className="space-y-2 pt-1">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="What are we counting down to?"
            className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-slate-400 text-slate-700"
            autoFocus
          />
          <div className="flex gap-2">
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="flex-1 border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-slate-400 text-slate-700"
            />
          </div>
          <div className="flex gap-1.5">
            {Object.entries(KIND_META).map(([key, meta]) => {
              const KindIcon = meta.Icon
              return (
              <button
                type="button"
                key={key}
                onClick={() => setKind(key)}
                className={`flex-1 flex items-center justify-center gap-1.5 rounded-xl py-1.5 text-xs font-medium border-2 transition-all ${
                  kind === key ? `border-slate-700 ${t.codeBg}` : 'border-transparent bg-slate-50 text-slate-500'
                }`}
                title={meta.label}
              >
                <KindIcon className="h-3.5 w-3.5" strokeWidth={2} aria-hidden="true" />
                <span className="hidden sm:inline">{meta.label}</span>
              </button>
              )
            })}
          </div>
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={saving || !title.trim() || !date}
              className={`flex-1 ${t.btn} rounded-xl py-2 text-sm font-semibold disabled:opacity-50`}
            >
              {saving ? 'Saving…' : 'Save'}
            </button>
            <button
              type="button"
              onClick={() => { setAdding(false); setTitle(''); setDate(''); setKind('visit') }}
              className="px-4 rounded-xl text-sm text-slate-500 hover:bg-slate-50"
            >
              Cancel
            </button>
          </div>
        </form>
      )}
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
        <div className={`transition-all ${copied ? 'text-emerald-500' : `${t.indicator} group-hover:${t.accent}`}`}>
          {copied
            ? <Check className="h-5 w-5" strokeWidth={2.5} />
            : <Copy className="h-5 w-5" strokeWidth={2} />}
        </div>
      </button>
      <button
        onClick={copyPersonalLink}
        className="w-full flex items-center justify-center gap-2 text-xs text-slate-400 hover:text-slate-600 py-1.5 transition-colors"
        title="Copy your personal link to re-join from any device"
      >
        <Link2 className="h-3.5 w-3.5" strokeWidth={2} aria-hidden="true" />
        <span>{copiedLink ? 'Personal link copied' : 'Copy my personal link (for switching devices)'}</span>
      </button>
    </div>
  )
}

function SettingsPanel({ code, roomData, onSaved, onClose, onLeave, t }) {
  const { themeKey, setTheme, themes } = useTheme()
  const [name, setName] = useState(roomData?.name || '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [confirmLeave, setConfirmLeave] = useState(false)

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
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center p-3 sm:p-4 overflow-y-auto">
      <div className="bg-white rounded-t-2xl sm:rounded-2xl shadow-xl w-full max-w-sm p-5 space-y-5 max-h-[92vh] overflow-y-auto">
        <div className="flex items-center justify-between">
          <h3 className="font-bold text-slate-800 text-lg">Room Settings</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 p-1 -m-1" aria-label="Close">
            <X className="h-5 w-5" strokeWidth={2} />
          </button>
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

        {/* Leave this device — clears local session, keeps room for the partner */}
        <div className="border-t border-slate-100 pt-4">
          {!confirmLeave ? (
            <button
              onClick={() => setConfirmLeave(true)}
              data-testid="leave-device"
              className="w-full text-xs text-slate-400 hover:text-slate-600 transition-colors"
            >
              Leave this device (keep room for partner)
            </button>
          ) : (
            <div className="space-y-2">
              <p className="text-xs text-slate-500 text-center leading-relaxed">
                You'll be signed out here, but the room stays for your partner.
                Get back in with your personal link or the room code.
              </p>
              <div className="flex gap-2">
                <button
                  onClick={onLeave}
                  data-testid="leave-device-confirm"
                  className="flex-1 text-xs font-semibold text-white bg-slate-700 hover:bg-slate-800 rounded-lg py-2"
                >
                  Sign out
                </button>
                <button
                  onClick={() => setConfirmLeave(false)}
                  className="text-xs text-slate-500 hover:text-slate-700 px-3"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
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
      <AlertTriangle className="h-5 w-5 shrink-0 text-amber-600" strokeWidth={2} aria-hidden="true" />
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
  const uid = store.get('userId')

  const [roomData, setRoomData] = useState(store.get('roomData'))
  const [meetup, setMeetup] = useState('')
  const [showSettings, setShowSettings] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)

  useEffect(() => {
    api.get(`/rooms/${code}`).then((data) => {
      setRoomData(data)
      store.set('roomData', data)
    }).catch(() => {
      store.clear()
      nav('/')
    })
  }, [code])

  useEffect(() => {
    if (!ws) return
    const refetch = () => {
      api.get(`/rooms/${code}`).then((data) => {
        if (data) { setRoomData(data); store.set('roomData', data) }
      }).catch(() => {})
    }
    // presence:list on connect/disconnect; room:updated after a rename or
    // theme change — either one should freshen the local roomData cache.
    const offs = [
      ws.on('presence:list', refetch),
      ws.on('room:updated', refetch),
    ]
    return () => offs.forEach((off) => off())
  }, [ws, code])

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
    { to: '/journal',  Icon: BookOpen,    label: 'Journal',     desc: 'Write together daily' },
    { to: '/watch',    Icon: Tv,          label: 'Watch Party', desc: 'YouTube sync + chat' },
    { to: '/bucket',   Icon: ListChecks,  label: 'Bucket List', desc: 'Plan your next meetup' },
    { to: '/trivia',   Icon: HelpCircle,  label: 'Trivia',      desc: 'How well do you know each other?' },
    { to: '/puzzle',   Icon: PuzzleIcon,  label: 'Puzzle',      desc: 'Solve together in real-time' },
    { to: '/draw',     Icon: Pencil,      label: 'Draw',        desc: 'Shared canvas, live strokes' },
    { to: '/music',    Icon: Music2,      label: 'Song Letters', desc: 'Send a song with a note' },
    { to: '/film',     Icon: Camera,      label: 'Film Roll',    desc: 'Weekly photo + video reveal' },
    { to: '/timeline', Icon: History,     label: 'Timeline',    desc: 'Your story, together' },
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
                // Current user: trust ws.connected directly — presence list may
                // not have arrived yet when this renders.
                const isOnline = m.userId === uid
                  ? ws?.connected
                  : online.some((u) => u.userId === m.userId)
                const showLastSeen = !isOnline && m.userId !== uid && m.lastSeenAt
                return (
                  <span key={m.userId} className={`text-xs px-2.5 py-1 rounded-full font-medium flex items-center gap-1.5 ${
                    isOnline ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'
                  }`}>
                    <span className={`h-2 w-2 rounded-full ${isOnline ? 'bg-emerald-500' : 'bg-slate-300 ring-1 ring-slate-400'}`} aria-hidden="true" />
                    {m.name}
                    {showLastSeen && (
                      <span className="text-[10px] opacity-75 ml-0.5">· {shortAgo(m.lastSeenAt)}</span>
                    )}
                  </span>
                )
              })}
            </div>
          </div>
          <button
            onClick={() => setShowSettings(true)}
            className="p-2 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-50 transition-all"
            title="Room settings"
            aria-label="Room settings"
          >
            <Settings className="h-5 w-5" strokeWidth={2} />
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

      <TimezoneStrip ws={ws} roomData={roomData} online={online} t={t} />

      <ActivityCard roomData={roomData} t={t} />

      <NotesCard ws={ws} roomData={roomData} t={t} />

      <MoodCard ws={ws} roomData={roomData} t={t} />

      <TouchCard ws={ws} roomData={roomData} online={online} t={t} />

      {/* Meetup countdown */}
      <div className="bg-white rounded-2xl p-4 shadow-sm border border-slate-100">
        <h3 className="font-semibold text-slate-700 mb-3 inline-flex items-center gap-2">
          <Heart className="h-4 w-4 text-slate-500" strokeWidth={2} aria-hidden="true" />
          Next Meetup
        </h3>
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

      <MilestonesCard code={code} t={t} />

      <StatsCard code={code} roomData={roomData} ws={ws} t={t} />

      {/* Feature grid */}
      <div className="grid grid-cols-2 gap-3">
        {features.map(({ to, Icon, label, desc }) => (
          <Link key={to} to={to}
            className={`bg-white rounded-2xl p-4 shadow-sm border ${t.card} hover:shadow-md transition-all`}>
            <div className={`h-10 w-10 rounded-xl ${t.accentBg} ${t.accent} flex items-center justify-center mb-3`}>
              <Icon className="h-5 w-5" strokeWidth={2} aria-hidden="true" />
            </div>
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
          onLeave={() => { store.clear(); nav('/') }}
          t={t}
        />
      )}
    </div>
  )
}
