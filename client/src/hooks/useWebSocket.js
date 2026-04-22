import { useEffect, useRef, useCallback, useState, useMemo } from 'react'
import { store } from '../lib/store'

export function useWebSocket(roomCode) {
  const wsRef = useRef(null)
  const listenersRef = useRef({})
  const reconnectTimer = useRef(null)
  const pingTimer = useRef(null)
  // Track the "active" WS across StrictMode double-invokes. Only the latest
  // instance's events are allowed to update React state or schedule reconnects.
  // Without this, the abandoned first WebSocket from the StrictMode cleanup
  // fires `onclose` late and clobbers `connected` back to false after the real
  // connection is live.
  const activeRef = useRef(null)
  const [connected, setConnected] = useState(false)

  const connect = useCallback(() => {
    if (!roomCode) return
    const uid = store.get('userId') || ''
    const name = encodeURIComponent(store.get('userName') || 'unknown')
    const tz = encodeURIComponent(Intl.DateTimeFormat().resolvedOptions().timeZone || '')
    const protocol = location.protocol === 'https:' ? 'wss' : 'ws'
    // In dev, connect directly to Go server to avoid Vite proxy EPIPE noise.
    // In production, same host/port as the page (nginx proxies /ws/).
    const host = import.meta.env.DEV ? `${location.hostname}:8080` : location.host
    const url = `${protocol}://${host}/ws/${roomCode}?userId=${uid}&name=${name}&tz=${tz}`

    const ws = new WebSocket(url)
    wsRef.current = ws
    activeRef.current = ws

    ws.onopen = () => {
      if (activeRef.current !== ws) return
      setConnected(true)
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current)
      // Ping every 30s to keep Cloudflare's proxy from closing idle connections
      pingTimer.current = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'ping' }))
      }, 30000)
    }

    ws.onclose = () => {
      if (activeRef.current !== ws) return
      setConnected(false)
      if (pingTimer.current) clearInterval(pingTimer.current)
      reconnectTimer.current = setTimeout(connect, 3000)
    }

    ws.onmessage = (e) => {
      if (activeRef.current !== ws) return
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
      if (pingTimer.current) clearInterval(pingTimer.current)
      const ws = wsRef.current
      if (ws) {
        // Disown this WS: its late-arriving events are now no-ops (see activeRef
        // checks above). Clear handlers before close so onclose doesn't bounce.
        ws.onopen = null
        ws.onclose = null
        ws.onmessage = null
        activeRef.current = null
        ws.close()
      }
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
