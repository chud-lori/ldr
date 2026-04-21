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
        <p>If your partner loads a new video while you're watching, you'll get a prompt to switch or stay — no surprise interruptions.</p>
        <p>Already watching something? The <strong>+ Queue</strong> button lines up the next video. Either of you can remove entries or tap <strong>Play next ▶</strong> — the queue syncs between you instantly.</p>
        <p>Chat is saved per room (not per video), so your conversation history stays.</p>
      </Section>

      <Section emoji="🗺️" title="Bucket List">
        <p>Add things you want to do together. Tick them off as you complete them.</p>
        <p>The <strong>🎁 Surprise reveal</strong> option hides an item from your partner until a date you choose — great for planning surprise activities.</p>
      </Section>

      <Section emoji="🎯" title="Trivia">
        <p>Create questions <em>about yourself</em> for your partner to answer. They type their guess and see instantly if they're right.</p>
        <p>Each question allows one attempt. If the answer is wrong, the correct answer is revealed — no retries, keep it honest!</p>
        <p>Your own questions show the answer and a score of how many your partner got right.</p>
      </Section>

      <Section emoji="🧩" title="Puzzle">
        <p>Paste an image URL and pick a grid size (3×3 to 5×5). Both of you see the same shuffled puzzle.</p>
        <p>Tap a piece to select it (highlighted in amber), then tap another piece to swap them. Work together to solve it — moves sync in real time.</p>
      </Section>

      <Section emoji="✏️" title="Draw">
        <p>A shared canvas. Pick a color and stroke width, draw with your mouse or finger, and each finished stroke appears on your partner's screen instantly.</p>
        <p>Strokes are saved per room, so you can come back later and keep adding. <strong>Clear canvas</strong> wipes everything for both of you.</p>
      </Section>

      <Section emoji="🕐" title="Timezones & Thinking of you">
        <p>The Dashboard shows each of you with your current local time, detected automatically from your device. It refreshes every minute.</p>
        <p>Tap <strong>💗 Thinking of {'{name}'}</strong> (only enabled when your partner is online) to send a silent ping — their tab shows a toast, a soft pink pulse, and on phones a tiny vibration. It has a short cooldown so it stays meaningful.</p>
      </Section>

      <Section emoji="📅" title="Milestones">
        <p>Count down to the moments that matter — a visit ✈️, anniversary 💝, birthday 🎂, or anything else 📌. Tap <strong>+ Add</strong>, fill in the title and date, pick a kind, and save.</p>
        <p>Upcoming milestones show their countdown on the Dashboard and sort by nearest first. Past milestones automatically move into your timeline.</p>
      </Section>

      <Section emoji="📖" title="Timeline">
        <p>A running memory of your story together, auto-assembled from:</p>
        <p className="pl-4">• Milestones you've passed<br/>• Bucket-list items you've ticked off<br/>• Days you both wrote in the journal</p>
        <p>Grouped by month, newest first. Nothing to configure — as you use the app, the timeline fills itself.</p>
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

      <Section emoji="🗑️" title="Inactive room deletion">
        <p>To keep the database clean, rooms with <strong>no activity for 30 days</strong> are automatically deleted — including all journal entries, chat history, bucket list, trivia, and puzzle data.</p>
        <p>Simply opening the app resets the timer. A warning will appear on the dashboard when your room is within 7 days of deletion.</p>
        <p className="text-xs text-slate-400">Chat is stored per room (not per video) and persists until the room is deleted.</p>
      </Section>

      <div className="text-center space-y-3 pb-4">
        <button onClick={() => nav('/dashboard')} className={`${t.btn} rounded-xl px-6 py-2.5 text-sm font-semibold`}>
          Back to Dashboard
        </button>
        <p className="text-xs text-slate-400">
          Made with 💗 by{' '}
          <a href="https://profile.lori.my.id" target="_blank" rel="noopener noreferrer"
            className="hover:text-slate-600 underline underline-offset-2 transition-colors">
            Lori
          </a>
        </p>
      </div>
    </div>
  )
}
