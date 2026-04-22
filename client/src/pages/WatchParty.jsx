import { useEffect, useRef, useState, useCallback } from 'react'
import { api } from '../lib/api'
import { store } from '../lib/store'
import { useTheme } from '../hooks/useTheme'
import {
  Tv, ListMusic, MessageCircle, X, SkipForward, ArrowUp, AlertTriangle,
} from '../lib/icons'

function extractVideoId(input) {
  if (!input) return null
  if (/^[a-zA-Z0-9_-]{11}$/.test(input.trim())) return input.trim()
  try {
    const url = new URL(input)
    return url.searchParams.get('v') || url.pathname.split('/').pop() || null
  } catch {
    return null
  }
}

export default function WatchParty({ ws }) {
  const { t } = useTheme()
  const code = store.get('roomCode')
  const uid = store.get('userId')
  const name = store.get('userName')

  const playerRef = useRef(null)
  const playerInstanceRef = useRef(null)
  const isSyncingRef = useRef(false)
  const wsRef = useRef(ws)
  useEffect(() => { wsRef.current = ws }, [ws])

  const [videoUrl, setVideoUrl] = useState('')
  const [currentVideoId, setCurrentVideoId] = useState(null)
  const [pendingVideoId, setPendingVideoId] = useState(null)
  const [queue, setQueue] = useState([])
  const [messages, setMessages] = useState([])
  const [chatInput, setChatInput] = useState('')
  const chatBottomRef = useRef(null)

  const refreshWatchParty = useCallback(async () => {
    try {
      const data = await api.get(`/rooms/${code}/watchparty`)
      if (data?.videoId) setCurrentVideoId(data.videoId)
      setQueue(Array.isArray(data?.queue) ? data.queue : [])
    } catch {}
  }, [code])

  useEffect(() => {
    refreshWatchParty()
    api.get(`/rooms/${code}/chat`).then((data) => {
      if (Array.isArray(data)) setMessages(data)
    }).catch(() => {})
  }, [code, refreshWatchParty])

  useEffect(() => {
    if (!currentVideoId) return
    const load = () => {
      if (playerInstanceRef.current) {
        playerInstanceRef.current.loadVideoById(currentVideoId)
        return
      }
      playerInstanceRef.current = new window.YT.Player(playerRef.current, {
        videoId: currentVideoId,
        playerVars: { playsinline: 1, rel: 0, modestbranding: 1 },
        events: {
          onReady: () => {
            wsRef.current?.send('watch:request-sync', {})
          },
          onStateChange: (e) => {
            if (isSyncingRef.current) return
            const player = playerInstanceRef.current
            if (e.data === window.YT.PlayerState.PLAYING) {
              wsRef.current?.send('watch:play', { time: player.getCurrentTime() })
            } else if (e.data === window.YT.PlayerState.PAUSED) {
              wsRef.current?.send('watch:pause', { time: player.getCurrentTime() })
            }
          },
        },
      })
    }
    if (window.YT?.Player) {
      load()
    } else {
      window.onYouTubeIframeAPIReady = load
      if (!document.getElementById('yt-api')) {
        const tag = document.createElement('script')
        tag.id = 'yt-api'
        tag.src = 'https://www.youtube.com/iframe_api'
        document.head.appendChild(tag)
      }
    }
  }, [currentVideoId])

  useEffect(() => {
    if (!ws) return
    const offs = [
      ws.on('watch:play', (msg) => {
        isSyncingRef.current = true
        const p = playerInstanceRef.current
        if (p) { p.seekTo(msg.payload.time, true); p.playVideo() }
        setTimeout(() => { isSyncingRef.current = false }, 500)
      }),
      ws.on('watch:pause', (msg) => {
        isSyncingRef.current = true
        const p = playerInstanceRef.current
        if (p) { p.seekTo(msg.payload.time, true); p.pauseVideo() }
        setTimeout(() => { isSyncingRef.current = false }, 500)
      }),
      ws.on('watch:video', (msg) => {
        // Don't auto-switch — let the user decide if already watching something
        if (currentVideoId && currentVideoId !== msg.payload.videoId) {
          setPendingVideoId(msg.payload.videoId)
        } else {
          setCurrentVideoId(msg.payload.videoId)
        }
      }),
      ws.on('watch:request-sync', () => {
        const p = playerInstanceRef.current
        if (!p?.getCurrentTime) return
        const playing = p.getPlayerState() === window.YT?.PlayerState?.PLAYING
        ws.send('watch:sync', { time: p.getCurrentTime(), playing })
      }),
      ws.on('watch:sync', (msg) => {
        isSyncingRef.current = true
        const p = playerInstanceRef.current
        if (p) {
          p.seekTo(msg.payload.time, true)
          if (msg.payload.playing) p.playVideo()
          else p.pauseVideo()
        }
        setTimeout(() => { isSyncingRef.current = false }, 500)
      }),
      ws.on('chat:send', (msg) => setMessages((prev) => [...prev, {
        userId: msg.userId, name: msg.name,
        text: msg.payload.text, createdAt: Date.now(),
      }])),
      ws.on('queue:changed', () => refreshWatchParty()),
    ]
    return () => offs.forEach((off) => off())
  }, [ws, refreshWatchParty])

  useEffect(() => {
    chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  function playNow() {
    const vid = extractVideoId(videoUrl)
    if (!vid) return
    setCurrentVideoId(vid)
    api.put(`/rooms/${code}/watchparty`, { videoId: vid, title: '' })
    ws?.send('watch:video', { videoId: vid })
    setVideoUrl('')
  }

  async function addToQueue() {
    const vid = extractVideoId(videoUrl)
    if (!vid) return
    try {
      const wp = await api.post(`/rooms/${code}/watchparty/queue`, { videoId: vid, title: '' })
      setQueue(wp?.queue || [])
      ws?.send('queue:changed', {})
      setVideoUrl('')
    } catch {}
  }

  async function removeFromQueue(index) {
    try {
      const wp = await api.del(`/rooms/${code}/watchparty/queue/${index}`)
      setQueue(wp?.queue || [])
      ws?.send('queue:changed', {})
    } catch {}
  }

  async function playNext() {
    try {
      const wp = await api.post(`/rooms/${code}/watchparty/next`, {})
      if (wp?.videoId) {
        setCurrentVideoId(wp.videoId)
        ws?.send('watch:video', { videoId: wp.videoId })
      }
      setQueue(wp?.queue || [])
      ws?.send('queue:changed', {})
    } catch {}
  }

  function sendChat(e) {
    e.preventDefault()
    if (!chatInput.trim()) return
    ws?.send('chat:send', { text: chatInput.trim() })
    setMessages((prev) => [...prev, { userId: uid, name, text: chatInput.trim(), createdAt: Date.now() }])
    setChatInput('')
  }

  return (
    <div className="space-y-3">
      <div className="bg-white rounded-2xl p-3 shadow-sm border border-slate-100 space-y-2">
        <div className="flex gap-2">
          <input
            className="flex-1 border border-slate-200 rounded-xl px-3 py-2 text-sm text-slate-700 placeholder-slate-400 focus:outline-none focus:border-slate-400"
            placeholder="Paste YouTube URL or video ID"
            value={videoUrl}
            onChange={(e) => setVideoUrl(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && (currentVideoId ? addToQueue() : playNow())}
            data-testid="video-url-input"
          />
          {currentVideoId ? (
            <button onClick={addToQueue} data-testid="queue-add" className={`${t.btn} px-4 rounded-xl text-sm font-medium`}>
              + Queue
            </button>
          ) : (
            <button onClick={playNow} data-testid="play-now" className={`${t.btn} px-4 rounded-xl text-sm font-medium`}>
              Play
            </button>
          )}
        </div>
      </div>

      {queue.length > 0 && (
        <div className="bg-white rounded-2xl p-3 shadow-sm border border-slate-100" data-testid="queue-panel">
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide inline-flex items-center gap-1.5">
              <ListMusic className="h-3.5 w-3.5" strokeWidth={2} aria-hidden="true" />
              Up next · {queue.length}
            </p>
            <button onClick={playNext} data-testid="queue-next" className={`text-xs font-semibold ${t.accent} hover:underline inline-flex items-center gap-1`}>
              Play next
              <SkipForward className="h-3.5 w-3.5" strokeWidth={2} aria-hidden="true" />
            </button>
          </div>
          <ul className="space-y-1">
            {queue.map((item, i) => (
              <li key={i} className="flex items-center gap-2 text-sm text-slate-600 rounded-lg px-2 py-1.5 hover:bg-slate-50 group">
                <span className="text-[10px] text-slate-400 tabular-nums w-4">{i + 1}</span>
                <span className="flex-1 truncate font-mono text-xs">{item.videoId}</span>
                <button
                  onClick={() => removeFromQueue(i)}
                  data-testid={`queue-remove-${i}`}
                  className="text-slate-300 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity p-0.5"
                  title="Remove"
                  aria-label="Remove from queue"
                >
                  <X className="h-3.5 w-3.5" strokeWidth={2} />
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {pendingVideoId && (
        <div className="flex items-center gap-3 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
          <AlertTriangle className="h-5 w-5 shrink-0 text-amber-600" strokeWidth={2} aria-hidden="true" />
          <p className="flex-1 text-sm text-amber-800 font-medium">Partner wants to change the video</p>
          <button
            onClick={() => { setCurrentVideoId(pendingVideoId); setPendingVideoId(null) }}
            className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-amber-500 text-white hover:bg-amber-600"
          >Switch</button>
          <button
            onClick={() => setPendingVideoId(null)}
            className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-white border border-amber-200 text-amber-700 hover:bg-amber-50"
          >Stay</button>
        </div>
      )}

      {currentVideoId ? (
        <div className="bg-black rounded-2xl overflow-hidden aspect-video shadow-sm">
          <div ref={playerRef} className="w-full h-full" />
        </div>
      ) : (
        <div className="bg-white rounded-2xl border-2 border-dashed border-slate-200 aspect-video flex items-center justify-center">
          <div className="text-center">
            <div className={`mx-auto mb-2 h-12 w-12 rounded-xl ${t.accentBg} ${t.accent} flex items-center justify-center`}>
              <Tv className="h-6 w-6" strokeWidth={2} aria-hidden="true" />
            </div>
            <p className="text-slate-500 font-medium text-sm">Paste a YouTube link to start watching</p>
            <p className="text-slate-400 text-xs mt-1">Both of you will stay in sync</p>
          </div>
        </div>
      )}

      {/* Chat */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 flex flex-col h-64">
        <div className="px-4 py-2.5 border-b border-slate-100 text-sm font-semibold text-slate-600 inline-flex items-center gap-2">
          <MessageCircle className="h-4 w-4 text-slate-500" strokeWidth={2} aria-hidden="true" />
          Chat
        </div>
        <div className="flex-1 overflow-y-auto p-3 space-y-2">
          {messages.length === 0 && (
            <p className="text-center text-slate-400 text-sm py-4">No messages yet. Say hi!</p>
          )}
          {messages.map((m, i) => (
            <div key={i} className={`flex ${m.userId === uid ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-xs px-3 py-1.5 rounded-2xl text-sm leading-relaxed ${
                m.userId === uid ? t.myBubble : 'bg-slate-100 text-slate-700'
              }`}>
                {m.userId !== uid && <div className="text-xs opacity-60 mb-0.5 font-medium">{m.name}</div>}
                {m.text}
              </div>
            </div>
          ))}
          <div ref={chatBottomRef} />
        </div>
        <form onSubmit={sendChat} className="p-3 border-t border-slate-100 flex gap-2">
          <input
            className="flex-1 border border-slate-200 rounded-xl px-3 py-1.5 text-sm text-slate-700 placeholder-slate-400 focus:outline-none focus:border-slate-400"
            placeholder="Say something…"
            value={chatInput}
            onChange={(e) => setChatInput(e.target.value)}
          />
          <button type="submit" className={`${t.btn} px-3 rounded-xl`} aria-label="Send message">
            <ArrowUp className="h-4 w-4" strokeWidth={2.5} />
          </button>
        </form>
      </div>
    </div>
  )
}
