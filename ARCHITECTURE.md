# Architecture

LDR Together is a private real-time web app for two people in a long-distance relationship. It is a monorepo with a Go API server and a React SPA client.

---

## Repository layout

```
ldr/
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
    │   └── lib/
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

Runs in a background goroutine. Waits 10 minutes after startup, then runs every 24 hours. Deletes all rooms where `lastActiveAt` is older than 30 days, along with all associated documents in `journal`, `bucketlist`, `trivia`, `watchparty`, `chat`, and `puzzle` collections.

---

## Database

One MongoDB database, eight collections:

| Collection | Key fields | Notes |
|---|---|---|
| `rooms` | `code`, `members[]`, `theme`, `lastActiveAt`, `createdAt` | Max 2 members enforced at join time |
| `journal` | `roomId`, `userId`, `date`, `content`, `mood` | Upsert on (roomId, userId, date). Partner entry hidden until both have written |
| `bucketlist` | `roomId`, `userId`, `text`, `done`, `surprise`, `revealAt` | Surprise items hide text from partner until revealAt |
| `trivia` | `roomId`, `userId`, `question`, `answer`, `attempts[]` | One attempt per answerer; answer revealed on wrong |
| `watchparty` | `roomId`, `videoId`, `title` | Only latest video stored; chat is separate |
| `chat` | `roomId`, `userId`, `name`, `text`, `createdAt` | Persists across sessions |
| `puzzle` | `roomId`, `imageUrl`, `gridSize`, `pieces[]`, `completed` | Piece positions persist; moves sync via WS |

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

The personal link (`/?roomCode=X&userId=Y`) re-hydrates all keys from the URL, enabling multi-device use without accounts.

`RequireRoom` (React component) checks that both `roomCode` and `userId` are present in localStorage before rendering any protected route; otherwise redirects to `/`. The Dashboard additionally validates the room still exists on the server on mount — if the API returns an error, it clears localStorage and redirects to `/`.

### WebSocket hook (`useWebSocket`)

`useWebSocket(roomCode)` maintains a single WebSocket connection per app lifetime. It:
- Reconnects automatically after 3 seconds on any close event.
- Exposes a stable `on(type, fn)` → unsubscribe function interface backed by `listenersRef` (not React state) so handlers can be registered without triggering re-renders.
- Returns a memoized `{ send, on, connected }` object — the reference only changes when `connected` changes, preventing unnecessary re-renders in children that depend on `ws`.

`on(type, fn)` registers directly to the ref map. `onmessage` reads from the same ref map. This means listeners registered in a `useEffect` are live immediately without waiting for a re-render cycle.

### State model

Global state is minimal and kept at the `AppRoutes` level:
- `online` — current presence list, updated via `presence:list` WS events.
- Toast notifications — managed by `ToastProvider` (React context).
- Theme — managed by `ThemeProvider` (React context + localStorage).

All feature state (journal entries, bucket list items, etc.) is local to each page component and fetched on mount. Pages re-fetch on relevant WS events where real-time updates are needed.

The `online` toast uses a `useRef` mirror of the online list to detect new arrivals without calling side-effects inside a state updater.

### Routing

```
/                → Home (create / join)
/dashboard       → Dashboard
/journal         → Journal
/watch           → Watch Party
/bucket          → Bucket List
/trivia          → Trivia
/puzzle          → Puzzle
/guide           → Guide
```

All routes except `/` are wrapped in `RequireRoom`.

---

## Real-time event map

| Event type | Direction | Payload | Description |
|---|---|---|---|
| `presence:list` | server → all | `[{userId, name}]` | Sent on WS connect and disconnect |
| `room:theme` | client → others | `{theme}` | Theme change |
| `watch:play` | client → others | `{time}` | Play at timestamp |
| `watch:pause` | client → others | `{time}` | Pause at timestamp |
| `watch:video` | client → others | `{videoId}` | Request to change video |
| `watch:request-sync` | client → others | — | Ask for current playback state |
| `watch:sync` | client → others | `{time, playing}` | Reply with current state |
| `chat:send` | client → others | `{text}` | Chat message (also persisted) |
| `trivia:answer` | client → others | — | Trigger reload of trivia list |
| `puzzle:move` | client → others | `{pieceId, currentX, currentY}` | Piece swap (also persisted) |
| `puzzle:reset` | client → others | — | New puzzle created |
| `ping` | client → server | — | Keepalive; not forwarded |

`watch:video` events are not auto-applied on the receiver if a video is already playing — a banner prompts the user to switch or stay.

---

## Development

```bash
# Terminal 1 — server (uses MONGO_DB=test via server/.env)
cd server && go run .

# Terminal 2 — client (proxies /api and /ws to :8080)
cd client && bun dev
```

Vite proxies `/api` and `/ws` to `localhost:8080` in development. In production, nginx handles routing to the Go binary directly.

Environment variables (all in `server/.env`):

| Variable | Default | Purpose |
|---|---|---|
| `LDRMONGO` / `MONGO_URI` | `mongodb://localhost:27017` | MongoDB connection string |
| `MONGO_DB` | `ldr` | Database name (`test` locally) |
| `PORT` | `8080` | HTTP listen port |
