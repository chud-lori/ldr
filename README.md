# LDR Together

A private web app for couples in long-distance relationships.

**Features:** shared journal · YouTube watch party with chat · bucket list with surprise reveal · trivia · real-time collaborative puzzle

---

## Local Development

**Requirements:** Go 1.21+, Bun, MongoDB

```bash
# Terminal 1 — backend
cd server
cp .env.example .env    # set MONGO_URI if not using localhost
go run .                # :8080

# Terminal 2 — frontend
cd client
bun install
bun dev                 # :5173, proxies /api and /ws to :8080
```

Open `http://localhost:5173`, create a room, share the 6-char code with your partner.

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
