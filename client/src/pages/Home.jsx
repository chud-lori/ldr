import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../lib/api'
import { store } from '../lib/store'
import { useTheme } from '../hooks/useTheme'
import { useToast } from '../components/Toast'
import { DEFAULT_THEME } from '../lib/themes'
import { Heart, ArrowLeft, Mail, Send } from '../lib/icons'

export default function Home() {
  const { setTheme } = useTheme()
  const toast = useToast()
  // 'choose' = pick a path; 'create' = first one in; 'join' = partner sent a code.
  // Forces a deliberate choice so couples don't accidentally end up in two
  // separate rooms.
  const [tab, setTab] = useState('choose')
  const [name, setName] = useState('')
  const [roomName, setRoomName] = useState('')
  const [code, setCode] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const nav = useNavigate()

  // Route on mount:
  //   1. Personal link (?roomCode=X&userId=Y) → restore session and go to dashboard
  //   2. Existing localStorage session → go straight to dashboard (Slack/Discord-style)
  //   3. Otherwise → show the create/join form
  useEffect(() => {
    const params = new URLSearchParams(location.search)
    // Both codes use the same uppercase-only charset. Some chat clients
    // (Telegram, etc) display URLs lowercased even though the link itself
    // preserves case — uppercasing here makes copy-pasted links forgiving.
    const rc = (params.get('roomCode') || '').toUpperCase()
    const uid = (params.get('userId') || '').toUpperCase()

    if (rc && uid) {
      // The URL carries the signed token; the raw userId is the part
      // before the signature. Store both: raw `userId` for in-app
      // comparisons, full `authToken` for the X-User-ID header.
      const rawUid = uid.includes('.') ? uid.split('.')[0] : uid
      store.set('roomCode', rc)
      store.set('userId', rawUid)
      store.set('authToken', uid)
      api.get(`/rooms/${rc}`).then((data) => {
        const member = data?.members?.find((m) => m.userId === rawUid)
        if (member) {
          store.set('userName', member.name)
          store.set('roomData', data)
          setTheme(data.theme || DEFAULT_THEME)
          nav('/dashboard', { replace: true })
        } else {
          store.set('userId', '')
          store.set('authToken', '')
          setError('This personal link is no longer valid.')
        }
      }).catch(() => setError('Could not connect. Try again.'))
      return
    }

    const storedCode = store.get('roomCode')
    const storedUid = store.get('userId')
    if (storedCode && storedUid) {
      nav('/dashboard', { replace: true })
    }
  }, [])

  async function handleCreate(e) {
    e.preventDefault()
    if (!name.trim()) return
    setLoading(true)
    setError('')
    try {
      const data = await api.post('/rooms', { name: roomName || `${name}'s room`, userName: name })
      store.set('userId', data.userId)
      store.set('authToken', data.authToken || data.userId)
      store.set('userName', name)
      store.set('roomCode', data.code)
      store.set('roomData', data.room)
      setTheme(data.room.theme || DEFAULT_THEME)
      toast('Room created! Save your personal link on the dashboard so you can rejoin from any device.', 'info', 7000)
      nav('/dashboard')
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  async function handleJoin(e) {
    e.preventDefault()
    if (!name.trim() || !code.trim()) return
    setLoading(true)
    setError('')
    try {
      const existingUid = store.get('userId') || ''
      const joinUrl = `/rooms/${code.trim().toUpperCase()}/join${existingUid ? `?userId=${existingUid}` : ''}`
      const data = await api.post(joinUrl, { userName: name })
      const isRejoin = existingUid && data.userId === existingUid
      store.set('userId', data.userId)
      store.set('authToken', data.authToken || data.userId)
      store.set('userName', name)
      store.set('roomCode', data.room.code)
      store.set('roomData', data.room)
      setTheme(data.room.theme || DEFAULT_THEME)
      toast(isRejoin ? `Welcome back! You're in room ${data.room.code} 👩‍❤️‍👨` : `You joined room ${data.room.code}! 👩‍❤️‍👨`, 'success')
      nav('/dashboard')
    } catch (err) {
      // "Room is full" is the most common confusing error: it fires when
      // an existing member tries to re-join a different browser without
      // their personal link. Surface the recovery path instead of the
      // raw 403 text.
      const m = (err?.message || '').toLowerCase()
      if (m.includes('full')) {
        setError("This room already has two people. If one of them is you, open the app on your other device and tap the personal link there — your account follows the link, not the name.")
      } else {
        setError(err.message)
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-rose-50 flex flex-col items-center justify-center p-4 gap-4">
      <div className="bg-white rounded-2xl shadow-lg p-8 w-full max-w-sm">
        <div className="text-center mb-6">
          <div className="mx-auto mb-3 h-14 w-14 rounded-2xl bg-rose-100 text-rose-500 flex items-center justify-center">
            <Heart className="h-7 w-7" strokeWidth={2} aria-hidden="true" />
          </div>
          <h1 className="text-2xl font-bold text-gray-800">LDR</h1>
          <p className="text-gray-400 text-sm mt-1">Stay close, no matter the distance</p>
        </div>

        {tab === 'choose' && (
          <div className="space-y-3">
            <p className="text-sm text-slate-600 text-center mb-4">
              Only one of you needs to create the room — the other joins with a code or link.
            </p>
            <button
              onClick={() => setTab('join')}
              className="w-full text-left rounded-xl border border-rose-200 bg-rose-50 hover:bg-rose-100 hover:border-rose-300 p-4 transition-colors"
            >
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-xl bg-rose-100 text-rose-500 flex items-center justify-center shrink-0">
                  <Mail className="h-5 w-5" strokeWidth={2} aria-hidden="true" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-slate-800 text-sm">My partner sent me a code</div>
                  <div className="text-xs text-slate-500 mt-0.5">Join their room with the link or 6-character code.</div>
                </div>
              </div>
            </button>
            <button
              onClick={() => setTab('create')}
              className="w-full text-left rounded-xl border border-slate-200 hover:border-slate-300 hover:bg-slate-50 p-4 transition-colors"
            >
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-xl bg-slate-100 text-slate-600 flex items-center justify-center shrink-0">
                  <Send className="h-5 w-5" strokeWidth={2} aria-hidden="true" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-slate-800 text-sm">I'm starting our room</div>
                  <div className="text-xs text-slate-500 mt-0.5">You'll get a code/link to send to your partner.</div>
                </div>
              </div>
            </button>
          </div>
        )}

        {(tab === 'create' || tab === 'join') && (
          <button
            onClick={() => { setTab('choose'); setError('') }}
            className="text-xs text-slate-400 hover:text-slate-600 inline-flex items-center gap-1 mb-4"
          >
            <ArrowLeft className="h-3.5 w-3.5" strokeWidth={2} />
            Back
          </button>
        )}

        {tab === 'create' && (
          <form onSubmit={handleCreate} className="space-y-3">
            <p className="text-xs text-slate-500 text-center -mt-1 mb-1">
              After creating, share the link from your dashboard so your partner can join the same room.
            </p>
            <input
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-rose-300"
              placeholder="Your name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
            <input
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-rose-300"
              placeholder="Room name (optional)"
              value={roomName}
              onChange={(e) => setRoomName(e.target.value)}
            />
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-rose-500 text-white rounded-lg py-2 text-sm font-semibold hover:bg-rose-600 disabled:opacity-50"
            >
              {loading ? 'Creating...' : 'Create Room'}
            </button>
          </form>
        )}

        {tab === 'join' && (
          <form onSubmit={handleJoin} className="space-y-3">
            <p className="text-xs text-slate-500 text-center -mt-1 mb-1">
              Paste the link your partner sent, or type the 6-character room code below.
            </p>
            <input
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-rose-300"
              placeholder="Your name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
            <input
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm font-mono uppercase focus:outline-none focus:border-rose-300"
              placeholder="Room code (e.g. AB3XY2)"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              maxLength={6}
              required
            />
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-rose-500 text-white rounded-lg py-2 text-sm font-semibold hover:bg-rose-600 disabled:opacity-50"
            >
              {loading ? 'Joining...' : 'Join Room'}
            </button>
          </form>
        )}

        {error && tab !== 'choose' && <p className="text-red-500 text-xs mt-3 text-center">{error}</p>}
      </div>

      <p className="text-center text-slate-400 text-xs mt-4">
        Made with 💗 by{' '}
        <a href="https://profile.lori.my.id" target="_blank" rel="noopener noreferrer"
          className="hover:text-slate-600 underline underline-offset-2 transition-colors">
          Lori
        </a>
      </p>
    </div>
  )
}
