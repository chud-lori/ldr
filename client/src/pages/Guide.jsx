import { useNavigate } from 'react-router-dom'
import { useTheme } from '../hooks/useTheme'
import { store } from '../lib/store'
import {
  Home, BookOpen, Tv, ListChecks, HelpCircle, PuzzleIcon, Pencil,
  History, CalendarHeart, Clock, Heart, Settings, Trash2, Smartphone,
  LogOut, Link2, ListMusic, ArrowLeft, Share2, Music2, Camera, Mail,
} from '../lib/icons'

function Section({ Icon, title, children }) {
  return (
    <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-100 space-y-2">
      <h2 className="font-bold text-slate-800 flex items-center gap-2">
        <Icon className="h-5 w-5 text-slate-500" strokeWidth={2} aria-hidden="true" />
        {title}
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
        <button onClick={() => nav(-1)} className="text-slate-400 hover:text-slate-600 p-1 -m-1" aria-label="Back">
          <ArrowLeft className="h-5 w-5" strokeWidth={2} />
        </button>
        <h1 className="font-bold text-slate-800 text-lg">How to use LDR Together</h1>
      </div>

      {/* Personal link — most important, shown first */}
      <div className={`rounded-2xl p-5 border-2 border-dashed ${t.codeBg}`}>
        <div className="flex items-start gap-3">
          <Link2 className={`h-6 w-6 mt-0.5 ${t.accent}`} strokeWidth={2} aria-hidden="true" />
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

      <Section Icon={Home} title="Rooms">
        <Step n="1">One person <strong>creates a room</strong> and gets a 6-character room code.</Step>
        <Step n="2">Share that code with your partner. They tap <strong>Join Room</strong> and enter it.</Step>
        <Step n="3">Rooms hold exactly 2 people. A third person can't join a full room.</Step>
        <p className="text-xs text-slate-400 pt-1">Room data — journal entries, bucket list, trivia, everything — is stored permanently. You can close the app and come back anytime.</p>
      </Section>

      <Section Icon={BookOpen} title="Journal">
        <p>Write a daily entry with a mood. Your partner's entry stays hidden until <strong>both of you have written</strong> for that day — so you don't influence each other.</p>
        <p>After reveal, you can leave a single emoji reaction (❤️ 🤗 💪 😢 🔥) and an optional one-line cheer (≤120 chars) on your partner's entry. It shows up under their card so they see your response when they re-open the day.</p>
        <p>Use the date picker to browse past entries.</p>
      </Section>

      <Section Icon={Tv} title="Watch Party">
        <p>Paste any YouTube URL or video ID. Both screens stay in sync — play, pause, and seek are broadcast in real time.</p>
        <p>When one person joins late, their player automatically catches up to where the other person is.</p>
        <p>While something's playing, the input has two buttons: <strong>Replace</strong> (clears the current video and plays the new one — your partner gets a switch banner) and <strong>+ Queue</strong> (lines it up for later). On desktop: Enter = Replace, Shift+Enter = Queue.</p>
        <p>The little <strong>✕</strong> in the top-right of the player ends the watch session entirely; queue is preserved so you can come back to it.</p>
        <p>Chat is saved per room (not per video), so your conversation history stays.</p>
      </Section>

      <Section Icon={ListChecks} title="Bucket List">
        <p>Add things you want to do together. Tick them off as you complete them.</p>
        <p>The <strong>Surprise reveal</strong> option hides an item from your partner until a date you choose — great for planning surprise activities.</p>
      </Section>

      <Section Icon={HelpCircle} title="Trivia">
        <p>Create questions <em>about yourself</em> for your partner to answer. They type their guess and see instantly if they're right.</p>
        <p>Each question allows <strong>3 attempts</strong> before the answer is revealed. Answers are case-insensitive and forgive trailing punctuation, so "The Matrix" and "the matrix." both match.</p>
        <p>Your own questions show a tiny summary: "Got it in N tries" or "Stumped" when your partner runs out of guesses.</p>
      </Section>

      <Section Icon={PuzzleIcon} title="Puzzle">
        <p>Paste an image URL and pick a grid size (3×3 to 5×5). Both of you see the same shuffled puzzle.</p>
        <p>Tap a piece to select it (highlighted in amber), then tap another piece to swap them. Work together to solve it — moves sync in real time.</p>
      </Section>

      <Section Icon={Pencil} title="Draw">
        <p>A shared canvas. Pick a color and stroke width, draw with your mouse or finger, and each finished stroke appears on your partner's screen instantly.</p>
        <p>Strokes are saved per room, so you can come back later and keep adding. <strong>Clear canvas</strong> wipes everything for both of you.</p>
      </Section>

      <Section Icon={Camera} title="Film Roll">
        <p>A weekly shared photo (and short video) album. Each week opens a new roll — both of you upload throughout the week, but neither sees the other's photos until <strong>Monday 00:00 UTC</strong>, when the roll "develops" and reveals everything together.</p>
        <p>Photos auto-resize on your device before upload (so a 5 MB phone photo becomes ~500 KB). Videos must be ≤ 30 seconds and 50 MB.</p>
        <p>After develop, the photos stay visible for <strong>7 days</strong>, then fade automatically. Tap the download icon on any item to save it to your device before that.</p>
      </Section>

      <Section Icon={Mail} title="Notes (leave-a-message)">
        <p>An async "post-it for when you come back." Tap <strong>Leave them a note</strong> on the Dashboard, write up to 300 characters, and hit Send. They see it the next time they open the app.</p>
        <p>When they tap <strong>Mark read</strong>, the note disappears from both sides and you get a small "they read your note ❤" toast — closure, not a thread.</p>
        <p>Different from Watch Party chat: that's for live commentary while watching together; this is for things you want them to read in their own time.</p>
      </Section>

      <Section Icon={Music2} title="Song Letters">
        <p>Send a Spotify or YouTube track with a handwritten note. Paste the link, write a line or two, and tap send — your partner gets a notification with a Play button. You can even send before they've joined the room — their Inbox picks up waiting songs the moment they arrive.</p>
        <p>When they open the card the song plays automatically. They can only <strong>play and pause</strong> — no skipping, no seeking. Once a song has played through, a prompt asks them to <strong>keep it</strong> or <strong>let it go</strong>.</p>
        <p>Kept songs live in their <strong>Saved</strong> tab forever; let-go songs disappear from their inbox (but a 30-second undo toast shows up in case of accidental tap). Unheard songs fade after <strong>7 days</strong> so the Inbox stays curated. Your <strong>Sent</strong> tab shows a tiny status so you know when they heard or kept it.</p>
      </Section>

      <Section Icon={HelpCircle} title="Mood Check-in">
        <p>On the Dashboard, tap your own mood cell to pick an emoji ("how's your day going"). Your partner sees it instantly; they tap theirs independently.</p>
        <p>It's always visible — no reveal mechanic — so either of you can see the other's vibe at a glance without having to ask.</p>
      </Section>

      <Section Icon={HelpCircle} title="Hold to feel them">
        <p>Below the mood cells is a big heart button. Press and hold it; if your partner is online and holds theirs at the same moment, both circles pulse together — an ambient "we're here" signal without a single word typed.</p>
        <p>Release any time. Nothing is stored — it's a live feeling, not a log.</p>
      </Section>

      <Section Icon={Clock} title="Timezones &amp; Thinking of you">
        <p>The Dashboard shows each of you with your current local time, detected automatically from your device. It refreshes every minute.</p>
        <p>Tap the <strong>Thinking of {'{name}'}</strong> button (only enabled when your partner is online) to send a silent ping — their tab shows a toast, a soft pink pulse, and on phones a tiny vibration. It has a short cooldown so it stays meaningful.</p>
        <p>If the tab isn't focused, you'll see the unread count in the browser tab title (e.g. "💗 (1) LDR Together"). The first time you send a nudge we'll ask for notification permission so you can also get an OS-level alert when the tab is in the background.</p>
      </Section>

      <Section Icon={Share2} title="Invite partner to a feature">
        <p>Every feature page (Watch, Draw, Puzzle, Trivia, Journal, Bucket List) has a small <strong>Invite</strong> button up top. Tap it and your partner gets a toast saying "{'{name}'} wants to watch something" with a <strong>Join</strong> button that takes them straight there.</p>
        <p>The toast stays visible until they act on it — no auto-dismiss, because an invite you missed is useless.</p>
      </Section>

      <Section Icon={CalendarHeart} title="Milestones">
        <p>Count down to the moments that matter — a visit, anniversary, birthday, or anything else. Tap <strong>+ Add</strong>, fill in the title and date, pick a kind, and save.</p>
        <p>Upcoming milestones show their countdown on the Dashboard and sort by nearest first. Past milestones automatically move into your timeline.</p>
      </Section>

      <Section Icon={History} title="Timeline">
        <p>A running memory of your story together, auto-assembled from:</p>
        <p className="pl-4">• Milestones you've passed<br/>• Bucket-list items you've ticked off<br/>• Days you both wrote in the journal</p>
        <p>Grouped by month, newest first. Nothing to configure — as you use the app, the timeline fills itself.</p>
      </Section>

      <Section Icon={Settings} title="Theme">
        <p>Tap the <strong>settings icon</strong> on the dashboard to change the room theme. There are 5 colour themes — the change applies to both of you instantly.</p>
        <p>You can also rename the room and update your own display name from the header.</p>
      </Section>

      <Section Icon={Smartphone} title="Using on multiple devices">
        <p>Your session is tied to your browser's local storage. To use the app on a different phone or laptop:</p>
        <Step n="1">Go to Dashboard and tap <strong>"Copy my personal link"</strong> under the room code.</Step>
        <Step n="2">Open that link on your new device — it will sign you in automatically.</Step>
        <Step n="3">Bookmark the link on the new device so you can always get back in.</Step>
        <p className="text-xs text-slate-400 pt-1">The personal link is unique to you. Don't share it with your partner — they have their own.</p>
      </Section>

      <Section Icon={LogOut} title="Signing out on this device">
        <p>Once you've joined a room, hitting <strong>/</strong> (the home URL) takes you straight to your dashboard — no need to re-enter the code.</p>
        <p>If you want to sign out on this device (for example to hand a shared laptop back, or to join a different room), open <strong>Room Settings</strong> on the dashboard and tap <strong>"Leave this device"</strong>. Your room stays intact for your partner — you can rejoin anytime with your personal link or the room code.</p>
      </Section>

      <Section Icon={Trash2} title="Inactive room deletion">
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
