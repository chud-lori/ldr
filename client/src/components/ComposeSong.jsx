import { useState } from 'react'
import { api } from '../lib/api'
import { store } from '../lib/store'
import { useTheme } from '../hooks/useTheme'
import { X, Music2, Send } from '../lib/icons'
import SongCard from './SongCard'

// Modal for composing a song-letter. Paste a Spotify or YouTube link,
// the server resolves it via oEmbed into a preview card, then the user
// writes their message and hits Send.
export default function ComposeSong({ onClose, onSent, partnerName }) {
  const { t } = useTheme()
  const code = store.get('roomCode')
  const name = store.get('userName')

  const [url, setUrl] = useState('')
  const [preview, setPreview] = useState(null)
  const [message, setMessage] = useState('')
  const [resolving, setResolving] = useState(false)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')

  async function resolve() {
    if (!url.trim() || resolving) return
    setResolving(true)
    setError('')
    try {
      const data = await api.get(`/rooms/${code}/songs/resolve?url=${encodeURIComponent(url.trim())}`)
      setPreview(data)
    } catch (err) {
      const msg = (err?.message || '').toLowerCase()
      // Bad URL → server returns 400 with "couldn't recognize that link"
      if (msg.includes('recognize')) {
        setError("That link doesn't look like a Spotify or YouTube song.")
      } else if (msg.includes('fetch') || msg === '') {
        // Network error — server likely not running or the proxy can't reach it.
        setError("Couldn't reach the server. Is it running?")
      } else {
        setError(err.message)
      }
    }
    setResolving(false)
  }

  async function send() {
    if (!preview || sending) return
    setSending(true)
    setError('')
    try {
      const created = await api.post(`/rooms/${code}/songs`, {
        name,
        url: preview.url,
        message: message.trim(),
      })
      onSent?.(created)
    } catch (err) {
      setError(err?.message || 'Failed to send')
      setSending(false)
    }
  }

  const previewSong = preview
    ? { ...preview, senderName: name, message, createdAt: new Date().toISOString() }
    : null

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center p-3 sm:p-4">
      <div className="bg-white rounded-t-2xl sm:rounded-2xl shadow-xl w-full max-w-md p-5 space-y-4 max-h-[92vh] overflow-y-auto">
        <div className="flex items-center justify-between">
          <h3 className="font-bold text-slate-800 text-lg inline-flex items-center gap-2">
            <Music2 className="h-5 w-5 text-slate-500" strokeWidth={2} />
            Send a song
          </h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 p-1 -m-1" aria-label="Close">
            <X className="h-5 w-5" strokeWidth={2} />
          </button>
        </div>

        {!preview && (
          <>
            <label className="block">
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Song link</span>
              <input
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && resolve()}
                placeholder="Paste Spotify or YouTube URL"
                autoFocus
                data-testid="compose-song-url"
                className="mt-1.5 w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm text-slate-700 placeholder-slate-400 focus:outline-none focus:border-slate-400"
              />
            </label>
            {error && <p className="text-xs text-red-500">{error}</p>}
            <button
              onClick={resolve}
              disabled={!url.trim() || resolving}
              className={`w-full ${t.btn} rounded-xl py-2.5 text-sm font-semibold disabled:opacity-50`}
            >
              {resolving ? 'Looking up…' : 'Next'}
            </button>
          </>
        )}

        {preview && (
          <>
            <SongCard song={previewSong} partnerName={partnerName} variant="sent" />
            <label className="block">
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Your message</span>
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="write something from the heart…"
                rows={3}
                autoFocus
                data-testid="compose-song-message"
                className="mt-1.5 w-full border border-slate-200 rounded-xl px-3 py-2.5 text-slate-700 placeholder-slate-400 focus:outline-none focus:border-slate-400 resize-none"
                style={{ fontFamily: "'Caveat', cursive", fontSize: '1.25rem', lineHeight: 1.4 }}
              />
            </label>
            {error && <p className="text-xs text-red-500">{error}</p>}
            <div className="flex gap-2">
              <button
                onClick={() => { setPreview(null); setMessage('') }}
                className="px-4 py-2.5 rounded-xl text-sm text-slate-500 hover:bg-slate-50"
              >
                Back
              </button>
              <button
                onClick={send}
                disabled={sending}
                data-testid="compose-song-send"
                className={`flex-1 ${t.btn} rounded-xl py-2.5 text-sm font-semibold disabled:opacity-50 inline-flex items-center justify-center gap-2`}
              >
                <Send className="h-4 w-4" strokeWidth={2} />
                {sending ? 'Sending…' : `Send to ${partnerName || 'them'}`}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
