# LDR Together

A private web app for couples in long-distance relationships. Features: shared journal, YouTube watch party with chat, bucket list with surprise reveal, trivia, and a real-time collaborative puzzle.

---

## Local Development

**Requirements:** Go 1.21+, Bun, MongoDB (local or Atlas)

```bash
# Terminal 1 — backend
cd server
cp .env.example .env       # edit MONGO_URI if needed
go run .                   # runs on :8080

# Terminal 2 — frontend
cd client
bun install
bun dev                    # runs on :5173
```

Open `http://localhost:5173`, create a room, share the 6-char code with your partner.

---

## Production Deployment (Ubuntu VPS — 2 vCPU / 2GB RAM)

### Overview

```
[Browser] → nginx (443 SSL) → Go binary (:8080)
                                    ↕
                               MongoDB
```

nginx handles SSL and serves the built frontend static files. The Go binary handles the API and WebSocket. MongoDB runs locally with a capped memory footprint.

---

### 1. Install dependencies on the server

```bash
# Go
wget https://go.dev/dl/go1.25.5.linux-amd64.tar.gz
sudo tar -C /usr/local -xzf go1.25.5.linux-amd64.tar.gz
echo 'export PATH=$PATH:/usr/local/go/bin' >> ~/.bashrc
source ~/.bashrc

# nginx
sudo apt update && sudo apt install -y nginx certbot python3-certbot-nginx

# MongoDB 7
curl -fsSL https://www.mongodb.org/static/pgp/server-7.0.asc | sudo gpg -o /usr/share/keyrings/mongodb-server-7.0.gpg --dearmor
echo "deb [ arch=amd64,arm64 signed-by=/usr/share/keyrings/mongodb-server-7.0.gpg ] https://repo.mongodb.org/apt/ubuntu jammy/mongodb-org/7.0 multiverse" | sudo tee /etc/apt/sources.list.d/mongodb-org-7.0.list
sudo apt update && sudo apt install -y mongodb-org
```

### 2. Cap MongoDB memory (important for 2GB RAM)

```bash
sudo nano /etc/mongod.conf
```

Add under `storage:`:
```yaml
storage:
  wiredTiger:
    engineConfig:
      cacheSizeGB: 0.3
```

```bash
sudo systemctl enable mongod
sudo systemctl start mongod
```

---

### 3. Build and upload the app

**On your local machine:**

```bash
# Build Go binary for Linux
cd server
GOOS=linux GOARCH=amd64 go build -o ldr-server .

# Build frontend
cd ../client
bun run build

# Upload to server (replace your-server-ip)
scp server/ldr-server ubuntu@your-server-ip:/opt/ldr/
scp -r client/dist ubuntu@your-server-ip:/opt/ldr/
scp server/.env ubuntu@your-server-ip:/opt/ldr/
```

**On the server:**
```bash
sudo mkdir -p /opt/ldr
sudo chown ubuntu:ubuntu /opt/ldr
chmod +x /opt/ldr/ldr-server
```

---

### 4. Environment file

```bash
nano /opt/ldr/.env
```

```env
MONGO_URI=mongodb://localhost:27017
PORT=8080
```

---

### 5. Systemd service

```bash
sudo nano /etc/systemd/system/ldr.service
```

```ini
[Unit]
Description=LDR Together
After=network.target mongod.service

[Service]
Type=simple
User=ubuntu
WorkingDirectory=/opt/ldr
ExecStart=/opt/ldr/ldr-server
Restart=on-failure
RestartSec=5
EnvironmentFile=/opt/ldr/.env

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable ldr
sudo systemctl start ldr
sudo systemctl status ldr     # should show Active: running
```

---

### 6. nginx config

```bash
sudo nano /etc/nginx/sites-available/ldr
```

```nginx
server {
    listen 80;
    server_name your-domain.com;

    # Serve built frontend
    root /opt/ldr/dist;
    index index.html;

    # SPA fallback
    location / {
        try_files $uri $uri/ /index.html;
    }

    # Proxy API
    location /api/ {
        proxy_pass http://127.0.0.1:8080;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }

    # Proxy WebSocket
    location /ws/ {
        proxy_pass http://127.0.0.1:8080;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_read_timeout 3600s;
    }
}
```

```bash
sudo ln -s /etc/nginx/sites-available/ldr /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

---

### 7. SSL (Let's Encrypt)

```bash
sudo certbot --nginx -d your-domain.com
# certbot auto-edits your nginx config and sets up auto-renewal
```

---

### 8. Redeploy after updates

```bash
# Local
cd server && GOOS=linux GOARCH=amd64 go build -o ldr-server .
cd ../client && bun run build

scp server/ldr-server ubuntu@your-server-ip:/opt/ldr/
scp -r client/dist ubuntu@your-server-ip:/opt/ldr/

# On server
ssh ubuntu@your-server-ip 'sudo systemctl restart ldr'
```

---

### Expected resource usage

| Component   | RAM     |
|-------------|---------|
| Go binary   | ~15 MB  |
| MongoDB     | ~300 MB |
| nginx       | ~5 MB   |
| OS          | ~200 MB |
| **Total**   | **~520 MB** — well within 2GB |

---

### No domain? Use IP directly

Skip SSL and certbot. In nginx, set `server_name _` and access via `http://your-server-ip`.

---

## Tech Stack

- **Backend:** Go, chi router, nhooyr WebSocket, MongoDB
- **Frontend:** React, Vite, Tailwind CSS
- **Real-time:** Native WebSocket with auto-reconnect
