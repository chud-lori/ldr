import { BrowserRouter, Routes, Route, Navigate, useNavigate } from 'react-router-dom'
import { useState, useEffect, useRef } from 'react'
import { store } from './lib/store'
import { useWebSocket } from './hooks/useWebSocket'
import { ThemeProvider, useTheme } from './hooks/useTheme'
import { ToastProvider, useToast } from './components/Toast'
import { FEATURE_META } from './lib/invite'
import { notify } from './lib/notify'
import Layout from './components/Layout'
import Home from './pages/Home'
import Dashboard from './pages/Dashboard'
import Journal from './pages/Journal'
import WatchParty from './pages/WatchParty'
import BucketList from './pages/BucketList'
import Trivia from './pages/Trivia'
import Puzzle from './pages/Puzzle'
import Draw from './pages/Draw'
import Timeline from './pages/Timeline'
import Guide from './pages/Guide'

function RequireRoom({ children }) {
  const code = store.get('roomCode')
  const uid = store.get('userId')
  if (!code || !uid) return <Navigate to="/" replace />
  return children
}

const BASE_TITLE = 'LDR Together'

function AppRoutes() {
  const code = store.get('roomCode')
  const ws = useWebSocket(code)
  const [online, setOnline] = useState([])
  const { setTheme } = useTheme()
  const toast = useToast()
  const navigate = useNavigate()
  const uid = store.get('userId')
  const onlineRef = useRef([])
  // Tab-title badge: count of unseen nudges / invites while the tab is hidden
  const unreadRef = useRef(0)
  function bumpBadge() {
    if (document.visibilityState === 'hidden') {
      unreadRef.current += 1
      document.title = `💗 (${unreadRef.current}) ${BASE_TITLE}`
    }
  }
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible') {
        unreadRef.current = 0
        document.title = BASE_TITLE
      }
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [])

  useEffect(() => {
    if (!ws) return
    const off = ws.on('presence:list', (msg) => {
      const next = Array.isArray(msg.payload) ? msg.payload : []
      const prevIds = new Set(onlineRef.current.map((u) => u.userId))
      next.forEach((u) => {
        if (u.userId !== uid && !prevIds.has(u.userId)) {
          toast(`${u.name} is now online 💗`, 'success')
        }
      })
      onlineRef.current = next
      setOnline(next)
    })
    // Pull current presence list now that the listener is registered.
    // The server pushes presence on connect but that fires before this
    // effect runs, so we request it explicitly to avoid the race.
    ws.send('presence:request', {})
    return off
  }, [ws, uid, toast])

  // Sync theme changes from partner in real time
  useEffect(() => {
    if (!ws) return
    const off = ws.on('room:theme', (msg) => {
      if (msg.payload?.theme) {
        setTheme(msg.payload.theme)
        toast('Partner updated the room theme 🎨', 'info')
      }
    })
    return off
  }, [ws, setTheme, toast])

  // "Thinking of you" — partner nudge
  useEffect(() => {
    if (!ws) return
    const off = ws.on('nudge:send', (msg) => {
      if (msg.userId === uid) return
      const emoji = msg.payload?.emoji || '💗'
      const who = msg.name || 'Your person'
      toast(`${who} is thinking of you ${emoji}`, 'success')
      document.body.classList.add('nudge-pulse')
      setTimeout(() => document.body.classList.remove('nudge-pulse'), 1500)
      if ('vibrate' in navigator) navigator.vibrate?.(80)
      bumpBadge()
      notify(`${who} is thinking of you`, emoji, { tag: 'nudge' })
    })
    return off
  }, [ws, uid, toast])

  // Feature invite — partner wants you to join them somewhere
  useEffect(() => {
    if (!ws) return
    const off = ws.on('invite:send', (msg) => {
      if (msg.userId === uid) return
      const feature = msg.payload?.feature
      const meta = FEATURE_META[feature]
      if (!meta) return
      if (location.pathname === meta.to) return // already there — no-op
      const who = msg.name || 'Your person'
      toast(`${who} wants to ${meta.verb}`, 'info', {
        duration: 0,
        action: { label: 'Join', onClick: () => navigate(meta.to) },
      })
      bumpBadge()
      notify(`${who} invites you`, `Come ${meta.verb}`, { tag: `invite-${feature}` })
    })
    return off
  }, [ws, uid, toast, navigate])

  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route
        path="/*"
        element={
          <RequireRoom>
            <Layout ws={ws} online={online}>
              <Routes>
                <Route path="/dashboard" element={<Dashboard ws={ws} online={online} />} />
                <Route path="/journal" element={<Journal ws={ws} online={online} />} />
                <Route path="/watch" element={<WatchParty ws={ws} online={online} />} />
                <Route path="/bucket" element={<BucketList ws={ws} online={online} />} />
                <Route path="/trivia" element={<Trivia ws={ws} online={online} />} />
                <Route path="/puzzle" element={<Puzzle ws={ws} online={online} />} />
                <Route path="/draw" element={<Draw ws={ws} online={online} />} />
                <Route path="/timeline" element={<Timeline />} />
                <Route path="/guide" element={<Guide />} />
                <Route path="*" element={<Navigate to="/dashboard" replace />} />
              </Routes>
            </Layout>
          </RequireRoom>
        }
      />
    </Routes>
  )
}

export default function App() {
  return (
    <ThemeProvider>
      <ToastProvider>
        <BrowserRouter>
          <AppRoutes />
        </BrowserRouter>
      </ToastProvider>
    </ThemeProvider>
  )
}
