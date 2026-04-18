# Deployment Guide

**Target:** Ubuntu VPS on Tencent Cloud — 2 vCPU / 2GB RAM
**Stack:** Go binary + MongoDB + nginx + systemd
**SSL:** Cloudflare proxy (no certbot needed)
**Firewall:** Tencent Cloud Security Group (no ufw needed)
**Deploy flow:** push to GitHub → Actions SSHes in → server pulls & rebuilds

---

## Table of Contents

1. [Tencent Cloud Security Group](#1-tencent-cloud-security-group)
2. [Install dependencies](#2-install-dependencies)
3. [MongoDB setup](#3-mongodb-setup)
4. [GitHub repo + deploy key](#4-github-repo--deploy-key)
5. [Clone and first build](#5-clone-and-first-build)
6. [Environment file](#6-environment-file)
7. [Systemd service](#7-systemd-service)
8. [nginx config](#8-nginx-config)
9. [Cloudflare SSL setup](#9-cloudflare-ssl-setup)
10. [Auto-deploy with GitHub Actions](#10-auto-deploy-with-github-actions)
11. [Logs and monitoring](#11-logs-and-monitoring)
12. [MongoDB backup](#12-mongodb-backup)
13. [Troubleshooting](#13-troubleshooting)

---

## 1. Tencent Cloud Security Group

In the Tencent Cloud console, go to **CVM → Security Groups** and make sure your instance has these inbound rules:

| Protocol | Port | Source | Purpose |
|---|---|---|---|
| TCP | 22 | your IP only | SSH |
| TCP | 80 | 0.0.0.0/0 | HTTP (Cloudflare needs this) |
| TCP | 443 | 0.0.0.0/0 | HTTPS |

Everything else can stay closed — no need to expose port 8080 directly, nginx proxies it.

---

## 2. Install dependencies

### Swap (verify it's active)
```bash
free -h
# If Swap shows 0:
sudo fallocate -l 2G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
```

### Go
```bash
wget https://go.dev/dl/go1.22.5.linux-amd64.tar.gz
sudo rm -rf /usr/local/go
sudo tar -C /usr/local -xzf go1.22.5.linux-amd64.tar.gz
rm go1.22.5.linux-amd64.tar.gz
echo 'export PATH=$PATH:/usr/local/go/bin' >> ~/.bashrc
source ~/.bashrc
go version
```

### Bun
```bash
curl -fsSL https://bun.sh/install | bash
source ~/.bashrc
bun --version
```

### nginx
```bash
sudo apt update
sudo apt install -y nginx
sudo systemctl enable nginx
```

---

## 3. MongoDB setup

Two options — pick one.

### Option A: MongoDB Atlas (recommended — zero ops)

1. Create a free cluster at [cloud.mongodb.com](https://cloud.mongodb.com)
2. Create a database user with read/write access
3. Under **Network Access**, add your server IP (or `0.0.0.0/0` to allow all)
4. Click **Connect → Drivers** and copy the connection string:
   ```
   mongodb+srv://user:password@cluster0.xxxxx.mongodb.net/ldr?retryWrites=true&w=majority
   ```
5. Use this as `MONGO_URI` in your `.env` file (step 6)

You can view and edit your data with **MongoDB Compass** — paste the same connection string.

### Option B: Local MongoDB on the server

```bash
curl -fsSL https://www.mongodb.org/static/pgp/server-7.0.asc \
  | sudo gpg -o /usr/share/keyrings/mongodb-server-7.0.gpg --dearmor

echo "deb [ arch=amd64,arm64 signed-by=/usr/share/keyrings/mongodb-server-7.0.gpg ] \
  https://repo.mongodb.org/apt/ubuntu jammy/mongodb-org/7.0 multiverse" \
  | sudo tee /etc/apt/sources.list.d/mongodb-org-7.0.list

sudo apt update && sudo apt install -y mongodb-org
sudo systemctl enable mongod
```

Cap memory — important for 2GB RAM:
```bash
sudo nano /etc/mongod.conf
```

```yaml
storage:
  dbPath: /var/lib/mongodb
  wiredTiger:
    engineConfig:
      cacheSizeGB: 0.3

net:
  port: 27017
  bindIp: 127.0.0.1
```

```bash
sudo systemctl start mongod
mongosh --eval "db.runCommand({ ping: 1 })"   # { ok: 1 }
```

Connection string for local: `mongodb://localhost:27017`

To connect Compass to local MongoDB from your laptop:
- You'll need to set up an SSH tunnel: **Compass → New Connection → Advanced → SSH Tunnel**
- Or just use `mongosh` on the server for quick queries.

---

## 4. GitHub repo + deploy key

The deploy key lets the server `git pull` from your private repo (read-only).

### On the server — generate the key
```bash
ssh-keygen -t ed25519 -C "ldr-deploy-server" -f ~/.ssh/ldr_deploy -N ""
cat ~/.ssh/ldr_deploy.pub   # copy this
```

### Tell SSH to use this key for GitHub
```bash
nano ~/.ssh/config
```
```
Host github-ldr
    HostName github.com
    User git
    IdentityFile ~/.ssh/ldr_deploy
    IdentitiesOnly yes
```

### On GitHub
1. Repo → **Settings → Deploy keys → Add deploy key**
2. Title: `ldr-server`, paste the public key
3. Leave **Allow write access** unchecked
4. Click **Add key**

```bash
ssh -T github-ldr   # Hi username/ldr! You've successfully authenticated...
```

---

## 5. Clone and first build

```bash
cd ~
git clone github-ldr:YOUR_GITHUB_USERNAME/ldr.git ldr
cd ldr
```

### Build script — save as `~/ldr/redeploy.sh`
```bash
#!/bin/bash
set -e
cd ~/ldr

echo "[ldr] pulling latest..."
git pull

echo "[ldr] building server..."
cd server
go build -ldflags="-s -w" -o ldr-server .
cd ..

echo "[ldr] building client..."
cd client
bun install --frozen-lockfile
bun run build
cd ..

echo "[ldr] restarting service..."
sudo systemctl restart ldr

echo "[ldr] done."
sudo systemctl status ldr --no-pager -l
```

```bash
chmod +x ~/ldr/redeploy.sh
~/ldr/redeploy.sh
```

---

## 6. Environment file

```bash
nano ~/ldr/.env
```

```env
# MongoDB connection string — paste Atlas URI or use local
MONGO_URI=mongodb+srv://user:password@cluster0.xxxxx.mongodb.net/ldr?retryWrites=true&w=majority

PORT=8080
```

This file stays on the server only — never commit it.

> The server reads `MONGO_URI` (or `LDRMONGO` if you prefer that name — both work).

---

## 7. Systemd service

```bash
sudo nano /etc/systemd/system/ldr.service
```

```ini
[Unit]
Description=LDR Together
After=network.target

[Service]
Type=simple
User=ubuntu
WorkingDirectory=/home/ubuntu/ldr/server
ExecStart=/home/ubuntu/ldr/server/ldr-server
EnvironmentFile=/home/ubuntu/ldr/.env
Restart=on-failure
RestartSec=5
StandardOutput=journal
StandardError=journal
SyslogIdentifier=ldr
NoNewPrivileges=true
PrivateTmp=true

[Install]
WantedBy=multi-user.target
```

Allow ubuntu to restart the service without a password:
```bash
sudo visudo
```
Add at the bottom:
```
ubuntu ALL=(ALL) NOPASSWD: /bin/systemctl restart ldr, /bin/systemctl status ldr
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable ldr
sudo systemctl start ldr
sudo systemctl status ldr   # Active: running
```

---

## 8. nginx config

Since your server hosts multiple apps on different subdomains, name the file after your subdomain so it doesn't conflict:

```bash
sudo nano /etc/nginx/sites-available/ldr.lori.my.id
```

```nginx
server {
    listen 80;
    server_name ldr.lori.my.id;

    root /home/ubuntu/ldr/client/dist;
    index index.html;

    gzip on;
    gzip_types text/plain text/css application/json application/javascript image/svg+xml;
    gzip_min_length 1024;

    location /assets/ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }

    location / {
        try_files $uri $uri/ /index.html;
    }

    location /api/ {
        proxy_pass http://127.0.0.1:8080;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_read_timeout 30s;
    }

    location /ws/ {
        proxy_pass http://127.0.0.1:8080;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_read_timeout 3600s;
        proxy_send_timeout 3600s;
    }
}
```

```bash
sudo ln -sf /etc/nginx/sites-available/ldr.lori.my.id /etc/nginx/sites-enabled/ldr.lori.my.id
# Don't remove default if other apps use it
sudo nginx -t && sudo systemctl reload nginx
```

Smoke test:
```bash
curl http://ldr.lori.my.id/api/rooms/TEST
# {"message":"room not found"} = working
```

---

## 9. Cloudflare SSL setup

Since your domain is on Cloudflare, SSL is handled there — no certbot required.

1. **Point your subdomain to the server**: In Cloudflare DNS, add an `A` record for `ldr` pointing to your server IP. Make sure the **Proxy status is orange (proxied)**.

2. **SSL/TLS mode**: Go to **SSL/TLS → Overview** and set mode to **Full** (not Full Strict — since nginx only listens on HTTP 80, Cloudflare encrypts the browser↔CF leg).

3. **That's it.** Cloudflare terminates HTTPS for you. Your server only needs to listen on port 80.

> **WebSocket note**: Cloudflare proxies WebSocket connections automatically on all paid plans and on the free plan for connections on port 80/443. Your WS path `/ws/` will work through the proxy.

---

## 10. Auto-deploy with GitHub Actions

### Generate an Actions SSH key (on your local machine)
```bash
ssh-keygen -t ed25519 -C "github-actions-ldr" -f ~/.ssh/ldr_actions -N ""
```

### Add the public key to your server
```bash
# On the server:
echo "PASTE_ldr_actions.pub_CONTENT_HERE" >> ~/.ssh/authorized_keys
```

### Add secrets to GitHub
Repo → **Settings → Secrets and variables → Actions → New repository secret**

| Secret | Value |
|---|---|
| `SSH_PRIVATE_KEY` | contents of `~/.ssh/ldr_actions` (private key) |
| `SERVER_IP` | your server IP |
| `SERVER_USER` | `ubuntu` |

### `.github/workflows/deploy.yml`
```yaml
name: Deploy

on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - name: Deploy to server
        uses: appleboy/ssh-action@v1.0.3
        with:
          host: ${{ secrets.SERVER_IP }}
          username: ${{ secrets.SERVER_USER }}
          key: ${{ secrets.SSH_PRIVATE_KEY }}
          script: ~/ldr/redeploy.sh
```

Push this to GitHub — every push to `main` auto-deploys. Check progress under the **Actions** tab.

### Manual redeploy
```bash
ssh ubuntu@your-server-ip '~/ldr/redeploy.sh'
```

---

## 11. Logs and monitoring

```bash
# Live app logs
sudo journalctl -u ldr -f

# Last 100 lines
sudo journalctl -u ldr -n 100

# nginx
sudo tail -f /var/log/nginx/access.log
sudo tail -f /var/log/nginx/error.log

# Resource usage
free -h && df -h /
```

Trim logs occasionally:
```bash
sudo journalctl --vacuum-size=200M
```

---

## 12. MongoDB backup

### Atlas
Atlas free tier includes automatic daily backups. You can also export via Compass: **Collection → Export Data**.

### Local MongoDB
```bash
# Manual
mongodump --db ldr --gzip --out ~/ldr/backup/$(date +%F)

# Cron: daily 3am, keep 7 days
crontab -e
```
```cron
0 3 * * * mongodump --db ldr --gzip --out ~/ldr/backup/$(date +\%F)
0 4 * * * find ~/ldr/backup -maxdepth 1 -type d -mtime +7 -exec rm -rf {} +
```

---

## 13. Troubleshooting

**Service won't start**
```bash
sudo journalctl -u ldr -n 50
# Common causes: .env missing, MONGO_URI wrong, port 8080 in use
```

**MongoDB connection fails (Atlas)**
```bash
# Test the URI directly
mongosh "mongodb+srv://..." --eval "db.runCommand({ping:1})"
# Check Atlas Network Access — is your server IP whitelisted?
```

**git pull fails**
```bash
ssh -T github-ldr
# "Permission denied" = deploy key not added to GitHub
```

**Port already in use**
```bash
sudo lsof -i :8080
sudo kill -9 <PID>
sudo systemctl start ldr
```

**WebSocket not connecting through Cloudflare**
- Make sure Cloudflare SSL mode is **Full** (not Flexible)
- Check that the `/ws/` nginx location has `proxy_http_version 1.1` and the Upgrade headers
- On Cloudflare free plan, WebSocket works on ports 80 and 443 only — nginx on 80 is correct
