import { useNavigate } from 'react-router-dom'
import { useTheme } from '../hooks/useTheme'
import { store } from '../lib/store'

function Section({ emoji, title, children }) {
  return (
    <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-100 space-y-2">
      <h2 className="font-bold text-slate-800 flex items-center gap-2">
        <span className="text-xl">{emoji}</span> {title}
      </h2>
      <div className="text-sm text-slate-600 leading-relaxed space-y-2">{children}</div>
    </div>
  )
}

function Step({ n, children }) {
  return (
    <div className="flex gap-3 items-start">
      <span className="shrink-0 w-6 h-6 rounded-full bg-rose-100 text-rose-600 text-xs font-bold flex items-center justify-center mt-0.5">{n}</span>
      <p>{children}</p>
    </div>
  )
}

export default function Guide() {
  const { t } = useTheme()
  const nav = useNavigate()
  const uid = store.get('userId')
  const code = store.get('roomCode')
  const personalLink = uid && code ? `${location.origin}/?roomCode=${code}&userId=${uid}` : null

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <button onClick={() => nav(-1)} className="text-slate-400 hover:text-slate-600 text-lg leading-none">←</button>
        <h1 className="font-bold text-slate-800 text-lg">How to use LDR Together</h1>
      </div>

      {/* Personal link — most important, shown first */}
      <div className={`rounded-2xl p-5 border-2 border-dashed ${t.codeBg}`}>
        <div className="flex items-start gap-3">
          <span className="text-2xl">🔗</span>
          <div className="flex-1 min-w-0">
            <h2 className={`font-bold ${t.accent} mb-1`}>Save your personal link</h2>
            <p className="text-sm text-slate-600 mb-3 leading-relaxed">
              Your account lives in your browser. If you clear your cache or switch devices,
              you'll need your <strong>personal link</strong> to get back in — it contains
              your room code and your unique ID together.
            </p>
            {personalLink ? (
              <div className="space-y-2">
                <div className="bg-white rounded-xl px-3 py-2 text-xs font-mono text-slate-500 break-all border border-slate-200">
                  {personalLink}
                </div>
                <button
                  onClick={() => navigator.clipboard.writeText(personalLink)}
                  className={`w-full ${t.btn} rounded-xl py-2.5 text-sm font-semibold`}
                >
                  Copy & save this link
                </button>
                <p className="text-xs text-slate-400 text-center">
                  Bookmark it, save it in Notes, or send it to yourself — don't share it with your partner, it's yours only.
                </p>
              </div>
            ) : (
              <p className="text-sm text-slate-400 italic">Create or join a room first to see your personal link.</p>
            )}
          </div>
        </div>
      </div>

      <Section emoji="🏠" title="Rooms">
        <Step n="1">One person <strong>creates a room</strong> and gets a 6-character room code.</Step>
        <Step n="2">Share that code with your partner. They tap <strong>Join Room</strong> and enter it.</Step>
        <Step n="3">Rooms hold exactly 2 people. A third person can't join a full room.</Step>
        <p className="text-xs text-slate-400 pt-1">Room data — journal entries, bucket list, trivia, everything — is stored permanently. You can close the app and come back anytime.</p>
      </Section>

      <Section emoji="📓" title="Journal">
        <p>Write a daily entry with a mood. Your partner's entry stays hidden until <strong>both of you have written</strong> for that day — so you don't influence each other.</p>
        <p>Use the date picker to browse past entries.</p>
      </Section>

      <Section emoji="🎬" title="Watch Party">
        <p>Paste any YouTube URL or video ID. Both screens stay in sync — play, pause, and seek are broadcast in real time.</p>
        <p>When one person joins late, their player automatically catches up to where the other person is.</p>
        <p>Chat is saved per room (not per video), so your conversation history stays.</p>
      </Section>

      <Section emoji="🗺️" title="Bucket List">
        <p>Add things you want to do together. Tick them off as you complete them.</p>
        <p>The <strong>🎁 Surprise reveal</strong> option hides an item from your partner until a date you choose — great for planning surprise activities.</p>
      </Section>

      <Section emoji="🎯" title="Trivia">
        <p>Create questions <em>about yourself</em> for your partner to answer. They type their guess and see instantly if they're right.</p>
        <p>Wrong answers can be retried. The correct answer is only revealed after a wrong attempt.</p>
        <p>Your own questions show the answer and a score of how many your partner got right.</p>
      </Section>

      <Section emoji="🧩" title="Puzzle">
        <p>Paste an image URL and pick a grid size (3×3 to 5×5). Both of you see the same shuffled puzzle.</p>
        <p>Tap a piece to select it (highlighted in amber), then tap another piece to swap them. Work together to solve it — moves sync in real time.</p>
      </Section>

      <Section emoji="🎨" title="Theme">
        <p>Tap the <strong>⚙️ settings icon</strong> on the dashboard to change the room theme. There are 5 colour themes — the change applies to both of you instantly.</p>
        <p>You can also rename the room and update your own display name from the header.</p>
      </Section>

      <Section emoji="📱" title="Using on multiple devices">
        <p>Your session is tied to your browser's local storage. To use the app on a different phone or laptop:</p>
        <Step n="1">Go to Dashboard and tap <strong>"Copy my personal link"</strong> under the room code.</Step>
        <Step n="2">Open that link on your new device — it will sign you in automatically.</Step>
        <Step n="3">Bookmark the link on the new device so you can always get back in.</Step>
        <p className="text-xs text-slate-400 pt-1">The personal link is unique to you. Don't share it with your partner — they have their own.</p>
      </Section>

      <div className="text-center pb-4">
        <button onClick={() => nav('/dashboard')} className={`${t.btn} rounded-xl px-6 py-2.5 text-sm font-semibold`}>
          Back to Dashboard
        </button>
      </div>
    </div>
  )
}
