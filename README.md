# LDR Together

A private web app for couples in long-distance relationships.

**Features:** shared journal (live-synced, with reactions + one-line cheer) · YouTube watch party with shared queue, chat, replace + stop controls · bucket list with surprise reveal · trivia (3 attempts, case-insensitive) · collaborative puzzle · shared drawing canvas with eraser · ephemeral song-letters (Spotify / YouTube) with keep-or-let-go · weekly Film Roll for shared photos + short video · mood check-in · press-and-hold "hold to feel them" · async leave-a-note (ephemeral on read with seen receipt) · per-partner timezone + user-set location · last-seen indicator (with privacy toggle) · "thinking of you" nudge · milestone countdowns · memory timeline · one-tap invite to any feature · browser notifications + tab-title badge for backgrounded tabs

---

## Local Development

**Requirements:** Go 1.21+, Bun, MongoDB

```bash
cp server/.env.example server/.env    # set MONGO_URI if not using localhost
make install                          # client deps + Go modules
make dev                              # runs server + client in ONE terminal
```

Open `http://localhost:5173`, create a room, share the 6-char code with your partner. Ctrl+C stops both processes cleanly. Logs are prefixed `[srv]` and `[web]` so you can tell them apart.

Other targets: `make server`, `make client`, `make build`, `make test`, `make help`.

---

## Deployment

See [deployment.md](./deployment.md) for the full guide — covers server setup, systemd, nginx, SSL, redeploy script, backups, and troubleshooting.

---

## Tech Stack

| Layer | Tech |
|---|---|
| Backend | Go, chi, nhooyr WebSocket, MongoDB |
| Frontend | React, Vite, Tailwind CSS v4 |
| Real-time | Native WebSocket with auto-reconnect |
| Process | systemd |
| Proxy | nginx + Let's Encrypt |
