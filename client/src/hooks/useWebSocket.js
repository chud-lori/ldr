import { useEffect, useRef, useCallback, useState, useMemo } from 'react'
import { store } from '../lib/store'

export function useWebSocket(roomCode) {
  const wsRef = useRef(null)
  const listenersRef = useRef({})
  const reconnectTimer = useRef(null)
  const [connected, setConnected] = useState(false)

  const connect = useCallback(() => {
    if (!roomCode) return
    const uid = store.get('userId') || ''
    const name = encodeURIComponent(store.get('userName') || 'unknown')
    const protocol = location.protocol === 'https:' ? 'wss' : 'ws'
    // In dev, connect directly to Go server to avoid Vite proxy EPIPE noise.
    // In production, same host/port as the page (nginx proxies /ws/).
    const host = import.meta.env.DEV ? `${location.hostname}:8080` : location.host
    const url = `${protocol}://${host}/ws/${roomCode}?userId=${uid}&name=${name}`

    const ws = new WebSocket(url)
    wsRef.current = ws

    ws.onopen = () => {
      setConnected(true)
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current)
    }

    ws.onclose = () => {
      setConnected(false)
      // Exponential backoff reconnect (bad internet friendly)
      reconnectTimer.current = setTimeout(connect, 3000)
    }

    ws.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data)
        const handlers = listenersRef.current[msg.type] || []
        handlers.forEach((fn) => fn(msg))
        const allHandlers = listenersRef.current['*'] || []
        allHandlers.forEach((fn) => fn(msg))
      } catch {}
    }
  }, [roomCode])

  useEffect(() => {
    connect()
    return () => {
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current)
      wsRef.current?.close()
    }
  }, [connect])

  const send = useCallback((type, payload) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type, payload }))
    }
  }, [])

  const on = useCallback((type, fn) => {
    if (!listenersRef.current[type]) listenersRef.current[type] = []
    listenersRef.current[type].push(fn)
    return () => {
      listenersRef.current[type] = listenersRef.current[type].filter((f) => f !== fn)
    }
  }, [])

  // Memoize so the object reference only changes when connection status changes.
  // Without this, every parent re-render creates a new object → useEffect([ws])
  // in child components fires constantly, breaking listener registration.
  return useMemo(() => ({ send, on, connected }), [send, on, connected])
}
