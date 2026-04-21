# LDR Together

A private web app for couples in long-distance relationships.

**Features:** shared journal · YouTube watch party with queue + chat · bucket list with surprise reveal · trivia · collaborative puzzle · shared drawing canvas · per-partner timezone widget · "thinking of you" nudge · milestone countdowns · memory timeline

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
