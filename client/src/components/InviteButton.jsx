import { useState } from 'react'
import { useTheme } from '../hooks/useTheme'
import { Share2, Check } from '../lib/icons'
import { FEATURE_META } from '../lib/invite'

// Small button that sits inside a feature page and sends a
// `invite:send` WS event to the partner. 6-second cooldown so it can't
// be mashed. Shows a "Sent" state briefly after firing.
//
// If partner isn't in the `online` list, the button stays enabled but
// the tooltip hints that partner is offline — server will drop the broadcast.
export default function InviteButton({ ws, online = [], feature, selfId }) {
  const { t } = useTheme()
  const [sent, setSent] = useState(false)
  const [cooling, setCooling] = useState(false)
  const meta = FEATURE_META[feature]
  if (!meta) return null

  const partnerOnline = online.some((u) => u.userId !== selfId)

  function send() {
    if (cooling || !ws?.connected) return
    ws.send('invite:send', { feature })
    setSent(true)
    setCooling(true)
    setTimeout(() => setSent(false), 2000)
    setTimeout(() => setCooling(false), 6000)
  }

  return (
    <button
      onClick={send}
      disabled={cooling || !ws?.connected}
      data-testid="invite-partner"
      title={partnerOnline ? `Invite partner to ${meta.label.toLowerCase()}` : 'Partner is offline — they won\'t see the invite right now'}
      className={`inline-flex items-center gap-1.5 text-xs font-semibold rounded-lg px-3 py-1.5 transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
        sent ? 'bg-emerald-50 text-emerald-600' : `${t.accentBg} ${t.accent} hover:brightness-95`
      }`}
    >
      {sent ? <><Check className="h-3.5 w-3.5" strokeWidth={2.5} /> Sent</>
            : <><Share2 className="h-3.5 w-3.5" strokeWidth={2} /> Invite</>}
    </button>
  )
}
