import { useEffect, useState } from 'react'
import { api } from '../lib/api'
import { store } from '../lib/store'
import { useTheme } from '../hooks/useTheme'
import {
  CalendarHeart, CheckCircle2, BookOpen, History, Pin,
} from '../lib/icons'

const KIND_META = {
  milestone:      { Icon: CalendarHeart, label: 'Milestone' },
  bucket_done:    { Icon: CheckCircle2,  label: 'Bucket item done' },
  journal_shared: { Icon: BookOpen,      label: 'Wrote together' },
}

function formatDate(iso) {
  const d = new Date(iso)
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
}

export default function Timeline() {
  const { t } = useTheme()
  const code = store.get('roomCode')
  const [entries, setEntries] = useState(null)

  useEffect(() => {
    api.get(`/rooms/${code}/timeline`)
      .then((data) => setEntries(Array.isArray(data) ? data : []))
      .catch(() => setEntries([]))
  }, [code])

  if (entries === null) {
    return <p className="text-center text-slate-400 text-sm py-8">Loading…</p>
  }

  if (entries.length === 0) {
    return (
      <div className="bg-white rounded-2xl p-8 shadow-sm border border-slate-100 text-center">
        <div className={`mx-auto mb-3 h-14 w-14 rounded-2xl ${t.accentBg} ${t.accent} flex items-center justify-center`}>
          <History className="h-7 w-7" strokeWidth={2} aria-hidden="true" />
        </div>
        <h2 className="font-semibold text-slate-700 mb-1">Your story, together</h2>
        <p className="text-sm text-slate-400">
          Pass milestones, tick off bucket-list items, or write journal entries on the
          same day — they'll all show up here.
        </p>
      </div>
    )
  }

  // Group entries by month-year for visual chunking
  const groups = []
  let lastKey = ''
  for (const e of entries) {
    const d = new Date(e.date)
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    if (key !== lastKey) {
      groups.push({
        key,
        label: d.toLocaleDateString(undefined, { year: 'numeric', month: 'long' }),
        items: [],
      })
      lastKey = key
    }
    groups[groups.length - 1].items.push(e)
  }

  return (
    <div className="space-y-5" data-testid="timeline-root">
      {groups.map((g) => (
        <div key={g.key}>
          <h3 className={`text-xs font-semibold ${t.accent} uppercase tracking-wider mb-2`}>
            {g.label}
          </h3>
          <ul className="space-y-2">
            {g.items.map((e, i) => {
              const meta = KIND_META[e.kind] || { Icon: Pin, label: e.kind }
              const Icon = meta.Icon
              return (
                <li
                  key={`${g.key}-${i}`}
                  data-testid={`timeline-entry-${e.kind}`}
                  className="bg-white rounded-2xl p-3 shadow-sm border border-slate-100 flex items-center gap-3"
                >
                  <div className={`h-9 w-9 rounded-lg ${t.accentBg} ${t.accent} flex items-center justify-center shrink-0`}>
                    <Icon className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-slate-700 truncate">
                      {e.title || meta.label}
                    </div>
                    <div className="text-[11px] text-slate-400">{formatDate(e.date)}</div>
                  </div>
                </li>
              )
            })}
          </ul>
        </div>
      ))}
    </div>
  )
}
