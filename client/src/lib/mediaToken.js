import { useEffect, useState } from 'react'
import { api } from './api'

// Short-lived (~10 min) signed token used as the `?t=` query string on
// /films/media and /messages/image GETs. The X-User-ID session token
// must NOT be reused here — media URLs land in journalctl via chi's
// request logger and in cross-origin Referer headers, so anything reusable
// from a leaked URL must expire on its own. See server/handlers/session.go
// signMediaToken / parseMediaToken for the wire format.

let cached = null
let pending = null
const subscribers = new Set()

function isFresh() {
  if (!cached) return false
  return cached.expiresAt > Math.floor(Date.now() / 1000) + 30
}

function notify() {
  const tok = cached?.token || ''
  subscribers.forEach((fn) => fn(tok))
}

async function refresh() {
  if (pending) return pending
  pending = (async () => {
    try {
      const data = await api.post('/auth/media-token', {})
      cached = { token: data.token, expiresAt: data.expiresAt }
      notify()
      return cached.token
    } catch (e) {
      cached = null
      notify()
      throw e
    } finally {
      pending = null
    }
  })()
  return pending
}

export function useMediaToken() {
  const [token, setToken] = useState(isFresh() ? cached.token : '')
  useEffect(() => {
    subscribers.add(setToken)
    if (!isFresh()) refresh().catch(() => {})
    return () => subscribers.delete(setToken)
  }, [])
  useEffect(() => {
    if (!cached) return
    const ms = Math.max(0, (cached.expiresAt - Math.floor(Date.now() / 1000) - 30) * 1000)
    const id = setTimeout(() => { refresh().catch(() => {}) }, ms)
    return () => clearTimeout(id)
  }, [token])
  return token
}

export function mediaUrl(path, token) {
  if (!token) return ''
  const sep = path.includes('?') ? '&' : '?'
  return `${path}${sep}t=${encodeURIComponent(token)}`
}

// ensureMediaToken returns a fresh token, refreshing only if the cache is
// stale or empty. Used by the WS hook before opening the upgrade URL — the
// hook can't render-wait the way <img> components can.
export async function ensureMediaToken() {
  if (isFresh()) return cached.token
  return refresh()
}
