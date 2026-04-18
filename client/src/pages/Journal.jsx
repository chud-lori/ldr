import { useEffect, useState } from 'react'
import { api } from '../lib/api'
import { store } from '../lib/store'
import { useTheme } from '../hooks/useTheme'
import { getDailyPrompt } from '../lib/prompts'

const MOODS = ['😊', '😔', '😍', '😴', '🥰', '😤', '😢', '🤩', '😌', '🥺']

function EntryCard({ entry, mine, t }) {
  if (!entry) {
    return (
      <div className="flex-1 border-2 border-dashed border-slate-200 rounded-xl p-4 flex items-center justify-center min-h-32">
        <p className="text-slate-400 text-sm text-center leading-relaxed">
          {mine ? "You haven't written today yet" : '⏳ Waiting for their entry…'}
        </p>
      </div>
    )
  }
  return (
    <div className={`flex-1 rounded-xl p-4 min-h-32 ${mine ? t.myEntry : 'bg-slate-50'}`}>
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-semibold text-slate-600">{entry.name}</span>
        <span className="text-xl">{entry.mood}</span>
      </div>
      <p className="text-sm text-slate-700 whitespace-pre-wrap leading-relaxed">{entry.content}</p>
    </div>
  )
}

export default function Journal() {
  const { t } = useTheme()
  const code = store.get('roomCode')
  const uid = store.get('userId')
  const name = store.get('userName')
  const today = new Date().toISOString().split('T')[0]

  const [date, setDate] = useState(today)
  const [mood, setMood] = useState('😊')
  const [content, setContent] = useState('')
  const [myEntry, setMyEntry] = useState(null)
  const [partnerEntry, setPartnerEntry] = useState(null)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [allDates, setAllDates] = useState([])

  async function load(d) {
    const data = await api.get(`/rooms/${code}/journal?date=${d}`)
    setMyEntry(data.myEntry)
    setPartnerEntry(data.partnerEntry)
    if (data.myEntry) {
      setContent(data.myEntry.content)
      setMood(data.myEntry.mood || '😊')
    } else {
      setContent('')
      setMood('😊')
    }
  }

  async function loadAll() {
    const data = await api.get(`/rooms/${code}/journal/all`)
    setAllDates(data || [])
  }

  useEffect(() => { load(date); loadAll() }, [date])

  async function save() {
    if (!content.trim()) return
    setSaving(true)
    await api.post(`/rooms/${code}/journal`, { name, date, content, mood })
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
    await Promise.all([load(date), loadAll()])
    setSaving(false)
  }

  const isToday = date === today

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-2xl p-4 shadow-sm border border-slate-100">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-bold text-slate-800">📓 Journal</h2>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)}
            className="text-sm border border-slate-200 rounded-lg px-2 py-1 focus:outline-none focus:border-slate-400 text-slate-600" />
        </div>

        {isToday && (
          <div className="mb-4 space-y-3">
            <button
              onClick={() => setContent((c) => c ? c : getDailyPrompt())}
              className={`w-full text-left text-xs px-3 py-2.5 rounded-xl border border-dashed ${t.codeBg} ${t.accent} leading-relaxed`}
              title="Tap to use this prompt"
            >
              💭 <span className="font-medium">Today's prompt:</span> {getDailyPrompt()}
            </button>
            <div className="flex gap-2 flex-wrap">
              {MOODS.map((m) => (
                <button key={m} onClick={() => setMood(m)}
                  className={`text-xl p-1.5 rounded-lg transition-all ${mood === m ? `${t.accentBg} scale-110` : 'hover:bg-slate-50'}`}>
                  {m}
                </button>
              ))}
            </div>
            <textarea value={content} onChange={(e) => setContent(e.target.value)}
              placeholder="How are you feeling today? Write anything…"
              rows={4}
              className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm text-slate-700 placeholder-slate-400 focus:outline-none focus:border-slate-400 resize-none leading-relaxed" />
            <button onClick={save} disabled={saving || !content.trim()}
              className={`w-full ${t.btn} rounded-xl py-2.5 text-sm font-semibold disabled:opacity-50`}>
              {saved ? '✓ Saved!' : saving ? 'Saving…' : 'Save Entry'}
            </button>
          </div>
        )}

        <div className="flex flex-col sm:flex-row gap-3">
          <EntryCard entry={myEntry} mine t={t} />
          <EntryCard entry={partnerEntry} mine={false} t={t} />
        </div>

        {!isToday && !myEntry && !partnerEntry && (
          <p className="text-center text-slate-400 text-sm mt-3">No entries for this date</p>
        )}
        {!isToday && myEntry && !partnerEntry && (
          <p className="text-center text-slate-400 text-xs mt-2">Partner didn't write this day</p>
        )}
      </div>

      {allDates.length > 0 && (
        <div className="bg-white rounded-2xl p-4 shadow-sm border border-slate-100">
          <h3 className="font-semibold text-slate-700 mb-3 text-sm">Past Entries</h3>
          <div className="space-y-1">
            {allDates.map((pair) => (
              <button key={pair.date} onClick={() => setDate(pair.date)}
                className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-left text-sm transition-all ${
                  date === pair.date ? `${t.accentBg} ${t.accent} font-medium` : 'hover:bg-slate-50 text-slate-600'
                }`}>
                <span>{pair.date}</span>
                <div className="flex gap-1 items-center">
                  {pair.myEntry && <span>{pair.myEntry.mood}</span>}
                  {pair.partnerEntry && <span>{pair.partnerEntry.mood}</span>}
                  {pair.myEntry && !pair.partnerEntry && (
                    <span className="text-xs text-slate-400">solo</span>
                  )}
                </div>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
