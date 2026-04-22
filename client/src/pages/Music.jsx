import { useCallback, useEffect, useState } from 'react'
import { api } from '../lib/api'
import { store } from '../lib/store'
import { useTheme } from '../hooks/useTheme'
import { useToast } from '../components/Toast'
import { Music2, Plus, Inbox, Bookmark, Send } from '../lib/icons'
import InviteButton from '../components/InviteButton'
import SongCard from '../components/SongCard'
import SongModal from '../components/SongModal'
import ComposeSong from '../components/ComposeSong'

const TABS = [
  { key: 'inbox', label: 'Inbox',  Icon: Inbox },
  { key: 'saved', label: 'Saved',  Icon: Bookmark },
  { key: 'sent',  label: 'Sent',   Icon: Send },
]

export default function Music({ ws, online = [] }) {
  const { t } = useTheme()
  const toast = useToast()
  const code = store.get('roomCode')
  const uid = store.get('userId')
  const roomData = store.get('roomData')

  const partner = (roomData?.members || []).find((m) => m.userId !== uid)
  const partnerName = partner?.name || 'them'

  const [tab, setTab] = useState('inbox')
  const [songs, setSongs] = useState([])
  const [composing, setComposing] = useState(false)
  const [playing, setPlaying] = useState(null) // {song, mode}

  const load = useCallback(async () => {
    try {
      const data = await api.get(`/rooms/${code}/songs`)
      setSongs(Array.isArray(data) ? data : [])
    } catch {}
  }, [code])

  useEffect(() => { load() }, [load])

  // Partner sent us one / heard ours / saved ours — refetch.
  useEffect(() => {
    if (!ws) return
    const offs = [
      ws.on('song:sent', (msg) => { if (msg.userId !== uid) load() }),
      ws.on('song:heard', (msg) => { if (msg.userId !== uid) load() }),
      ws.on('song:saved', (msg) => { if (msg.userId !== uid) load() }),
    ]
    return () => offs.forEach((off) => off())
  }, [ws, uid, load])

  // Decision from SongModal. Persists status, emits WS feedback for the
  // sender, and (for dismiss) raises a 30s undo toast.
  const decide = useCallback(async (song, newStatus, { auto }) => {
    // Optimistic update so the list reshuffles instantly.
    setSongs((prev) => prev.map((s) => s.id === song.id ? { ...s, status: newStatus, heardAt: new Date().toISOString() } : s))
    try {
      await api.patch(`/rooms/${code}/songs/${song.id}`, { status: newStatus })
    } catch {
      load() // snap back to server truth
      return
    }
    // Let the sender know: heard always, saved only when kept.
    ws?.send('song:heard', { id: song.id })
    if (newStatus === 'saved') ws?.send('song:saved', { id: song.id })

    if (newStatus === 'dismissed') {
      toast(auto ? 'Song drifted away' : 'Let go', 'info', {
        duration: 30000,
        action: {
          label: 'Undo',
          onClick: async () => {
            try {
              await api.patch(`/rooms/${code}/songs/${song.id}`, { status: 'unheard' })
              load()
            } catch {}
          },
        },
      })
    } else if (newStatus === 'saved') {
      toast('Kept in Saved ❤', 'success')
    }
  }, [code, ws, toast, load])

  const inbox = songs.filter((s) => s.recipientId === uid && s.status === 'unheard')
  const saved = songs.filter((s) => s.recipientId === uid && s.status === 'saved')
  const sent  = songs
    .filter((s) => s.senderId === uid)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))

  const counts = { inbox: inbox.length, saved: saved.length, sent: sent.length }

  async function unsave(song) {
    // Move a saved song back to Inbox (so it'll replay with a fresh decision).
    try {
      await api.patch(`/rooms/${code}/songs/${song.id}`, { status: 'unheard' })
      load()
    } catch {}
  }

  async function deleteSent(song) {
    try {
      await api.del(`/rooms/${code}/songs/${song.id}`)
      load()
    } catch {}
  }

  const list = tab === 'inbox' ? inbox : tab === 'saved' ? saved : sent

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <h2 className="font-bold text-slate-800 inline-flex items-center gap-2">
          <Music2 className="h-5 w-5 text-slate-500" strokeWidth={2} aria-hidden="true" />
          Song Letters
        </h2>
        <div className="flex items-center gap-2">
          <InviteButton ws={ws} online={online} feature="music" selfId={uid} />
          <button
            onClick={() => setComposing(true)}
            data-testid="music-compose"
            className={`inline-flex items-center gap-1.5 text-xs font-semibold rounded-lg px-3 py-1.5 ${t.btn} whitespace-nowrap`}
          >
            <Plus className="h-3.5 w-3.5" strokeWidth={2.5} />
            Send<span className="hidden sm:inline"> a song</span>
          </button>
        </div>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-1 inline-flex w-full">
        {TABS.map(({ key, label, Icon }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            data-testid={`music-tab-${key}`}
            className={`flex-1 inline-flex items-center justify-center gap-1 sm:gap-1.5 px-1 py-2 text-xs sm:text-sm font-semibold rounded-xl transition-colors ${
              tab === key ? `${t.accentBg} ${t.accent}` : 'text-slate-500 hover:bg-slate-50'
            }`}
          >
            <Icon className="h-4 w-4 shrink-0" strokeWidth={2} />
            <span className="truncate">{label}</span>
            {counts[key] > 0 && (
              <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full shrink-0 ${
                tab === key ? 'bg-white/60' : 'bg-slate-100 text-slate-500'
              }`}>
                {counts[key]}
              </span>
            )}
          </button>
        ))}
      </div>

      {list.length === 0 && (
        <div className="text-center py-12 bg-white rounded-2xl border border-slate-100 shadow-sm">
          <div className={`mx-auto mb-3 h-14 w-14 rounded-2xl ${t.accentBg} ${t.accent} flex items-center justify-center`}>
            <Music2 className="h-7 w-7" strokeWidth={2} aria-hidden="true" />
          </div>
          {tab === 'inbox' && (
            <>
              <p className="text-slate-500 font-medium">Nothing waiting to play</p>
              <p className="text-slate-400 text-sm mt-1">Ask {partnerName} to send you a song</p>
            </>
          )}
          {tab === 'saved' && (
            <>
              <p className="text-slate-500 font-medium">No songs kept yet</p>
              <p className="text-slate-400 text-sm mt-1">The ones you keep will live here</p>
            </>
          )}
          {tab === 'sent' && (
            <>
              <p className="text-slate-500 font-medium">You haven't sent any songs</p>
              <p className="text-slate-400 text-sm mt-1">Tap "Send a song" to start</p>
            </>
          )}
        </div>
      )}

      <div className="space-y-3" data-testid={`music-list-${tab}`}>
        {list.map((song) => {
          if (tab === 'inbox') {
            return (
              <SongCard
                key={song.id}
                song={song}
                variant="inbox"
                onClick={() => setPlaying({ song, mode: 'fresh' })}
              />
            )
          }
          if (tab === 'saved') {
            return (
              <SongCard
                key={song.id}
                song={song}
                variant="saved"
                onClick={() => setPlaying({ song, mode: 'replay' })}
                actionSlot={
                  <button
                    onClick={(e) => { e.stopPropagation(); unsave(song) }}
                    className="text-xs text-slate-400 hover:text-slate-600"
                  >
                    Move back to inbox
                  </button>
                }
              />
            )
          }
          return (
            <SongCard
              key={song.id}
              song={song}
              variant="sent"
              partnerName={partnerName}
              actionSlot={
                !song.heardAt && (
                  <button
                    onClick={() => deleteSent(song)}
                    className="text-xs text-slate-400 hover:text-red-400"
                  >
                    Delete (only while unheard)
                  </button>
                )
              }
            />
          )
        })}
      </div>

      {composing && (
        <ComposeSong
          partnerName={partnerName}
          onClose={() => setComposing(false)}
          onSent={(created) => {
            setComposing(false)
            setSongs((prev) => [created, ...prev])
            ws?.send('song:sent', { id: created.id })
            toast(`Sent to ${partnerName} 💗`, 'success')
            setTab('sent')
          }}
        />
      )}

      {playing && (
        <SongModal
          song={playing.song}
          mode={playing.mode}
          partnerName={partnerName}
          onClose={() => setPlaying(null)}
          onDecision={(status, opts) => decide(playing.song, status, opts)}
        />
      )}
    </div>
  )
}
