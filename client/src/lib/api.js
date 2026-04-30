import { store } from './store'

const BASE = '/api'

function headers() {
  // Prefer the signed session token; fall back to raw userId for any
  // client storage left over from before signed tokens shipped.
  const token = store.get('authToken') || store.get('userId') || ''
  return { 'Content-Type': 'application/json', 'X-User-ID': token }
}

async function req(method, path, body) {
  const res = await fetch(BASE + path, {
    method,
    headers: headers(),
    body: body ? JSON.stringify(body) : undefined,
  })
  if (!res.ok) throw new Error(await res.text())
  if (res.status === 204) return null
  return res.json()
}

export const api = {
  get: (path) => req('GET', path),
  post: (path, body) => req('POST', path, body),
  put: (path, body) => req('PUT', path, body),
  patch: (path, body) => req('PATCH', path, body),
  del: (path) => req('DELETE', path),
}
