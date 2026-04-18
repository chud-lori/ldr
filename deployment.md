# Deployment Guide

**Target:** Ubuntu VPS — 2 vCPU / 2GB RAM / 2GB Swap  
**Stack:** Go binary + MongoDB + nginx + systemd  
**Expected RAM usage:** ~520 MB (leaves ~1.4 GB headroom)

---

## Table of Contents

1. [First-time server setup](#1-first-time-server-setup)
2. [Install dependencies](#2-install-dependencies)
3. [MongoDB setup](#3-mongodb-setup)
4. [Build locally](#4-build-locally)
5. [Upload to server](#5-upload-to-server)
6. [Environment file](#6-environment-file)
7. [Systemd service](#7-systemd-service)
8. [nginx config](#8-nginx-config)
9. [SSL with Let's Encrypt](#9-ssl-with-lets-encrypt)
10. [Redeploy script](#10-redeploy-script)
11. [Logs and monitoring](#11-logs-and-monitoring)
12. [MongoDB backup](#12-mongodb-backup)
13. [Troubleshooting](#13-troubleshooting)

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

### Swap (already enabled on your server — verify)
```bash
free -h
# If Swap shows 0, create it:
sudo fallocate -l 2G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
```

### Create app directory
```bash
sudo mkdir -p /opt/ldr
sudo chown ubuntu:ubuntu /opt/ldr
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
go version  # should print go1.25.5
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

sudo apt update
sudo apt install -y mongodb-org
sudo systemctl enable mongod
```

---

## 3. MongoDB setup

### Cap memory — critical for 2GB RAM

```bash
sudo nano /etc/mongod.conf
```

Find the `storage:` section and add the cache limit:

```yaml
storage:
  dbPath: /var/lib/mongodb
  wiredTiger:
    engineConfig:
      cacheSizeGB: 0.3
```

Also bind to localhost only (already default, but verify):
```yaml
net:
  port: 27017
  bindIp: 127.0.0.1
```

```bash
sudo systemctl start mongod
sudo systemctl status mongod  # should show Active: running
```

### Verify MongoDB is working
```bash
mongosh --eval "db.runCommand({ ping: 1 })"
# should print: { ok: 1 }
```

---

## 4. Build locally

Run these on **your local machine** before uploading.

```bash
# Clone or navigate to project root
cd /Users/lori/Projects/ldr

# Build Go binary for Linux x86_64
cd server
GOOS=linux GOARCH=amd64 CGO_ENABLED=0 go build -ldflags="-s -w" -o ldr-server .
# -s -w strips debug symbols → smaller binary (~8 MB)

# Build frontend
cd ../client
bun run build
# Output goes to client/dist/
```

---

## 5. Upload to server

Replace `your-server-ip` with your actual IP or domain.

```bash
# From project root
SERVER=ubuntu@your-server-ip

# Upload Go binary
scp server/ldr-server $SERVER:/opt/ldr/
ssh $SERVER 'chmod +x /opt/ldr/ldr-server'

# Upload built frontend
scp -r client/dist $SERVER:/opt/ldr/

# Upload env file (first time only)
scp server/.env $SERVER:/opt/ldr/.env
```

---

## 6. Environment file

On the server, set your production values:

```bash
nano /opt/ldr/.env
```

```env
MONGO_URI=mongodb://localhost:27017
PORT=8080
```

> If you want MongoDB auth (recommended for shared servers), see [MongoDB with auth](#optional-mongodb-auth) below.

---

## 7. Systemd service

```bash
sudo nano /etc/systemd/system/ldr.service
```

```ini
[Unit]
Description=LDR Together
Documentation=https://github.com/yourrepo/ldr
After=network.target mongod.service
Requires=mongod.service

[Service]
Type=simple
User=ubuntu
WorkingDirectory=/opt/ldr
ExecStart=/opt/ldr/ldr-server
EnvironmentFile=/opt/ldr/.env
Restart=on-failure
RestartSec=5
StandardOutput=journal
StandardError=journal
SyslogIdentifier=ldr

# Basic hardening
NoNewPrivileges=true
PrivateTmp=true

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable ldr
sudo systemctl start ldr
sudo systemctl status ldr
```

You should see `Active: active (running)`.

---

## 8. nginx config

```bash
sudo nano /etc/nginx/sites-available/ldr
```

```nginx
server {
    listen 80;
    server_name your-domain.com;   # or _ if no domain

    # Serve built React app
    root /opt/ldr/dist;
    index index.html;

    # Gzip for faster load on slow connections
    gzip on;
    gzip_types text/plain text/css application/json application/javascript text/xml application/xml image/svg+xml;
    gzip_min_length 1024;

    # Cache static assets (JS/CSS have hashed filenames)
    location /assets/ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }

    # SPA fallback — all routes go to index.html
    location / {
        try_files $uri $uri/ /index.html;
    }

    # API proxy
    location /api/ {
        proxy_pass http://127.0.0.1:8080;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_read_timeout 30s;
    }

    # WebSocket proxy
    location /ws/ {
        proxy_pass http://127.0.0.1:8080;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_read_timeout 3600s;   # keep WS alive for 1 hour
        proxy_send_timeout 3600s;
    }
}
```

```bash
sudo ln -sf /etc/nginx/sites-available/ldr /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default   # remove default placeholder
sudo nginx -t                                  # must print: test is successful
sudo systemctl reload nginx
```

Test it works (HTTP first):
```bash
curl http://your-server-ip/api/rooms/FAKECODE
# should return {"message":"room not found"} — means Go is reachable
```

---

## 9. SSL with Let's Encrypt

You need a domain pointing to your server IP for this step.

```bash
sudo certbot --nginx -d your-domain.com
# Follow prompts — choose option 2 to redirect HTTP → HTTPS
```

Certbot auto-edits your nginx config and sets up auto-renewal. Verify:
```bash
sudo certbot renew --dry-run   # should succeed
```

### No domain?

Skip certbot. Access the app via `http://your-server-ip` directly. WebSocket will use `ws://` instead of `wss://` — still works fine on a private connection.

---

## 10. Redeploy script

Save this as `deploy.sh` in your project root on your **local machine**:

```bash
#!/bin/bash
set -e

SERVER="ubuntu@your-server-ip"
APP_DIR="/opt/ldr"

echo "→ Building Go binary..."
cd server
GOOS=linux GOARCH=amd64 CGO_ENABLED=0 go build -ldflags="-s -w" -o ldr-server .
cd ..

echo "→ Building frontend..."
cd client
bun run build
cd ..

echo "→ Uploading..."
scp server/ldr-server $SERVER:$APP_DIR/
scp -r client/dist $SERVER:$APP_DIR/

echo "→ Restarting service..."
ssh $SERVER 'sudo systemctl restart ldr'

echo "→ Done. Checking status..."
ssh $SERVER 'sudo systemctl status ldr --no-pager'
```

```bash
chmod +x deploy.sh
./deploy.sh
```

---

## 11. Logs and monitoring

### App logs
```bash
# Live logs
sudo journalctl -u ldr -f

# Last 100 lines
sudo journalctl -u ldr -n 100

# Logs since last boot
sudo journalctl -u ldr -b
```

### nginx logs
```bash
sudo tail -f /var/log/nginx/access.log
sudo tail -f /var/log/nginx/error.log
```

### Resource check
```bash
# Memory usage
free -h

# Disk usage
df -h /

# Service status
sudo systemctl status ldr mongod nginx

# MongoDB stats
mongosh --eval "db.stats()" ldr
```

---

## 12. MongoDB backup

### Manual backup
```bash
mongodump --db ldr --out /opt/ldr/backup/$(date +%F)
```

### Scheduled backup with cron
```bash
crontab -e
```

Add (runs daily at 3am):
```cron
0 3 * * * mongodump --db ldr --out /opt/ldr/backup/$(date +\%F) --gzip
# Keep only last 7 days
0 4 * * * find /opt/ldr/backup -maxdepth 1 -type d -mtime +7 -exec rm -rf {} +
```

### Restore from backup
```bash
mongorestore --db ldr /opt/ldr/backup/2026-04-18/ldr/
```

---

## 13. Troubleshooting

**App not starting**
```bash
sudo journalctl -u ldr -n 50
# Look for: MongoDB connection error, port already in use
```

**MongoDB not connecting**
```bash
sudo systemctl status mongod
sudo journalctl -u mongod -n 30
mongosh --eval "db.runCommand({ ping: 1 })"
```

**WebSocket not working after SSL**
Make sure the nginx WebSocket block uses `proxy_http_version 1.1` and the `Upgrade` headers — already included in the config above.

**High memory usage**
```bash
free -h
# If MongoDB is eating too much, lower the cache:
# Edit /etc/mongod.conf → cacheSizeGB: 0.2
sudo systemctl restart mongod
```

**Port 8080 already in use**
```bash
sudo lsof -i :8080
sudo kill -9 <PID>
sudo systemctl start ldr
```

**After server reboot — everything should auto-start**

All three services (`mongod`, `ldr`, `nginx`) are enabled via systemd. After a reboot they come up automatically in the right order (`mongod` → `ldr` → `nginx`).

---

## Optional: MongoDB auth

For a shared or public server, add a password to MongoDB:

```bash
mongosh
```

```js
use admin
db.createUser({
  user: "ldruser",
  pwd: "yourpassword",
  roles: [{ role: "readWrite", db: "ldr" }]
})
exit
```

Enable auth in `/etc/mongod.conf`:
```yaml
security:
  authorization: enabled
```

```bash
sudo systemctl restart mongod
```

Update `/opt/ldr/.env`:
```env
MONGO_URI=mongodb://ldruser:yourpassword@localhost:27017/ldr
```

```bash
sudo systemctl restart ldr
```
