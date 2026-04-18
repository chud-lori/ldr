# Server Hardening Playbook — Server VM (`xx.xx.xx.xx`)

Step-by-step to secure the Ubuntu box that hosts `dolanan`, `ethok`, `profile`,
`finance`, `ldr`, and `sinepil` subdomains behind Cloudflare.

Ordered by risk reduction per minute of work. **Keep a second SSH session open
during SSH changes** so you can't lock yourself out.

---

## Step 1 — Lock down SSH

### 1a. Make sure your SSH key works

On your **local machine**:

```bash
ssh-copy-id ubuntu@server
ssh server "echo key-auth-works"   # must succeed without password
```

If `ssh-copy-id` is blocked, append the key manually:

```bash
cat ~/.ssh/id_ed25519.pub | ssh server \
  "mkdir -p ~/.ssh && chmod 700 ~/.ssh && \
   cat >> ~/.ssh/authorized_keys && chmod 600 ~/.ssh/authorized_keys"
```

### 1b. Disable password + root login

On the server:

```bash
sudo sed -i 's/^PasswordAuthentication yes/PasswordAuthentication no/' /etc/ssh/sshd_config
sudo sed -i 's/^PermitRootLogin yes/PermitRootLogin no/' /etc/ssh/sshd_config
sudo sed -i 's/PasswordAuthentication yes/PasswordAuthentication no/' \
  /etc/ssh/sshd_config.d/50-cloud-init.conf
sudo sshd -t                       # config valid → prints nothing
sudo systemctl reload ssh
```

**Verify from a new terminal** before closing your current session:

```bash
ssh server whoami                 # returns "ubuntu"
```

### 1c. (Optional) Change SSH port — socket-activated Ubuntu

This box uses **socket-activated SSH**. The port is owned by `ssh.socket`, not
`sshd_config`. Editing `Port` in `sshd_config` has no effect here.

```bash
sudo systemctl edit ssh.socket
```

Add:

```ini
[Socket]
ListenStream=
ListenStream=2222
```

(The empty `ListenStream=` clears the inherited `:22`.)

```bash
sudo systemctl daemon-reload
sudo systemctl restart ssh.socket
sudo ss -tlnp | grep ssh           # must show :2222 only
```

Then open port `2222` in server's Security Group, update `~/.ssh/config`
locally (`Port 2222`), and remove port 22 from the security group.

---

## Step 2 — Install fail2ban

```bash
sudo apt update && sudo apt install -y fail2ban
sudo tee /etc/fail2ban/jail.local > /dev/null <<'EOF'
[DEFAULT]
bantime  = 1h
findtime = 10m
maxretry = 5
backend  = systemd

[sshd]
enabled = true
port    = ssh
EOF
sudo systemctl enable --now fail2ban
sudo fail2ban-client status sshd
```

Check bans later: `sudo fail2ban-client status sshd`.

---

## Step 3 — Restrict port 80/443 to Cloudflare (server console)

Origin IP is reachable by anyone; bots probe `.env`, `.git`, etc. daily.

1. server Cloud console → CVM → VM → **Security Group** rules.
2. Remove any rule allowing `0.0.0.0/0` on ports 80/443.
3. Add rules allowing only Cloudflare ranges on 80 and 443:
   - IPv4: <https://www.cloudflare.com/ips-v4>
   - IPv6: <https://www.cloudflare.com/ips-v6>
4. Keep SSH (22 or 2222) open to your IP only.

This removes the `.env`/`.git` scanner noise from `error.log` entirely.

---

## Step 4 — Enable UFW (defense-in-depth)

```bash
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow 22/tcp          # or 2222/tcp
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable
sudo ufw status verbose
```

server SG = outer wall. UFW = inner wall. Both.

---

## Step 5 — TLS on origin

CF → origin is plain HTTP today. Anyone reaching the origin IP sees everything
in clear.

For each subdomain:

```bash
sudo certbot --nginx \
  -d dolanan.lori.my.id \
  -d ethok.lori.my.id \
  -d profile.lori.my.id \
  -d finance.lori.my.id \
  -d ldr.lori.my.id \
  -d sinepil.lori.my.id
```

If CF's proxy blocks the HTTP-01 challenge: temporarily set the CF DNS record
to "DNS only" (grey cloud) per subdomain, run certbot, then flip back to
proxied (orange cloud). Alternative: `--webroot` or DNS-01.

After certificates are issued, in Cloudflare dashboard → SSL/TLS → set mode to
**Full (strict)**.

Verify auto-renewal:

```bash
sudo certbot renew --dry-run
sudo systemctl list-timers | grep certbot
```

---

## Step 6 — Real client IP from Cloudflare

Access logs currently show Cloudflare IPs (172.x, 162.x) instead of real
visitors.

```bash
sudo tee /etc/nginx/conf.d/cloudflare-realip.conf > /dev/null <<'EOF'
# Cloudflare IPv4 — refresh from https://www.cloudflare.com/ips-v4
set_real_ip_from 173.245.48.0/20;
set_real_ip_from 103.21.244.0/22;
set_real_ip_from 103.22.200.0/22;
set_real_ip_from 103.31.4.0/22;
set_real_ip_from 141.101.64.0/18;
set_real_ip_from 108.162.192.0/18;
set_real_ip_from 190.93.240.0/20;
set_real_ip_from 188.114.96.0/20;
set_real_ip_from 197.234.240.0/22;
set_real_ip_from 198.41.128.0/17;
set_real_ip_from 162.158.0.0/15;
set_real_ip_from 104.16.0.0/13;
set_real_ip_from 104.24.0.0/14;
set_real_ip_from 172.64.0.0/13;
set_real_ip_from 131.0.72.0/22;
# IPv6
set_real_ip_from 2400:cb00::/32;
set_real_ip_from 2606:4700::/32;
set_real_ip_from 2803:f800::/32;
set_real_ip_from 2405:b500::/32;
set_real_ip_from 2405:8100::/32;
set_real_ip_from 2a06:98c0::/29;
set_real_ip_from 2c0f:f248::/32;

real_ip_header CF-Connecting-IP;
real_ip_recursive on;
EOF
sudo nginx -t && sudo systemctl reload nginx
```

---

## Step 7 — Per-subdomain nginx logs

So you can answer "did dolanan get traffic today?" without grepping referers.

Inside each `/etc/nginx/sites-available/<site>` `server {}` block, add:

```nginx
access_log /var/log/nginx/<site>.access.log;
error_log  /var/log/nginx/<site>.error.log warn;
```

e.g. for dolanan:

```nginx
access_log /var/log/nginx/dolanan.access.log;
error_log  /var/log/nginx/dolanan.error.log warn;
```

Then:

```bash
sudo nginx -t && sudo systemctl reload nginx
```

`logrotate` already globs `/var/log/nginx/*.log`, so new files auto-rotate.

---

## Step 8 — Cap Docker + journald log sizes

**Docker** (prevents another 2.3 GB finan-mongo log blow-up):

```bash
sudo tee /etc/docker/daemon.json > /dev/null <<'EOF'
{
  "log-driver": "json-file",
  "log-opts": { "max-size": "50m", "max-file": "3" }
}
EOF
sudo systemctl restart docker
```

Only applies to **new** containers. Recreate existing ones
(`docker compose up -d --force-recreate` in each app dir) to apply, and
truncate the existing oversized file:

```bash
sudo truncate -s 0 /var/lib/docker/containers/<container_id>*/*-json.log
```

**Journald** (924 MB → 200 MB cap):

```bash
sudo sed -i 's/^#SystemMaxUse=.*/SystemMaxUse=200M/' /etc/systemd/journald.conf
sudo systemctl restart systemd-journald
sudo journalctl --disk-usage   # confirms drop
```

---

## Step 9 — Unattended security updates

Already running. Confirm it's picking up security origins:

```bash
sudo cat /etc/apt/apt.conf.d/50unattended-upgrades | grep -A2 'Allowed-Origins'
sudo unattended-upgrade --dry-run -d 2>&1 | tail -20
```

Optional — auto-reboot for kernel updates at 3 AM:

```bash
sudo sed -i 's|//Unattended-Upgrade::Automatic-Reboot "false";|Unattended-Upgrade::Automatic-Reboot "true";|' \
  /etc/apt/apt.conf.d/50unattended-upgrades
sudo sed -i 's|//Unattended-Upgrade::Automatic-Reboot-Time "02:00";|Unattended-Upgrade::Automatic-Reboot-Time "03:00";|' \
  /etc/apt/apt.conf.d/50unattended-upgrades
```

---

## Step 10 — Cosmetic: nginx gzip duplicate warning

Remove `text/html` from `gzip_types` in these files (nginx already includes it
by default):

- `/etc/nginx/sites-available/dolanan.lori.my.id` (line 18)
- `/etc/nginx/sites-available/ethok.lori.my.id` (line 8)
- `/etc/nginx/sites-available/profile.lori.my.id` (line 8)

```bash
sudo nginx -t && sudo systemctl reload nginx
```

---

## Verification checklist

Run after each major step or at the end:

```bash
ssh server                                 # key-only login works
sudo ss -tlnp | grep -E ':22|:2222|:80|:443'   # expected ports only
sudo fail2ban-client status sshd            # active
sudo ufw status                             # active
curl -I https://dolanan.lori.my.id          # 200 OK over TLS
curl -I http://xx.xx.xx.xx --max-time 5   # times out (CF-only)
sudo nginx -t                               # no warnings
sudo journalctl --disk-usage                # ~200 MB
```

---

## Priorities if you only have 30 minutes

Steps **1 → 2 → 3** kill 95% of the attack surface.
Everything after is hygiene.
