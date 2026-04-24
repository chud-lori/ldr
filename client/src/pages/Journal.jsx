import { useEffect, useState } from 'react'
import { api } from '../lib/api'
import { store } from '../lib/store'
import { useTheme } from '../hooks/useTheme'
import { getDailyPrompt } from '../lib/prompts'
import { BookOpen } from '../lib/icons'
import InviteButton from '../components/InviteButton'

const MOODS = ['😊', '😔', '😍', '😴', '🥰', '😤', '😢', '🤩', '😌', '🥺']
const REACTIONS = ['❤️', '🤗', '💪', '😢', '🔥']

function EntryCard({ entry, mine, uid, partnerName, onReact, onCheer, t }) {
  const [cheerDraft, setCheerDraft] = useState('')
  const [editingCheer, setEditingCheer] = useState(false)

  if (!entry) {
    return (
      <div className="flex-1 border-2 border-dashed border-slate-200 rounded-xl p-4 flex items-center justify-center min-h-32">
        <p className="text-slate-400 text-sm text-center leading-relaxed">
          {mine ? "You haven't written today yet" : '⏳ Waiting for their entry…'}
        </p>
      </div>
    )
  }

  const reactions = entry.reactions || []
  const cheers = entry.cheers || []
  // In a 2-person room: any reaction/cheer on a card came from the OTHER
  // person. On my own card it's the partner's response; on the partner's
  // card it's mine (which I can edit).
  const myReaction = !mine ? reactions.find((r) => r.userId === uid)?.emoji : null
  const myCheer = !mine ? cheers.find((c) => c.userId === uid)?.text : null
  const partnerReaction = mine ? reactions[0]?.emoji : null
  const partnerCheer = mine ? cheers[0]?.text : null

  function startEditCheer() {
    setCheerDraft(myCheer || '')
    setEditingCheer(true)
  }

  async function submitCheer() {
    setEditingCheer(false)
    await onCheer?.(entry.userId, cheerDraft.trim())
  }

  return (
    <div className={`flex-1 rounded-xl p-4 min-h-32 ${mine ? t.myEntry : 'bg-slate-50'} space-y-2`}>
      <div className="flex items-center justify-between mb-1">
        <span className="text-sm font-semibold text-slate-600">{entry.name}</span>
        <span className="text-xl">{entry.mood}</span>
      </div>
      <p className="text-sm text-slate-700 whitespace-pre-wrap leading-relaxed">{entry.content}</p>

      {mine && (partnerReaction || partnerCheer) && (
        <div className="pt-2 mt-2 border-t border-white/50 space-y-1">
          {partnerReaction && (
            <div className="text-xs text-slate-600">
              <span className="text-base mr-1">{partnerReaction}</span>
              <span className="text-slate-500">— {partnerName || 'them'}</span>
            </div>
          )}
          {partnerCheer && (
            <p className="text-xs text-slate-600 italic leading-relaxed">"{partnerCheer}"</p>
          )}
        </div>
      )}

      {!mine && (
        <div className="pt-2 mt-2 border-t border-slate-200 space-y-2">
          <div className="flex gap-1">
            {REACTIONS.map((e) => (
              <button
                key={e}
                onClick={() => onReact?.(entry.userId, e === myReaction ? '' : e)}
                data-testid={`react-${e}`}
                title={e === myReaction ? 'Tap to remove' : 'React'}
                className={`text-lg p-1 rounded-lg transition-transform hover:scale-110 ${
                  e === myReaction ? 'bg-white shadow-sm scale-110' : 'opacity-50 hover:opacity-100'
                }`}
              >
                {e}
              </button>
            ))}
          </div>
          {!editingCheer && myCheer && (
            <button
              onClick={startEditCheer}
              className="text-xs text-slate-500 italic leading-relaxed text-left hover:text-slate-700"
            >
              "{myCheer}" <span className="not-italic opacity-60 ml-1">edit</span>
            </button>
          )}
          {!editingCheer && !myCheer && (
            <button
              onClick={startEditCheer}
              data-testid="open-cheer"
              className="text-xs text-slate-400 hover:text-slate-600"
            >
              + cheer them up
            </button>
          )}
          {editingCheer && (
            <div className="flex gap-1.5">
              <input
                value={cheerDraft}
                onChange={(e) => setCheerDraft(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && submitCheer()}
                onBlur={submitCheer}
                maxLength={120}
                placeholder="One short line…"
                autoFocus
                data-testid="cheer-input"
                className="flex-1 min-w-0 text-xs border border-slate-200 rounded-lg px-2 py-1 focus:outline-none focus:border-slate-400 bg-white"
              />
              <span className="text-[10px] text-slate-400 self-center tabular-nums">{120 - cheerDraft.length}</span>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default function Journal({ ws, online }) {
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

  // Refetch when partner saves an entry. If the broadcast's date matches the
  // one we're viewing, refresh the current view + streak. Otherwise just the
  // streak (keeps the calendar heat-map accurate without flicker).
  useEffect(() => {
    if (!ws) return
    const refresh = (msg) => {
      const d = msg?.payload?.date
      if (d === date) load(date)
    }
    const offs = [
      ws.on('journal:saved', (msg) => {
        if (msg.userId === uid) return
        const savedDate = msg.payload?.date
        if (savedDate === date) load(date)
        loadAll()
      }),
      // Reaction / cheer events fire for both directions — refresh either
      // way so my own pick reflects in case of optimistic-state drift.
      ws.on('journal:reacted', refresh),
      ws.on('journal:cheered', refresh),
    ]
    return () => offs.forEach((o) => o())
  }, [ws, uid, date])

  async function react(ownerUserId, emoji) {
    await api.post(`/rooms/${code}/journal/${date}/${ownerUserId}/react`, { emoji })
    load(date)
  }

  async function cheer(ownerUserId, text) {
    await api.post(`/rooms/${code}/journal/${date}/${ownerUserId}/cheer`, { text })
    load(date)
  }

  async function save() {
    if (!content.trim()) return
    setSaving(true)
    await api.post(`/rooms/${code}/journal`, { name, date, content, mood })
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
    await Promise.all([load(date), loadAll()])
    // `journal:saved` is now emitted server-side from SaveJournal, so the
    // partner is notified reliably regardless of this client's WS state.
    setSaving(false)
  }

  const isToday = date === today

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-2xl p-4 shadow-sm border border-slate-100">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <h2 className="font-bold text-slate-800 inline-flex items-center gap-2">
              <BookOpen className="h-5 w-5 text-slate-500" strokeWidth={2} aria-hidden="true" />
              Journal
            </h2>
            <InviteButton ws={ws} online={online} feature="journal" selfId={uid} />
          </div>
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
          <EntryCard
            entry={myEntry}
            mine
            uid={uid}
            partnerName={partnerEntry?.name}
            t={t}
          />
          <EntryCard
            entry={partnerEntry}
            mine={false}
            uid={uid}
            partnerName={partnerEntry?.name}
            onReact={react}
            onCheer={cheer}
            t={t}
          />
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
