// Browser native notifications for nudges + invites when the tab is hidden.
// Separate from the in-page toast so partners get a signal even when the
// app isn't focused.
//
// Permission UX: never request on page load. `maybeRequestPermission()` is
// called the *first* time the user sends a nudge, with a short grace delay
// so it doesn't collide with the click handler. Decline is remembered in
// localStorage so we don't ask repeatedly.

const DECLINED_KEY = 'notifyPermissionDeclined'

function supported() {
  return typeof window !== 'undefined' && 'Notification' in window
}

export function maybeRequestPermission() {
  if (!supported()) return
  if (Notification.permission !== 'default') return
  if (localStorage.getItem(DECLINED_KEY) === '1') return
  // Small delay so this doesn't interrupt the same tick as a click handler
  setTimeout(() => {
    Notification.requestPermission().then((res) => {
      if (res === 'denied') localStorage.setItem(DECLINED_KEY, '1')
    }).catch(() => {})
  }, 400)
}

// Fire a notification iff the tab is hidden AND permission is granted.
// Otherwise we already showed the in-page toast; double-notifying is noisy.
export function notify(title, body, { tag } = {}) {
  if (!supported()) return
  if (Notification.permission !== 'granted') return
  if (document.visibilityState === 'visible') return
  try {
    new Notification(title, { body, tag, silent: false })
  } catch {}
}
