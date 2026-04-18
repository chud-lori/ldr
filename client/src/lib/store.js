// Simple localStorage-backed store for session data
export const store = {
  get: (key) => {
    try { return JSON.parse(localStorage.getItem(key)) } catch { return null }
  },
  set: (key, val) => localStorage.setItem(key, JSON.stringify(val)),
  clear: () => {
    localStorage.removeItem('userId')
    localStorage.removeItem('userName')
    localStorage.removeItem('roomCode')
    localStorage.removeItem('roomData')
    localStorage.removeItem('theme')
    localStorage.removeItem('seenWelcome')
  },
}
