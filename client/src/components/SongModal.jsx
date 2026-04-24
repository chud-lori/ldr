import { useState, useEffect } from 'react'
import { X, Heart } from '../lib/icons'
import { api } from '../lib/api'
import { store } from '../lib/store'
import SongCard from './SongCard'
import SongPlayer from './SongPlayer'

// Plays a song in a full overlay.
//  - mode "fresh"  : unheard; after the track ends shows the Keep / Let-go
//                    prompt. Closing while undecided defaults to dismiss,
//                    with a 30s undo toast raised by the parent.
//  - mode "replay" : already saved; just plays through, no decision.
export default function SongModal({ song, mode = 'fresh', partnerName, onClose, onDecision }) {
  const [ended, setEnded] = useState(false)
  const [decided, setDecided] = useState(false)

  // Tell the sender we opened it — fires song:heard immediately so they
  // see "heard" status without waiting for the full-listen + decision.
  // Server is idempotent: replays of already-heard songs are no-ops.
  useEffect(() => {
    if (mode !== 'fresh' || !song?.id) return
    const code = store.get('roomCode')
    api.post(`/rooms/${code}/songs/${song.id}/open`, {}).catch(() => {})
  }, [song?.id, mode])

  function decide(status) {
    if (decided) return
    setDecided(true)
    onDecision?.(status, { auto: false })
    onClose()
  }

  function closeNow() {
    if (mode === 'fresh' && ended && !decided) {
      onDecision?.('dismissed', { auto: true })
    }
    onClose()
  }

  return (
    <div
      className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center p-3 sm:p-4 overflow-y-auto"
      data-testid="song-modal"
    >
      <div className="w-full max-w-md space-y-3">
        <div className="flex justify-end">
          <button
            onClick={closeNow}
            className="text-white/80 hover:text-white p-1"
            aria-label="Close"
            data-testid="song-modal-close"
          >
            <X className="h-6 w-6" strokeWidth={2} />
          </button>
        </div>

        <SongCard
          song={song}
          variant={mode === 'fresh' ? 'inbox' : 'saved'}
          partnerName={partnerName}
          actionSlot={
            <SongPlayer
              provider={song.provider}
              trackId={song.trackId}
              autoPlay
              onEnded={() => setEnded(true)}
            />
          }
        />

        {mode === 'fresh' && ended && !decided && (
          <div className="bg-white rounded-2xl p-4 shadow-sm border border-slate-100 space-y-3" data-testid="song-decision">
            <p className="text-sm text-slate-700 text-center font-medium">
              Keep this one?
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => decide('dismissed')}
                data-testid="song-decision-letgo"
                className="flex-1 rounded-xl py-2.5 text-sm font-semibold text-slate-500 hover:bg-slate-50 border border-slate-200"
              >
                Let it go
              </button>
              <button
                onClick={() => decide('saved')}
                data-testid="song-decision-keep"
                className="flex-1 rounded-xl py-2.5 text-sm font-semibold bg-rose-500 text-white hover:bg-rose-600 inline-flex items-center justify-center gap-1.5"
              >
                <Heart className="h-4 w-4" strokeWidth={2.5} />
                Keep
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
