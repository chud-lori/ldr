import { Music2 } from '../lib/icons'

function timeAgo(iso) {
  if (!iso) return ''
  const ms = Date.now() - new Date(iso).getTime()
  const m = Math.floor(ms / 60000)
  if (m < 1) return 'just now'
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  const d = Math.floor(h / 24)
  if (d < 30) return `${d}d ago`
  const mo = Math.floor(d / 30)
  return `${mo}mo ago`
}

// Spotify wordmark: round black badge with green note. Simple SVG kept
// inline so we don't drag in the whole brand package.
function SpotifyMark() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden="true">
      <circle cx="12" cy="12" r="12" fill="#1DB954" />
      <path fill="#fff" d="M17.4 10.5c-2.9-1.7-7.7-1.9-10.4-1.1-.4.1-.9-.1-1-.5-.1-.4.1-.9.6-1 3.1-1 8.3-.7 11.7 1.3.4.2.6.8.3 1.2-.3.4-.8.5-1.2.1zm-.1 2.4c-.2.3-.6.4-.9.2-2.4-1.5-6.1-1.9-8.9-1-.4.1-.8-.1-.9-.4-.1-.4.1-.8.4-.9 3.2-1 7.3-.5 10.1 1.2.3.2.4.6.2.9zm-1.1 2.3c-.2.3-.5.3-.8.2-2.1-1.3-4.7-1.6-7.9-.9-.3.1-.6-.1-.7-.4-.1-.3.1-.6.4-.7 3.4-.8 6.3-.4 8.7 1 .3.2.3.5.3.8z"/>
    </svg>
  )
}

function YouTubeMark() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden="true">
      <rect x="2" y="5" width="20" height="14" rx="3" fill="#FF0000" />
      <path fill="#fff" d="M10 9.2v5.6l5-2.8z" />
    </svg>
  )
}

function ProviderMark({ provider }) {
  if (provider === 'spotify') return <SpotifyMark />
  if (provider === 'youtube') return <YouTubeMark />
  return <Music2 className="h-5 w-5 text-slate-400" strokeWidth={2} />
}

// variant: inbox | saved | sent
// - inbox: "From: {sender} · {time ago}" — tap to play, full opacity
// - saved: "Kept from {sender}" — tap to replay, subtle heart tint
// - sent:  "To: {partner}" + status pill (waiting / heard / saved)
export default function SongCard({ song, variant = 'inbox', partnerName, onClick, actionSlot }) {
  const isInbox = variant === 'inbox'
  const isSent = variant === 'sent'

  let headerLabel = ''
  if (variant === 'inbox') headerLabel = `From: ${song.senderName || 'them'}`
  else if (variant === 'saved') headerLabel = `From: ${song.senderName || 'them'}`
  else if (variant === 'sent') headerLabel = `To: ${partnerName || 'them'}`

  const when = song.savedAt || song.heardAt || song.createdAt
  const suffix = isSent
    ? statusLabel(song)
    : timeAgo(when)

  const clickable = !!onClick
  const Tag = clickable ? 'button' : 'div'

  return (
    <Tag
      onClick={onClick}
      className={`block text-left w-full bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden transition-all ${
        clickable ? 'hover:shadow-md active:scale-[0.99]' : ''
      }`}
    >
      <div className="p-4 space-y-3">
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-medium text-slate-400 bg-slate-50 rounded-full px-2.5 py-1">
            {headerLabel}
          </span>
          <span className="text-[11px] text-slate-300">·</span>
          <span className="text-[11px] text-slate-400">{suffix}</span>
          {isInbox && clickable && (
            <span className="ml-auto inline-flex items-center gap-1 text-[10px] font-semibold text-rose-500 bg-rose-50 rounded-full px-2 py-0.5">
              <span className="h-1.5 w-1.5 rounded-full bg-rose-500 animate-pulse" />
              NEW
            </span>
          )}
        </div>

        {song.message ? (
          <p
            className="text-slate-700 text-xl leading-relaxed break-words"
            style={{ fontFamily: "'Caveat', cursive", fontWeight: 500 }}
          >
            {song.message}
          </p>
        ) : (
          <p
            className="text-slate-400 italic text-lg"
            style={{ fontFamily: "'Caveat', cursive" }}
          >
            (no note)
          </p>
        )}
      </div>

      <div className="flex items-center gap-3 px-4 py-3 bg-slate-50 border-t border-slate-100">
        {song.thumb ? (
          <img
            src={song.thumb}
            alt=""
            className="h-10 w-10 rounded object-cover bg-slate-200 shrink-0"
            loading="lazy"
          />
        ) : (
          <div className="h-10 w-10 rounded bg-slate-200 flex items-center justify-center shrink-0">
            <Music2 className="h-4 w-4 text-slate-400" strokeWidth={2} />
          </div>
        )}
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold text-slate-800 truncate">{song.title || 'Unknown'}</div>
          {song.artist && (
            <div className="text-xs text-slate-500 truncate">{song.artist}</div>
          )}
        </div>
        <ProviderMark provider={song.provider} />
      </div>

      {actionSlot && (
        <div className="px-4 py-2.5 border-t border-slate-100 bg-white">{actionSlot}</div>
      )}
    </Tag>
  )
}

function statusLabel(song) {
  if (song.status === 'saved') {
    return song.savedAt ? `kept ${timeAgo(song.savedAt)} ❤` : 'kept ❤'
  }
  if (song.heardAt) {
    return `heard ${timeAgo(song.heardAt)}`
  }
  return `sent ${timeAgo(song.createdAt)} · waiting`
}
