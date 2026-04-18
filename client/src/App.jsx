import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { store } from './lib/store'
import { useWebSocket } from './hooks/useWebSocket'
import { ThemeProvider } from './hooks/useTheme'
import Layout from './components/Layout'
import Home from './pages/Home'
import Dashboard from './pages/Dashboard'
import Journal from './pages/Journal'
import WatchParty from './pages/WatchParty'
import BucketList from './pages/BucketList'
import Trivia from './pages/Trivia'
import Puzzle from './pages/Puzzle'

function RequireRoom({ children }) {
  const code = store.get('roomCode')
  const uid = store.get('userId')
  if (!code || !uid) return <Navigate to="/" replace />
  return children
}

function AppRoutes() {
  const code = store.get('roomCode')
  const ws = useWebSocket(code)

  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route
        path="/*"
        element={
          <RequireRoom>
            <Layout ws={ws}>
              <Routes>
                <Route path="/dashboard" element={<Dashboard ws={ws} />} />
                <Route path="/journal" element={<Journal />} />
                <Route path="/watch" element={<WatchParty ws={ws} />} />
                <Route path="/bucket" element={<BucketList />} />
                <Route path="/trivia" element={<Trivia ws={ws} />} />
                <Route path="/puzzle" element={<Puzzle ws={ws} />} />
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
      <BrowserRouter>
        <AppRoutes />
      </BrowserRouter>
    </ThemeProvider>
  )
}
