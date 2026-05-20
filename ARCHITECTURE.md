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

All `/api/rooms/:code/*` routes run through one of two membership middlewares — `RequireMember` for JSON endpoints, `RequireMemberMedia` for image/video GETs (see [Security model](#security-model)). Both verify the caller is in the room's `members` array before the handler runs, which prevents IDOR between rooms.

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

Runs in a background goroutine. Waits 10 minutes after startup, then runs every 24 hours. Three sweeps:

1. **Inactive rooms** — deletes all rooms where `lastActiveAt` is older than 30 days along with every associated document in `journal`, `bucketlist`, `trivia`, `watchparty`, `chat`, `puzzle`, `milestones`, `drawing`, `songs`, `moods`, `messages`, and `films`. Also `os.RemoveAll`s the room's media directory under `MEDIA_ROOT/rooms/{code}/`. `DeleteRoom` (manual delete) does the same.
2. **Faded songs** — deletes entries in `songs` with `status ∈ {unheard, dismissed}` and `createdAt` older than 7 days. Saved songs are untouched.
3. **Faded film rolls** — deletes rolls where `developAt + 7d` has passed. Removes the on-disk roll directory before the Mongo doc.

### Security model

There are no accounts and no passwords. Authentication is a single signed token per user, issued at room create/join and persisted client-side. The model is deliberately small: a room has ≤2 members, every API call carries the token, every protected handler verifies both the signature and room membership.

**Signed session tokens.** `CreateRoom` and `JoinRoom` return both a raw `userId` (8 chars, opaque, used for in-room equality comparisons in the UI) and an `authToken` of the form `UID.BASE32SIG` where `SIG = HMAC-SHA256(SESSION_SECRET, UID)`. `parseUID` rejects any token that isn't of that exact form with a valid signature — a raw uid alone is not enough. This is what stops "you learned someone's userId from a public room read → you can impersonate them" attacks. Base32 (uppercase, no padding) is chosen over base64 because `Home.jsx` applies `.toUpperCase()` to personal-link query params (some chat clients lowercase displayed URLs); base32's alphabet survives that round-trip.

`SESSION_SECRET` is loaded once from env. If unset, the server generates an ephemeral 32-byte secret at boot and logs a warning — every restart then invalidates every active session. Rotating `SESSION_SECRET` is the global revocation lever.

**Where the token rides.** Two paths, depending on what can carry headers — and they use *different* tokens with different lifetimes:

- `X-User-ID: <authToken>` — long-lived session token, 2-part format `UID.SIG`. Set by the `api` wrapper (`client/src/lib/api.js`) on every fetch. This is the default for all JSON endpoints and never goes in a URL.
- `?t=<mediaToken>` — short-lived (~10 min) token used for any path where the credential must live in the URL: `<img src>` for note attachments, `<img>`/`<video>` for film roll items, and the WS upgrade URL. 3-part format `UID.EXP.SIG` where `SIG = HMAC-SHA256(SESSION_SECRET, "UID|EXP")`. URLs leak into journalctl via chi's request logger and (for HTTP) into cross-origin Referer headers, so anything reusable from a leaked URL must expire on its own. The expiry is embedded in the signed payload — no server-side state.

Media tokens are minted on demand by `POST /api/auth/media-token` — caller proves identity with their session token in `X-User-ID`, server returns `{token, expiresAt}` bound to that uid. The client (`client/src/lib/mediaToken.js`) caches one media token in memory, refreshes ~30s before expiry, and exposes a `useMediaToken()` hook so `<img>`/`<video>` components rebind on rotation.

**Two membership middlewares.** Both verify a token, then count-document on `{code, members.userId}`:

| Middleware | Token source | Token format accepted | Used for |
|---|---|---|---|
| `RequireMember` | `X-User-ID` header (`parseUID`) | 2-part session token only | All `/api/rooms/:code/*` JSON routes |
| `RequireMemberMedia` | `X-User-ID` header (preferred), falls back to `?t=` query (`parseMediaToken`) | Header: 2-part session. Query: 3-part media only — never session. | `/messages/:id/image`, `/films/media/:rollId/:filename` |

The split is intentional: the `?t=` path *only* accepts short-lived 3-part media tokens, never the long-lived 2-part session token. That way a media URL surviving in a log archive or a referer header decays into a useless string within 10 minutes, while the session token (which carries no expiry) never travels through a query string at all.

**WebSocket auth.** The connect URL is `/ws/:code?t=<mediaToken>&name=...&tz=...` — same short-lived 3-part token used for media `?t=`, never the session token. The upgrade URL is logged by chi's request middleware, so it must carry an expiring credential for the same reason media URLs do. WS auth is one-shot: the handler runs `parseMediaToken` then `isMemberOf` before calling `websocket.Accept`, and the upgraded connection isn't re-checked on subsequent frames — so a 10-min token lifetime is plenty, even though sessions stay open for hours. `useWebSocket` calls `ensureMediaToken()` before each connect (and reconnect), so a stale cached token gets refreshed automatically.

**Origin checks.** `ALLOWED_ORIGINS` (comma-separated) gates both CORS and the WS upgrader:

- When set, `corsMiddleware` echoes `Access-Control-Allow-Origin: <origin>` only for matching origins (with `Vary: Origin`), and `websocket.Accept` is called with `OriginPatterns` derived from the host of each allowed origin.
- When unset, CORS is `*` and the WS upgrader uses `InsecureSkipVerify: true`. The startup log prints a `WARNING` so this posture is noisy by design — fine for local dev, a misconfiguration in prod.

**Rate limiting.** In-memory per-IP token bucket via `RateLimit(burst, window)`. Currently applied to the two unauthenticated entry points (`POST /rooms` at 10/min, `POST /rooms/:code/join` at 20/min) to slow room-code guessing and create-spam. The map self-prunes when it exceeds 1024 buckets. `TRUST_PROXY_HEADERS=1` makes `clientIP()` read the left-most `X-Forwarded-For` entry; without it, the limiter falls back to `r.RemoteAddr` — required so that running behind nginx/CF doesn't collapse every visitor to `127.0.0.1`, but only safe to enable when there's actually a proxy stripping inbound XFF.

**Security headers.** Every response carries HSTS (1y, `includeSubDomains`), `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: strict-origin-when-cross-origin`, and a `Permissions-Policy` that denies geolocation/payment/usb and self-allows camera/microphone (needed by the film-roll "Take photo" button).

**Privacy filter.** `applyMemberPrivacy` strips `lastSeenAt` from the *other* member's record on every room read where they've toggled `hideLastSeen=true`. The viewer always sees their own state so they can manage the toggle.

**What's intentionally NOT defended.** This is a private 2-person app, not a multi-tenant service. Out of scope:

- **Brute-force on room codes.** 6-char base32 (excludes `0`, `1`, `I`, `O`) = ~10⁹ combos; the 10/min create + 20/min join rate limits make guessing impractical but not impossible. A determined attacker with many IPs could enumerate. Acceptable risk because (a) finding a target room still requires knowing it exists, and (b) the lobby returns no PII beyond display names + signed lastSeen.
- **Token leakage from logs (mitigated).** Chi's request logger prints full URLs including the `?t=` tokens carried by media GETs and the WS upgrade. Both paths use short-lived (~10 min) media tokens, so a leaked log archive yields no long-term access. The session token in `X-User-ID` never appears in a URL, and request headers aren't logged. A log archive is still semi-sensitive (display names, room codes) — but it's no longer a credential dump.
- **Mongo encryption-at-rest beyond what Atlas provides.** All durable state is in MongoDB; we don't add field-level crypto on top of Atlas's transparent encryption.

---

## Database

One MongoDB database, twelve collections:

| Collection | Key fields | Notes |
|---|---|---|
| `rooms` | `code`, `members[].{userId,name,timezone,location,lastSeenAt,hideLastSeen}`, `theme`, `lastActiveAt`, `createdAt` | Max 2 members. Timezone is upserted from the WS `tz` query param on connect; `location` is user-set display label (falls back to IANA city); `lastSeenAt` touched on WS disconnect + every ping; `hideLastSeen` opt-out hides the timestamp from the partner |
| `journal` | `roomId`, `userId`, `date`, `content`, `mood`, `reactions[]`, `cheers[]` | Upsert on (roomId, userId, date). Partner entry hidden until both have written. After reveal, partner can leave one reaction (5 emoji set) and one ≤120-char cheer note |
| `bucketlist` | `roomId`, `userId`, `text`, `done`, `doneAt`, `surprise`, `revealAt` | Surprise items hide text from partner until revealAt. `doneAt` feeds the timeline |
| `trivia` | `roomId`, `userId`, `question`, `answer`, `attempts[]` | One attempt per answerer; answer revealed on wrong |
| `watchparty` | `roomId`, `videoId`, `title`, `queue[].{videoId,title,addedBy}` | Current video + shared queue. Queue mutates via REST, `queue:changed` WS event tells partner to refetch |
| `chat` | `roomId`, `userId`, `name`, `text`, `createdAt` | Persists across sessions |
| `puzzle` | `roomId`, `imageUrl`, `gridSize`, `pieces[]`, `completed` | Piece positions persist; moves sync via WS |
| `milestones` | `roomId`, `userId`, `title`, `date`, `kind` | `kind` ∈ visit/anniversary/birthday/custom. Dashboard shows upcoming; timeline shows past |
| `drawing` | `roomId`, `strokes[].{userId,color,width,points,at}`, `updatedAt` | One doc per room. Strokes stream via WS, capped at 2000 / stroke (4000 points max) |
| `songs` | `roomId`, `senderId`, `recipientId`, `provider`, `trackId`, `title`, `artist`, `thumb`, `message`, `status`, `heardAt`, `savedAt` | Ephemeral song-letters. `provider` ∈ spotify/youtube, `status` ∈ unheard/saved/dismissed. `recipientId` may be empty for solo-sent songs and gets backfilled by `JoinRoom` when the partner arrives. Unheard + dismissed fade after 7 days; saved persists until room cleanup |
| `moods` | `roomId`, `userId`, `emoji`, `note`, `updatedAt` | Mood check-in. One doc per (room, user) — always-visible "today's vibe" shown on the Dashboard. Upserted on set, broadcast via `mood:set` |
| `messages` | `roomId`, `senderId`, `senderName`, `recipientId`, `text`, `imageFilename?`, `imageMime?`, `createdAt` | Async "leave a note" with optional picture attachment. Image stored under `MEDIA_ROOT/rooms/{code}/messages/`. Hard-deleted on `POST /messages/:id/read` (ephemeral on read), image file scrubbed too. Server broadcasts `message:new` on send and `message:seen` on read |
| `films` | `roomId`, `period` (ISO week), `developAt`, `items[].{id,userId,kind,filename,mimeType,size}` | Weekly shared photo + video roll. One doc per (room, week). Items locked from partner until `developAt` (Monday 00:00 UTC). Files live on disk under `MEDIA_ROOT/rooms/{code}/{rollId}/`. Cleanup sweeps rolls 7 days after develop |

Room codes are 6-character strings from the charset `ABCDEFGHJKLMNPQRSTUVWXYZ23456789` (ambiguous characters I, O, 0, 1 excluded). User IDs are 8-character strings from the same charset.

---

## Client

### Identity and session

There is no login. Identity is stored in `localStorage`:

| Key | Value |
|---|---|
| `roomCode` | 6-char room code |
| `userId` | 8-char opaque ID — used for in-app equality checks (`m.userId === uid`); **not sent to the server as proof of identity** |
| `authToken` | Signed session token `UID.BASE32SIG` — what goes in `X-User-ID` on every request. Media `?t=` tokens are minted from this and held only in memory. |
| `userName` | display name |
| `roomData` | last-fetched room object (cache) |
| `theme` | active theme key |
| `seenWelcome` | `"1"` after dismissing the welcome banner |
| `notifyPermissionDeclined` | `"1"` if the user rejected the OS-notification permission, so we don't ask again |

The two-key split is deliberate: `userId` is plaintext (it appears in messages, members lists, etc. and is fine to compare client-side), `authToken` is the credential the server actually verifies. The header `X-User-ID` and the personal link both carry `authToken` directly. Anything that travels in a URL — media `?t=` and the WS upgrade URL — uses a short-lived media token minted on demand (`useMediaToken()` / `ensureMediaToken()` in `client/src/lib/mediaToken.js`), not `authToken`.

The personal link (`/?roomCode=X&userId=Y`) carries the **signed** authToken in the `userId` URL param (legacy name, kept because changing it would invalidate every existing link). `Home.jsx` splits on the `.` to recover the raw uid for storage, and stores the full token as `authToken`. Multi-device use is account-free this way.

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
/draw            → Shared canvas with eraser
/music           → Song letters (Inbox / Saved / Sent). Spotify + YouTube, ephemeral by default
/film            → Weekly shared Film Roll (photos + short video, locked-until-develop, 7-day fade)
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
| `mood:set` | server → all | `{emoji, note}` | Broadcast from `SetMood` after a mood upsert |
| `touch:press` | client → others | — | Press-and-hold started (live only, no persistence) |
| `touch:release` | client → others | — | Press-and-hold ended |
| `message:new` | server → all | `{id}` | Broadcast from `CreateMessage` after async-note insert; recipient refetches |
| `message:seen` | server → all | `{id, senderId, readAt}` | Broadcast from `ReadMessage` after the row is deleted; sender shows "seen ❤" toast |
| `journal:reacted` | server → all | `{date, ownerId}` | Reaction toggled on the entry owner's behalf |
| `journal:cheered` | server → all | `{date, ownerId}` | Cheer note attached / cleared |
| `room:updated` | server → all | — | Member or room metadata changed (rename, location, theme); recipients refetch the room |
| `GET /rooms/:code/activity` (REST, not WS) | — | `[{kind, count}]` | Powers the "Since you were away" Dashboard card. Counts new content created with `createdAt > caller.lastSeenAt` per category (journal, bucket, trivia, songs in/out, journal reactions). `lastSeenAt` is touched only on WS disconnect (not on ping) so the cutoff = end of previous session for the duration of the current one |
| `watch:stop` | client → others | — | Sender ended the watch session — clears partner's player, queue stays |
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
| `MEDIA_ROOT` | `./media` | Directory for Film Roll uploads. Prod: `/var/lib/ldr/media` |
