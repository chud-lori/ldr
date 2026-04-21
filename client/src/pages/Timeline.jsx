import { useEffect, useState } from 'react'
import { api } from '../lib/api'
import { store } from '../lib/store'
import { useTheme } from '../hooks/useTheme'

const KIND_META = {
  milestone:      { emoji: '📅', label: 'Milestone' },
  bucket_done:    { emoji: '✅', label: 'Bucket item done' },
  journal_shared: { emoji: '📓', label: 'Wrote together' },
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
        <div className="text-5xl mb-3">📖</div>
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
              const meta = KIND_META[e.kind] || { emoji: '•', label: e.kind }
              return (
                <li
                  key={`${g.key}-${i}`}
                  data-testid={`timeline-entry-${e.kind}`}
                  className="bg-white rounded-2xl p-3 shadow-sm border border-slate-100 flex items-center gap-3"
                >
                  <span className="text-2xl">{meta.emoji}</span>
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
