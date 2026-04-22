import { useEffect, useState } from 'react'
import { api } from '../lib/api'
import { store } from '../lib/store'
import { useTheme } from '../hooks/useTheme'
import { HelpCircle, X } from '../lib/icons'
import InviteButton from '../components/InviteButton'

const MAX_ATTEMPTS = 3

function QuestionCard({ q, uid, onAnswer, onDelete, t }) {
  const [answer, setAnswer] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [shakeKey, setShakeKey] = useState(0)

  const isMine = q.userId === uid
  const myAttempts = (q.attempts || []).filter((a) => a.userId === uid)
  const correctAttempt = myAttempts.find((a) => a.correct)
  const attemptsUsed = myAttempts.length
  const exhausted = attemptsUsed >= MAX_ATTEMPTS
  const revealed = !!correctAttempt || exhausted
  const revealedAnswer = correctAttempt
    ? null
    : myAttempts.find((a) => a.correctAnswer)?.correctAnswer

  async function submit(e) {
    e.preventDefault()
    if (!answer.trim() || submitting) return
    setSubmitting(true)
    try {
      await api.post(`/rooms/${store.get('roomCode')}/trivia/${q.id}/answer`, {
        name: store.get('userName'),
        answer,
      })
      setAnswer('')
      setShakeKey((k) => k + 1) // flash "not quite" on wrong
      onAnswer?.()
    } finally {
      setSubmitting(false)
    }
  }

  // Creator summary: "✓ Got it in N" / "Stumped after N" / "N in progress"
  const creatorSummary = (() => {
    if (!q.attempts?.length) return null
    const correct = q.attempts.find((a) => a.correct)
    if (correct) {
      const tries = q.attempts.filter((a) => a.userId === correct.userId).length
      return <span className="ml-3 text-xs text-emerald-600 font-medium">✓ Got it in {tries}</span>
    }
    if (q.attempts.length >= MAX_ATTEMPTS) {
      return <span className="ml-3 text-xs text-slate-500 font-medium">✗ Stumped</span>
    }
    return <span className="ml-3 text-xs text-amber-600 font-medium">{q.attempts.length}/{MAX_ATTEMPTS} tried</span>
  })()

  return (
    <div className="bg-white rounded-xl border border-slate-100 p-4 shadow-sm">
      <div className="flex items-start justify-between gap-2 mb-2">
        <div>
          <span className={`text-xs font-medium ${t.accent}`}>{q.name}</span>
          <p className="text-sm font-medium text-slate-700 mt-0.5 leading-relaxed">{q.question}</p>
        </div>
        {isMine && (
          <button onClick={() => onDelete(q.id)} className="text-slate-300 hover:text-red-400 flex-shrink-0 p-1 -m-1" aria-label="Delete question">
            <X className="h-4 w-4" strokeWidth={2} />
          </button>
        )}
      </div>

      {isMine && (
        <div className="mt-2 bg-slate-50 rounded-lg px-3 py-2">
          <span className="text-xs text-slate-500">Answer: </span>
          <span className="text-xs font-semibold text-slate-700">{q.answer}</span>
          {creatorSummary}
        </div>
      )}

      {!isMine && !revealed && (
        <form onSubmit={submit} className="mt-3 space-y-2">
          {attemptsUsed > 0 && (
            <div key={shakeKey} className="text-xs text-amber-600 font-medium">
              Not quite · {MAX_ATTEMPTS - attemptsUsed} {MAX_ATTEMPTS - attemptsUsed === 1 ? 'try' : 'tries'} left
            </div>
          )}
          <div className="flex gap-2">
            <input
              className="flex-1 border border-slate-200 rounded-lg px-3 py-1.5 text-sm text-slate-700 placeholder-slate-400 focus:outline-none focus:border-slate-400"
              placeholder={`Your answer… (attempt ${attemptsUsed + 1}/${MAX_ATTEMPTS})`}
              value={answer}
              onChange={(e) => setAnswer(e.target.value)}
              autoFocus={attemptsUsed > 0}
            />
            <button type="submit" disabled={submitting || !answer.trim()}
              className={`${t.btn} px-3 rounded-lg text-sm disabled:opacity-50`}>
              ↑
            </button>
          </div>
        </form>
      )}

      {!isMine && revealed && (
        <div className={`mt-3 text-sm rounded-xl px-3 py-2.5 font-medium ${
          correctAttempt ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'
        }`}>
          {correctAttempt
            ? <>✓ Correct! Got it in {attemptsUsed} {attemptsUsed === 1 ? 'try' : 'tries'} 🎉</>
            : <>✗ Out of attempts · Correct answer: <span className="font-bold">"{revealedAnswer}"</span></>
          }
        </div>
      )}
    </div>
  )
}

export default function Trivia({ ws, online }) {
  const { t } = useTheme()
  const code = store.get('roomCode')
  const uid = store.get('userId')
  const name = store.get('userName')

  const [questions, setQuestions] = useState([])
  const [question, setQuestion] = useState('')
  const [answer, setAnswer] = useState('')
  const [adding, setAdding] = useState(false)

  async function load() {
    const data = await api.get(`/rooms/${code}/trivia`)
    setQuestions(Array.isArray(data) ? data : [])
  }

  useEffect(() => { load() }, [])

  useEffect(() => {
    if (!ws) return
    const off = ws.on('trivia:answer', () => load())
    return off
  }, [ws])

  async function addQuestion(e) {
    e.preventDefault()
    if (!question.trim() || !answer.trim()) return
    setAdding(true)
    await api.post(`/rooms/${code}/trivia`, { name, question, answer })
    setQuestion('')
    setAnswer('')
    await load()
    setAdding(false)
  }

  async function deleteQuestion(id) {
    await api.del(`/rooms/${code}/trivia/${id}`)
    load()
  }

  const myQuestions = questions.filter((q) => q.userId === uid)
  const partnerQuestions = questions.filter((q) => q.userId !== uid)
  const myScore = partnerQuestions.filter((q) =>
    q.attempts?.find((a) => a.userId === uid && a.correct)
  ).length

  return (
    <div className="space-y-4">
      {partnerQuestions.length > 0 && (
        <div className="bg-white rounded-2xl p-4 shadow-sm border border-slate-100 text-center">
          <div className={`text-4xl font-bold ${t.accent}`}>{myScore}/{partnerQuestions.length}</div>
          <div className="text-sm text-slate-500 mt-1">answered correctly</div>
        </div>
      )}

      <div className="bg-white rounded-2xl p-4 shadow-sm border border-slate-100">
        <div className="flex items-center justify-between mb-1">
          <h2 className="font-bold text-slate-800 inline-flex items-center gap-2">
            <HelpCircle className="h-5 w-5 text-slate-500" strokeWidth={2} aria-hidden="true" />
            Ask About Yourself
          </h2>
          <InviteButton ws={ws} online={online} feature="trivia" selfId={uid} />
        </div>
        <p className="text-xs text-slate-400 mb-3">Create questions for your partner to answer</p>
        <form onSubmit={addQuestion} className="space-y-2">
          <input
            className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm text-slate-700 placeholder-slate-400 focus:outline-none focus:border-slate-400"
            placeholder="e.g. What's my favourite movie?"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
          />
          <input
            className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm text-slate-700 placeholder-slate-400 focus:outline-none focus:border-slate-400"
            placeholder="Correct answer"
            value={answer}
            onChange={(e) => setAnswer(e.target.value)}
          />
          <button type="submit" disabled={adding || !question.trim() || !answer.trim()}
            className={`w-full ${t.btn} rounded-xl py-2.5 text-sm font-semibold disabled:opacity-50`}>
            Add Question
          </button>
        </form>
      </div>

      {partnerQuestions.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-slate-600 px-1">Answer Their Questions</h3>
          {partnerQuestions.map((q) => (
            <QuestionCard key={q.id} q={q} uid={uid} onAnswer={load} onDelete={deleteQuestion} t={t} />
          ))}
        </div>
      )}

      {myQuestions.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-slate-600 px-1">Your Questions</h3>
          {myQuestions.map((q) => (
            <QuestionCard key={q.id} q={q} uid={uid} onAnswer={load} onDelete={deleteQuestion} t={t} />
          ))}
        </div>
      )}

      {questions.length === 0 && (
        <div className="text-center py-12 bg-white rounded-2xl border border-slate-100 shadow-sm">
          <div className={`mx-auto mb-3 h-14 w-14 rounded-2xl ${t.accentBg} ${t.accent} flex items-center justify-center`}>
            <HelpCircle className="h-7 w-7" strokeWidth={2} aria-hidden="true" />
          </div>
          <p className="text-slate-500 font-medium">No questions yet</p>
          <p className="text-slate-400 text-sm mt-1">Ask something about yourself above!</p>
        </div>
      )}
    </div>
  )
}
