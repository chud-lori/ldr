import { useEffect, useState } from 'react'
import { api } from '../lib/api'
import { store } from '../lib/store'
import { useTheme } from '../hooks/useTheme'

function SurpriseItem({ item, uid }) {
  const isLocked = item.surprise && item.userId !== uid && !item.text
  return (
    <div className={`flex items-start gap-3 p-3 rounded-xl border transition-all ${
      item.done ? 'bg-slate-50 border-slate-100 opacity-60' : 'bg-white border-slate-100'
    }`}>
      <div className="mt-0.5 text-base">{item.done ? '✅' : isLocked ? '🔒' : '📌'}</div>
      <div className="flex-1 min-w-0">
        <div className="text-xs text-slate-400 mb-0.5 font-medium">{item.name}</div>
        {isLocked ? (
          <div className="text-sm text-slate-400 italic">
            Surprise reveal {item.revealAt ? `on ${new Date(item.revealAt).toLocaleDateString()}` : 'at meetup'}
          </div>
        ) : (
          <div className={`text-sm ${item.done ? 'line-through text-slate-400' : 'text-slate-700'}`}>
            {item.text}
          </div>
        )}
      </div>
    </div>
  )
}

export default function BucketList() {
  const { t } = useTheme()
  const code = store.get('roomCode')
  const uid = store.get('userId')
  const name = store.get('userName')

  const [items, setItems] = useState([])
  const [text, setText] = useState('')
  const [surprise, setSurprise] = useState(false)
  const [revealAt, setRevealAt] = useState('')
  const [loading, setLoading] = useState(false)

  async function load() {
    const data = await api.get(`/rooms/${code}/bucketlist`)
    setItems(data || [])
  }

  useEffect(() => { load() }, [])

  async function add(e) {
    e.preventDefault()
    if (!text.trim()) return
    setLoading(true)
    await api.post(`/rooms/${code}/bucketlist`, {
      name, text, surprise,
      revealAt: revealAt ? new Date(revealAt).toISOString() : undefined,
    })
    setText('')
    setSurprise(false)
    setRevealAt('')
    await load()
    setLoading(false)
  }

  async function toggleDone(item) {
    if (item.userId !== uid) return
    await api.patch(`/rooms/${code}/bucketlist/${item.id}`, { done: !item.done, text: item.text })
    load()
  }

  async function remove(item) {
    if (item.userId !== uid) return
    await api.del(`/rooms/${code}/bucketlist/${item.id}`)
    load()
  }

  const pending = items.filter((i) => !i.done)
  const done = items.filter((i) => i.done)

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-2xl p-4 shadow-sm border border-slate-100">
        <h2 className="font-bold text-slate-800 mb-3">🗺️ Bucket List</h2>
        <form onSubmit={add} className="space-y-3">
          <textarea value={text} onChange={(e) => setText(e.target.value)}
            placeholder="Add something to do together…"
            rows={2}
            className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm text-slate-700 placeholder-slate-400 focus:outline-none focus:border-slate-400 resize-none" />
          <div className="flex items-center gap-3 flex-wrap">
            <label className="flex items-center gap-2 text-sm text-slate-600 cursor-pointer">
              <input type="checkbox" checked={surprise} onChange={(e) => setSurprise(e.target.checked)}
                className={t.check} />
              🎁 Surprise reveal
            </label>
            {surprise && (
              <input type="date" value={revealAt} onChange={(e) => setRevealAt(e.target.value)}
                className="flex-1 border border-slate-200 rounded-lg px-2 py-1.5 text-sm text-slate-600 focus:outline-none focus:border-slate-400"
                placeholder="Reveal date (optional)" />
            )}
          </div>
          <button type="submit" disabled={loading || !text.trim()}
            className={`w-full ${t.btn} rounded-xl py-2.5 text-sm font-semibold disabled:opacity-50`}>
            Add to List
          </button>
        </form>
      </div>

      {pending.length > 0 && (
        <div className="bg-white rounded-2xl p-4 shadow-sm border border-slate-100">
          <h3 className="text-sm font-semibold text-slate-600 mb-3">To Do ({pending.length})</h3>
          <div className="space-y-2">
            {pending.map((item) => (
              <div key={item.id} className="flex items-start gap-2">
                <div className="flex-1"><SurpriseItem item={item} uid={uid} /></div>
                {item.userId === uid && (
                  <div className="flex flex-col gap-1 mt-2">
                    <button onClick={() => toggleDone(item)} className="text-xs text-emerald-500 hover:text-emerald-700 font-bold">✓</button>
                    <button onClick={() => remove(item)} className="text-xs text-slate-300 hover:text-red-400">✕</button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {done.length > 0 && (
        <div className="bg-white rounded-2xl p-4 shadow-sm border border-slate-100">
          <h3 className="text-sm font-semibold text-slate-400 mb-3">Completed ({done.length})</h3>
          <div className="space-y-2">
            {done.map((item) => (
              <div key={item.id} className="flex items-start gap-2">
                <div className="flex-1"><SurpriseItem item={item} uid={uid} /></div>
                {item.userId === uid && (
                  <button onClick={() => remove(item)} className="text-xs text-slate-300 hover:text-red-400 mt-2">✕</button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {items.length === 0 && (
        <div className="text-center py-12 bg-white rounded-2xl border border-slate-100 shadow-sm">
          <div className="text-5xl mb-3">🗺️</div>
          <p className="text-slate-500 font-medium">Your bucket list is empty</p>
          <p className="text-slate-400 text-sm mt-1">Start planning things to do together!</p>
        </div>
      )}
    </div>
  )
}
