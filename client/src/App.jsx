import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useState, useEffect } from 'react'
import { store } from './lib/store'
import { useWebSocket } from './hooks/useWebSocket'
import { ThemeProvider, useTheme } from './hooks/useTheme'
import { ToastProvider, useToast } from './components/Toast'
import Layout from './components/Layout'
import Home from './pages/Home'
import Dashboard from './pages/Dashboard'
import Journal from './pages/Journal'
import WatchParty from './pages/WatchParty'
import BucketList from './pages/BucketList'
import Trivia from './pages/Trivia'
import Puzzle from './pages/Puzzle'
import Guide from './pages/Guide'

function RequireRoom({ children }) {
  const code = store.get('roomCode')
  const uid = store.get('userId')
  if (!code || !uid) return <Navigate to="/" replace />
  return children
}

function AppRoutes() {
  const code = store.get('roomCode')
  const ws = useWebSocket(code)
  const [online, setOnline] = useState([])
  const { setTheme } = useTheme()
  const toast = useToast()
  const uid = store.get('userId')

  useEffect(() => {
    if (!ws) return
    const off = ws.on('presence:list', (msg) => {
      const next = msg.payload || []
      setOnline((prev) => {
        // Notify when partner comes online (wasn't in prev list)
        const prevIds = new Set(prev.map((u) => u.userId))
        next.forEach((u) => {
          if (u.userId !== uid && !prevIds.has(u.userId)) {
            toast(`${u.name} is now online 💗`, 'success')
          }
        })
        return next
      })
    })
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
                <Route path="/journal" element={<Journal />} />
                <Route path="/watch" element={<WatchParty ws={ws} />} />
                <Route path="/bucket" element={<BucketList />} />
                <Route path="/trivia" element={<Trivia ws={ws} />} />
                <Route path="/puzzle" element={<Puzzle ws={ws} />} />
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
