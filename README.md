# LDR Together

## Start

**Backend (Go)**
```bash
cd server
go run .
# runs on :8080
```

**Frontend (Bun + Vite)**
```bash
cd client
bun dev
# runs on :5173, proxies /api and /ws to :8080
```

## Features
- 📓 **Journal** — daily entries; partner's hidden until both submit
- 🎬 **Watch Party** — YouTube sync + chat
- 🗺️ **Bucket List** — shared list with surprise reveal
- 🎯 **Trivia** — quiz each other
- 🧩 **Puzzle** — real-time collaborative grid puzzle

## Requirements
- MongoDB running locally (`mongodb://localhost:27017`)
- Go 1.21+
- Bun
