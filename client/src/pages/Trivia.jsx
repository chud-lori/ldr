import { useEffect, useState } from 'react'
import { api } from '../lib/api'
import { store } from '../lib/store'
import { useTheme } from '../hooks/useTheme'

function QuestionCard({ q, uid, onAnswer, onDelete, t }) {
  const [answer, setAnswer] = useState('')
  const [result, setResult] = useState(null)
  const [submitting, setSubmitting] = useState(false)

  const myAttempt = q.attempts?.find((a) => a.userId === uid)
  const isMine = q.userId === uid

  async function submit(e) {
    e.preventDefault()
    if (!answer.trim()) return
    setSubmitting(true)
    try {
      const res = await api.post(`/rooms/${store.get('roomCode')}/trivia/${q.id}/answer`, {
        name: store.get('userName'),
        answer,
      })
      setResult(res)
      onAnswer?.()
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="bg-white rounded-xl border border-slate-100 p-4 shadow-sm">
      <div className="flex items-start justify-between gap-2 mb-2">
        <div>
          <span className={`text-xs font-medium ${t.accent}`}>{q.name}</span>
          <p className="text-sm font-medium text-slate-700 mt-0.5 leading-relaxed">{q.question}</p>
        </div>
        {isMine && (
          <button onClick={() => onDelete(q.id)} className="text-slate-300 hover:text-red-400 text-lg leading-none flex-shrink-0">×</button>
        )}
      </div>

      {isMine && (
        <div className="mt-2 bg-slate-50 rounded-lg px-3 py-2">
          <span className="text-xs text-slate-500">Answer: </span>
          <span className="text-xs font-semibold text-slate-700">{q.answer}</span>
          {q.attempts?.length > 0 && (
            <span className="ml-3 text-xs text-emerald-600 font-medium">
              {q.attempts.filter((a) => a.correct).length}/{q.attempts.length} correct
            </span>
          )}
        </div>
      )}

      {!isMine && !(myAttempt?.correct || result?.correct) && !result && (
        <form onSubmit={submit} className="flex gap-2 mt-3">
          <input
            className="flex-1 border border-slate-200 rounded-lg px-3 py-1.5 text-sm text-slate-700 placeholder-slate-400 focus:outline-none focus:border-slate-400"
            placeholder="Your answer…"
            value={answer}
            onChange={(e) => setAnswer(e.target.value)}
          />
          <button type="submit" disabled={submitting}
            className={`${t.btn} px-3 rounded-lg text-sm disabled:opacity-50`}>
            ↑
          </button>
        </form>
      )}

      {(myAttempt || result) && !isMine && (
        <div className={`mt-3 text-sm rounded-xl px-3 py-2.5 font-medium ${
          (myAttempt?.correct || result?.correct)
            ? 'bg-emerald-50 text-emerald-700'
            : 'bg-red-50 text-red-700'
        }`}>
          {(myAttempt?.correct || result?.correct)
            ? '✓ Correct! Well done 🎉'
            : <>✗ Not quite · Correct answer: <span className="font-bold">"{result?.correctAnswer || myAttempt?.correctAnswer}"</span></>
          }
        </div>
      )}
    </div>
  )
}

export default function Trivia({ ws }) {
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
        <h2 className="font-bold text-slate-800 mb-1">🎯 Ask About Yourself</h2>
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
          <div className="text-5xl mb-3">🎯</div>
          <p className="text-slate-500 font-medium">No questions yet</p>
          <p className="text-slate-400 text-sm mt-1">Ask something about yourself above!</p>
        </div>
      )}
    </div>
  )
}
