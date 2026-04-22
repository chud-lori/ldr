# Architecture

LDR Together is a private real-time web app for two people in a long-distance relationship. It is a monorepo with a Go API server and a React SPA client.

---

## Repository layout

```
ldr/
├── Makefile         # make dev / server / client / test / build
├── server/          # Go API + WebSocket server
│   ├── main.go
│   ├── cleanup.go
│   ├── db/
│   ├── handlers/
│   ├── models/
│   └── ws/
└── client/          # React SPA
    ├── src/
    │   ├── pages/
    │   ├── components/
    │   ├── hooks/
    │   └── lib/         # icons.jsx, invite.js, notify.js, api.js, store.js, …
    ├── tests/           # Playwright suite
    └── public/
```

---

## Stack

| Layer | Technology |
|---|---|
| API server | Go 1.25, chi v5 |
| WebSocket | nhooyr.io/websocket v1 |
| Database | MongoDB Atlas (mongo-driver v2) |
| Frontend | React 19, React Router 7 |
| Styling | Tailwind CSS v4 (Vite plugin) |
| Bundler | Vite 8, Bun (package manager) |
| Hosting | Tencent Cloud VM + Cloudflare proxy (HTTPS/WSS) |

---

## Server

### Request flow

```
Client → Cloudflare (TLS termination) → nginx → Go server
                                                  ├── /api/*   HTTP handlers
                                                  └── /ws/:code  WebSocket upgrade
```

All `/api/rooms/:code/*` routes run through the `RequireMember` middleware which checks `X-User-ID` against the room's `members` array in MongoDB before every request. This prevents IDOR between rooms.

### Package structure

**`main.go`** — wires the chi router, environment loading (`godotenv`), MongoDB connection, WebSocket hub, and cleanup worker. CORS is handled inline via a simple middleware function.

**`db/`** — thin wrapper around the mongo-driver. `Connect(uri, dbName)` accepts both values from env vars (`LDRMONGO`/`MONGO_URI` and `MONGO_DB`), defaulting to `mongodb://localhost:27017` and database `ldr`. `MONGO_DB=test` in the local `.env` points local runs at a separate test database.

**`models/`** — plain Go structs with `bson` and `json` tags. No ORM.

**`handlers/`** — one file per feature. Each handler is a plain `http.HandlerFunc`. No global state; the hub is injected via closure.

**`ws/`** — the WebSocket hub.

### WebSocket hub

The hub owns a `map[roomID]map[*Client]bool` and runs a single `for/select` loop in its own goroutine. Registration and unregistration go through a request–done channel pattern so callers block until the hub has finished writing to the map. This eliminates races without exposing the internal mutex to callers.

```
Register(client) → sends regRequest{client, done} → hub writes map → closes done → caller unblocks
```

`Broadcast(roomID, data, sender)` excludes the sender. `BroadcastAll` passes a nil sender and reaches everyone in the room.

When a client connects the server:
1. Verifies membership via `isMemberOf` before upgrading to WebSocket.
2. Registers the client (blocking).
3. Broadcasts an updated `presence:list` to the whole room.
4. Touches `lastActiveAt` on the room document (non-blocking goroutine).
5. Starts a writer goroutine that drains `client.Send` into the WS connection.
6. Reads messages in a loop, routes by `msg.type` prefix.
7. On disconnect: unregisters (blocking), broadcasts updated presence list.

A 30-second ping is sent from the client to keep Cloudflare's idle-connection timeout from closing the socket.

### Cleanup worker

Runs in a background goroutine. Waits 10 minutes after startup, then runs every 24 hours. Two sweeps:

1. **Inactive rooms** — deletes all rooms where `lastActiveAt` is older than 30 days along with every associated document in `journal`, `bucketlist`, `trivia`, `watchparty`, `chat`, `puzzle`, `milestones`, `drawing`, and `songs`. `DeleteRoom` (manual delete) uses the same list.
2. **Faded songs** — deletes entries in `songs` with `status ∈ {unheard, dismissed}` and `createdAt` older than 7 days. Saved songs are untouched. Keeps the song-letter Inbox curated without requiring user action.

---

## Database

One MongoDB database, ten collections:

| Collection | Key fields | Notes |
|---|---|---|
| `rooms` | `code`, `members[].{userId,name,timezone}`, `theme`, `lastActiveAt`, `createdAt` | Max 2 members. Member timezone is upserted from the WS `tz` query param on connect |
| `journal` | `roomId`, `userId`, `date`, `content`, `mood` | Upsert on (roomId, userId, date). Partner entry hidden until both have written |
| `bucketlist` | `roomId`, `userId`, `text`, `done`, `doneAt`, `surprise`, `revealAt` | Surprise items hide text from partner until revealAt. `doneAt` feeds the timeline |
| `trivia` | `roomId`, `userId`, `question`, `answer`, `attempts[]` | One attempt per answerer; answer revealed on wrong |
| `watchparty` | `roomId`, `videoId`, `title`, `queue[].{videoId,title,addedBy}` | Current video + shared queue. Queue mutates via REST, `queue:changed` WS event tells partner to refetch |
| `chat` | `roomId`, `userId`, `name`, `text`, `createdAt` | Persists across sessions |
| `puzzle` | `roomId`, `imageUrl`, `gridSize`, `pieces[]`, `completed` | Piece positions persist; moves sync via WS |
| `milestones` | `roomId`, `userId`, `title`, `date`, `kind` | `kind` ∈ visit/anniversary/birthday/custom. Dashboard shows upcoming; timeline shows past |
| `drawing` | `roomId`, `strokes[].{userId,color,width,points,at}`, `updatedAt` | One doc per room. Strokes stream via WS, capped at 2000 / stroke (4000 points max) |
| `songs` | `roomId`, `senderId`, `recipientId`, `provider`, `trackId`, `title`, `artist`, `thumb`, `message`, `status`, `heardAt`, `savedAt` | Ephemeral song-letters. `provider` ∈ spotify/youtube, `status` ∈ unheard/saved/dismissed. `recipientId` may be empty for solo-sent songs and gets backfilled by `JoinRoom` when the partner arrives. Unheard + dismissed fade after 7 days; saved persists until room cleanup |

Room codes are 6-character strings from the charset `ABCDEFGHJKLMNPQRSTUVWXYZ23456789` (ambiguous characters I, O, 0, 1 excluded). User IDs are 8-character strings from the same charset.

---

## Client

### Identity and session

There is no login. Identity is stored in `localStorage`:

| Key | Value |
|---|---|
| `roomCode` | 6-char room code |
| `userId` | 8-char opaque ID |
| `userName` | display name |
| `roomData` | last-fetched room object (cache) |
| `theme` | active theme key |
| `seenWelcome` | `"1"` after dismissing the welcome banner |
| `notifyPermissionDeclined` | `"1"` if the user rejected the OS-notification permission, so we don't ask again |

The personal link (`/?roomCode=X&userId=Y`) re-hydrates all keys from the URL, enabling multi-device use without accounts.

`RequireRoom` (React component) checks that both `roomCode` and `userId` are present in localStorage before rendering any protected route; otherwise redirects to `/`. The Dashboard additionally validates the room still exists on the server on mount — if the API returns an error, it clears localStorage and redirects to `/`.

### WebSocket hook (`useWebSocket`)

`useWebSocket(roomCode)` maintains a single WebSocket connection per app lifetime. It:
- Reconnects automatically after 3 seconds on any close event.
- Exposes a stable `on(type, fn)` → unsubscribe function interface backed by `listenersRef` (not React state) so handlers can be registered without triggering re-renders.
- Returns a memoized `{ send, on, connected }` object — the reference only changes when `connected` changes, preventing unnecessary re-renders in children that depend on `ws`.
- **StrictMode-safe:** tracks the current live WebSocket via an `activeRef` and ignores `onopen`/`onclose`/`onmessage` from any instance that isn't the active one. Without this, the abandoned first WebSocket from StrictMode's double-invoke would fire a late `onclose` and clobber `connected` back to `false` after the real connection was live, which showed up as a grey self-indicator on first join.

`on(type, fn)` registers directly to the ref map. `onmessage` reads from the same ref map. This means listeners registered in a `useEffect` are live immediately without waiting for a re-render cycle.

### State model

Global state is minimal and kept at the `AppRoutes` level:
- `online` — current presence list, updated via `presence:list` WS events.
- Toast notifications — managed by `ToastProvider` (React context). Toasts support an optional `action` (button) and `duration: 0` for sticky invites.
- Theme — managed by `ThemeProvider` (React context + localStorage).
- Tab-title badge — a ref counter incremented on `nudge:send` / `invite:send` while `document.visibilityState === 'hidden'`; title becomes `💗 (n) LDR Together` until the tab is focused again.

All feature state (journal entries, bucket list items, etc.) is local to each page component and fetched on mount. Pages re-fetch on relevant WS events where real-time updates are needed.

The `online` toast uses a `useRef` mirror of the online list to detect new arrivals without calling side-effects inside a state updater.

### Routing

```
/                → Home (create / join). Auto-redirects to /dashboard when
                   localStorage has a valid session (Slack/Discord-style).
/dashboard       → Dashboard (timezones, nudge, milestones, feature grid, stats)
/journal         → Journal (live-sync via journal:saved)
/watch           → Watch Party (shared queue, chat, YouTube sync)
/bucket          → Bucket List
/trivia          → Trivia
/puzzle          → Puzzle
/draw            → Shared canvas
/music           → Song letters (Inbox / Saved / Sent). Spotify + YouTube, ephemeral by default
/timeline        → Auto-assembled memory of milestones / bucket completions / shared journal days
/guide           → Guide
```

All routes except `/` are wrapped in `RequireRoom`. "Leave this device"
inside Room Settings clears localStorage and navigates to `/` without
deleting the room server-side.

---

## Real-time event map

| Event type | Direction | Payload | Description |
|---|---|---|---|
| `presence:list` | server → all | `[{userId, name, timezone}]` | Sent on WS connect and disconnect. `timezone` is IANA zone from the client's `Intl` |
| `presence:request` | client → server | — | Ask the server to resend the current presence list (handles connect races) |
| `room:theme` | client → others | `{theme}` | Theme change |
| `watch:play` | client → others | `{time}` | Play at timestamp |
| `watch:pause` | client → others | `{time}` | Pause at timestamp |
| `watch:video` | client → others | `{videoId}` | Request to change video |
| `watch:request-sync` | client → others | — | Ask for current playback state |
| `watch:sync` | client → others | `{time, playing}` | Reply with current state |
| `queue:changed` | client → others | — | Signal partner to refetch the shared watch-party queue |
| `journal:saved` | client → others | `{date}` | Sender just saved a journal entry; partner refetches `/journal` + streak |
| `invite:send` | client → others | `{feature}` | "Join me at /watch" — shows a sticky toast with Join button on partner's side |
| `song:sent` | client → others | `{id}` | Sender just posted a song; partner gets a sticky "Play" toast and /music refetches |
| `song:heard` | client → others | `{id}` | Receiver played a song through. Sender's toast: "{name} heard your song" |
| `song:saved` | client → others | `{id}` | Receiver kept a song. Sender's toast: "{name} kept your song" |
| `chat:send` | client → others | `{text}` | Chat message (also persisted) |
| `trivia:answer` | client → others | — | Trigger reload of trivia list |
| `puzzle:move` | client → others | `{pieceId, currentX, currentY}` | Piece swap (also persisted) |
| `puzzle:reset` | client → others | — | New puzzle created |
| `nudge:send` | client → others | `{emoji}` | "Thinking of you" — partner gets toast + page pulse + vibration |
| `draw:stroke` | client → others | `{color, width, points}` | Completed stroke, points normalized 0..1 (also persisted) |
| `draw:clear` | client → others | — | Wipe the canvas (also persisted) |
| `ping` | client → server | — | Keepalive; not forwarded |

`watch:video` events are not auto-applied on the receiver if a video is already playing — a banner prompts the user to switch or stay.

---

## Development

```bash
make dev     # server + client in one terminal, Ctrl+C stops both
```

(or `make server` / `make client` for just one side, `make test` for the Playwright suite.)

Vite proxies `/api` and `/ws` to `localhost:8080` in development. In production, nginx handles routing to the Go binary directly.

Environment variables (all in `server/.env`):

| Variable | Default | Purpose |
|---|---|---|
| `LDRMONGO` / `MONGO_URI` | `mongodb://localhost:27017` | MongoDB connection string |
| `MONGO_DB` | `ldr` | Database name (`test` locally) |
| `PORT` | `8080` | HTTP listen port |
