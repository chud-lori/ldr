import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../lib/api'
import { store } from '../lib/store'
import { useTheme } from '../hooks/useTheme'
import { DEFAULT_THEME } from '../lib/themes'

export default function Home() {
  const { setTheme } = useTheme()
  const [tab, setTab] = useState('create')
  const [name, setName] = useState('')
  const [roomName, setRoomName] = useState('')
  const [code, setCode] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const nav = useNavigate()

  async function handleCreate(e) {
    e.preventDefault()
    if (!name.trim()) return
    setLoading(true)
    setError('')
    try {
      const data = await api.post('/rooms', { name: roomName || `${name}'s room`, userName: name })
      store.set('userId', data.userId)
      store.set('userName', name)
      store.set('roomCode', data.code)
      store.set('roomData', data.room)
      setTheme(data.room.theme || DEFAULT_THEME)
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
      store.set('userId', data.userId)
      store.set('userName', name)
      store.set('roomCode', data.room.code)
      store.set('roomData', data.room)
      setTheme(data.room.theme || DEFAULT_THEME)
      nav('/dashboard')
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-rose-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-lg p-8 w-full max-w-sm">
        <div className="text-center mb-6">
          <div className="text-5xl mb-2">💑</div>
          <h1 className="text-2xl font-bold text-gray-800">LDR Together</h1>
          <p className="text-gray-400 text-sm mt-1">Stay close, no matter the distance</p>
        </div>

        <div className="flex rounded-lg bg-rose-50 p-1 mb-6">
          {['create', 'join'].map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`flex-1 py-2 rounded-md text-sm font-medium transition-all ${
                tab === t ? 'bg-white shadow text-rose-600' : 'text-gray-500'
              }`}
            >
              {t === 'create' ? 'Create Room' : 'Join Room'}
            </button>
          ))}
        </div>

        {tab === 'create' ? (
          <form onSubmit={handleCreate} className="space-y-3">
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
        ) : (
          <form onSubmit={handleJoin} className="space-y-3">
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

        {error && <p className="text-red-500 text-xs mt-3 text-center">{error}</p>}
      </div>
    </div>
  )
}
