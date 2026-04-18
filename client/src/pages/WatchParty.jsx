import { useEffect, useRef, useState, useCallback } from 'react'
import { api } from '../lib/api'
import { store } from '../lib/store'
import { useTheme } from '../hooks/useTheme'

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

  const [videoUrl, setVideoUrl] = useState('')
  const [currentVideoId, setCurrentVideoId] = useState(null)
  const [messages, setMessages] = useState([])
  const [chatInput, setChatInput] = useState('')
  const chatBottomRef = useRef(null)

  useEffect(() => {
    api.get(`/rooms/${code}/watchparty`).then((data) => {
      if (data?.videoId) setCurrentVideoId(data.videoId)
    }).catch(() => {})
    api.get(`/rooms/${code}/chat`).then((data) => {
      if (Array.isArray(data)) setMessages(data)
    }).catch(() => {})
  }, [code])

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
          onStateChange: (e) => {
            if (isSyncingRef.current) return
            const player = playerInstanceRef.current
            if (e.data === window.YT.PlayerState.PLAYING) {
              ws?.send('watch:play', { time: player.getCurrentTime() })
            } else if (e.data === window.YT.PlayerState.PAUSED) {
              ws?.send('watch:pause', { time: player.getCurrentTime() })
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
      ws.on('watch:video', (msg) => setCurrentVideoId(msg.payload.videoId)),
      ws.on('chat:send', (msg) => setMessages((prev) => [...prev, {
        userId: msg.userId, name: msg.name,
        text: msg.payload.text, createdAt: Date.now(),
      }])),
    ]
    return () => offs.forEach((off) => off())
  }, [ws])

  useEffect(() => {
    chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  function setVideo() {
    const vid = extractVideoId(videoUrl)
    if (!vid) return
    setCurrentVideoId(vid)
    api.put(`/rooms/${code}/watchparty`, { videoId: vid, title: '' })
    ws?.send('watch:video', { videoId: vid })
    setVideoUrl('')
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
      <div className="bg-white rounded-2xl p-3 shadow-sm border border-slate-100">
        <div className="flex gap-2">
          <input
            className="flex-1 border border-slate-200 rounded-xl px-3 py-2 text-sm text-slate-700 placeholder-slate-400 focus:outline-none focus:border-slate-400"
            placeholder="Paste YouTube URL or video ID"
            value={videoUrl}
            onChange={(e) => setVideoUrl(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && setVideo()}
          />
          <button onClick={setVideo} className={`${t.btn} px-4 rounded-xl text-sm font-medium`}>
            Load
          </button>
        </div>
      </div>

      {currentVideoId ? (
        <div className="bg-black rounded-2xl overflow-hidden aspect-video shadow-sm">
          <div ref={playerRef} className="w-full h-full" />
        </div>
      ) : (
        <div className="bg-white rounded-2xl border-2 border-dashed border-slate-200 aspect-video flex items-center justify-center">
          <div className="text-center">
            <div className="text-4xl mb-2">🎬</div>
            <p className="text-slate-500 font-medium text-sm">Paste a YouTube link to start watching</p>
            <p className="text-slate-400 text-xs mt-1">Both of you will stay in sync</p>
          </div>
        </div>
      )}

      {/* Chat */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 flex flex-col h-64">
        <div className="px-4 py-2.5 border-b border-slate-100 text-sm font-semibold text-slate-600">💬 Chat</div>
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
          <button type="submit" className={`${t.btn} px-3 rounded-xl text-sm`}>↑</button>
        </form>
      </div>
    </div>
  )
}
