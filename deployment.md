# Deployment Guide

**Target:** Ubuntu VPS — 2 vCPU / 2GB RAM / 2GB Swap
**Stack:** Go binary + MongoDB + nginx + systemd
**Deploy flow:** push to GitHub → Actions SSHes in → server pulls & rebuilds
**App location:** `~/ldr`

---

## Table of Contents

1. [First-time server setup](#1-first-time-server-setup)
2. [Install dependencies](#2-install-dependencies)
3. [MongoDB setup](#3-mongodb-setup)
4. [GitHub repo + deploy key](#4-github-repo--deploy-key)
5. [Clone and first build](#5-clone-and-first-build)
6. [Environment file](#6-environment-file)
7. [Systemd service](#7-systemd-service)
8. [nginx config](#8-nginx-config)
9. [SSL with Let's Encrypt](#9-ssl-with-lets-encrypt)
10. [Auto-deploy with GitHub Actions](#10-auto-deploy-with-github-actions)
11. [Logs and monitoring](#11-logs-and-monitoring)
12. [MongoDB backup](#12-mongodb-backup)
13. [Troubleshooting](#13-troubleshooting)
14. [Optional: MongoDB auth](#14-optional-mongodb-auth)

---

## 1. First-time server setup

### Firewall
```bash
sudo ufw allow OpenSSH
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable
sudo ufw status
```

### Swap (verify it's active — yours already has 2GB)
```bash
free -h
# If Swap shows 0:
sudo fallocate -l 2G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
```

---

## 2. Install dependencies

### Go
```bash
wget https://go.dev/dl/go1.25.5.linux-amd64.tar.gz
sudo rm -rf /usr/local/go
sudo tar -C /usr/local -xzf go1.25.5.linux-amd64.tar.gz
rm go1.25.5.linux-amd64.tar.gz
echo 'export PATH=$PATH:/usr/local/go/bin' >> ~/.bashrc
source ~/.bashrc
go version   # go1.25.5 linux/amd64
```

### Bun (for building frontend on server)
```bash
curl -fsSL https://bun.sh/install | bash
source ~/.bashrc
bun --version
```

### nginx + certbot
```bash
sudo apt update
sudo apt install -y nginx certbot python3-certbot-nginx
sudo systemctl enable nginx
```

### MongoDB 7
```bash
curl -fsSL https://www.mongodb.org/static/pgp/server-7.0.asc \
  | sudo gpg -o /usr/share/keyrings/mongodb-server-7.0.gpg --dearmor

echo "deb [ arch=amd64,arm64 signed-by=/usr/share/keyrings/mongodb-server-7.0.gpg ] \
  https://repo.mongodb.org/apt/ubuntu jammy/mongodb-org/7.0 multiverse" \
  | sudo tee /etc/apt/sources.list.d/mongodb-org-7.0.list

sudo apt update && sudo apt install -y mongodb-org
sudo systemctl enable mongod
```

---

## 3. MongoDB setup

### Cap memory — important for 2GB RAM

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
  bindIp: 127.0.0.1   # localhost only
```

```bash
sudo systemctl start mongod
mongosh --eval "db.runCommand({ ping: 1 })"   # should print: { ok: 1 }
```

---

## 4. GitHub repo + deploy key

The deploy key lets the server `git pull` from your GitHub repo (read-only).

### On the server — generate the key
```bash
ssh-keygen -t ed25519 -C "ldr-deploy-server" -f ~/.ssh/ldr_deploy -N ""
cat ~/.ssh/ldr_deploy.pub   # copy this output
```

### Tell SSH to use this key for GitHub
```bash
nano ~/.ssh/config
```

Add:
```
Host github-ldr
    HostName github.com
    User git
    IdentityFile ~/.ssh/ldr_deploy
    IdentitiesOnly yes
```

### On GitHub
1. Go to your repo → **Settings → Deploy keys → Add deploy key**
2. Title: `ldr-server`
3. Paste the public key from above
4. Leave **Allow write access** unchecked (read-only is enough)
5. Click **Add key**

### Test the connection
```bash
ssh -T github-ldr
# Hi username/ldr! You've successfully authenticated...
```

---

## 5. Clone and first build

### Clone the repo
```bash
cd ~
# Use the Host alias from ~/.ssh/config
git clone github-ldr:YOUR_GITHUB_USERNAME/ldr.git ldr
cd ldr
```

### Build script — save as `~/ldr/redeploy.sh`
```bash
nano ~/ldr/redeploy.sh
```

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
```

### Run first build
```bash
~/ldr/redeploy.sh
```

> The service will fail to start until we set up the `.env` and systemd files below — that's fine for now.

---

## 6. Environment file

```bash
nano ~/ldr/.env
```

```env
MONGO_URI=mongodb://localhost:27017
PORT=8080
```

This file stays on the server only — never commit it to GitHub.

---

## 7. Systemd service

```bash
sudo nano /etc/systemd/system/ldr.service
```

```ini
[Unit]
Description=LDR Together
After=network.target mongod.service
Requires=mongod.service

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

Allow ubuntu to restart the service without a password (needed for redeploy.sh):
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

```bash
sudo nano /etc/nginx/sites-available/ldr
```

```nginx
server {
    listen 80;
    server_name your-domain.com;   # or _ if using IP only

    root /home/ubuntu/ldr/client/dist;
    index index.html;

    gzip on;
    gzip_types text/plain text/css application/json application/javascript image/svg+xml;
    gzip_min_length 1024;

    # Cache hashed assets forever
    location /assets/ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }

    # SPA fallback
    location / {
        try_files $uri $uri/ /index.html;
    }

    # API
    location /api/ {
        proxy_pass http://127.0.0.1:8080;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_read_timeout 30s;
    }

    # WebSocket
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
sudo ln -sf /etc/nginx/sites-available/ldr /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t && sudo systemctl reload nginx
```

Smoke test:
```bash
curl http://your-server-ip/api/rooms/TEST
# {"message":"room not found"} = Go is up and reachable
```

---

## 9. SSL with Let's Encrypt

Requires a domain pointing to your server IP.

```bash
sudo certbot --nginx -d your-domain.com
# Choose option 2: redirect HTTP → HTTPS
sudo certbot renew --dry-run   # verify auto-renewal works
```

No domain? Skip this — access via `http://your-server-ip`. WebSocket uses `ws://`, which still works on a private connection.

---

## 10. Auto-deploy with GitHub Actions

Every push to `main` will SSH into your server and run `redeploy.sh`.

### Generate an Actions SSH key (on your local machine)
```bash
ssh-keygen -t ed25519 -C "github-actions-ldr" -f ~/.ssh/ldr_actions -N ""
```

### Add the public key to your server
```bash
cat ~/.ssh/ldr_actions.pub
# Copy the output, then on the server:
echo "PASTE_PUBLIC_KEY_HERE" >> ~/.ssh/authorized_keys
```

### Add secrets to GitHub
Go to your repo → **Settings → Secrets and variables → Actions → New repository secret**

| Secret name | Value |
|---|---|
| `SSH_PRIVATE_KEY` | contents of `~/.ssh/ldr_actions` (private key) |
| `SERVER_IP` | your server's IP address |
| `SERVER_USER` | `ubuntu` |

### Create the workflow

Create this file in your repo (on your local machine):

```bash
mkdir -p .github/workflows
```

`.github/workflows/deploy.yml`:
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

Push this file to GitHub. From then on, every push to `main` triggers a deploy automatically. You can watch it run under **Actions** tab on GitHub.

### Manual redeploy (without pushing)
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

# nginx access/error
sudo tail -f /var/log/nginx/access.log
sudo tail -f /var/log/nginx/error.log

# All services status
sudo systemctl status ldr mongod nginx

# Resource usage
free -h && df -h /

# MongoDB db size
mongosh --eval "db.stats()" ldr
```

### Trim logs (run occasionally or add to cron)
```bash
sudo journalctl --vacuum-size=200M
```

---

## 12. MongoDB backup

```bash
# Manual
mongodump --db ldr --gzip --out ~/ldr/backup/$(date +%F)

# Cron: daily 3am backup, keep 7 days
crontab -e
```

```cron
0 3 * * * mongodump --db ldr --gzip --out ~/ldr/backup/$(date +\%F)
0 4 * * * find ~/ldr/backup -maxdepth 1 -type d -mtime +7 -exec rm -rf {} +
```

```bash
# Restore
mongorestore --db ldr --gzip ~/ldr/backup/2026-04-18/ldr/
```

---

## 13. Troubleshooting

**Build fails on server (out of memory)**
```bash
free -h   # check swap is active
# Go build uses ~300MB peak — swap handles it if RAM is tight
```

**Service won't start**
```bash
sudo journalctl -u ldr -n 50
# Common causes: .env missing, port 8080 in use, MongoDB not running
```

**git pull fails**
```bash
ssh -T github-ldr   # test deploy key connection
# "Permission denied" = key not added to GitHub Deploy Keys
```

**Port already in use**
```bash
sudo lsof -i :8080
sudo kill -9 <PID>
sudo systemctl start ldr
```

**After server reboot**
All three services auto-start via systemd in order: `mongod` → `ldr` → `nginx`. No manual action needed.

---

## 14. Optional: MongoDB auth

For extra security on a shared server:

```bash
mongosh
```
```js
use admin
db.createUser({
  user: "ldruser",
  pwd: "a-strong-password",
  roles: [{ role: "readWrite", db: "ldr" }]
})
exit
```

```bash
# Enable auth
sudo nano /etc/mongod.conf
# Add:
# security:
#   authorization: enabled

sudo systemctl restart mongod
```

Update `~/ldr/.env`:
```env
MONGO_URI=mongodb://ldruser:a-strong-password@localhost:27017/ldr
```

```bash
sudo systemctl restart ldr
```
