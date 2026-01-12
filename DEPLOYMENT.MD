# SoyaFlow - Secure Production Deployment Guide

Complete deployment guide for deploying SoyaFlow to production on AWS EC2 with domain `soyaflow.com`.

> ⚠️ **SECURITY FIRST**: This guide prioritizes security hardening BEFORE application deployment. Following a January 2026 cryptominer incident, all deployments must implement security measures as the first step.

## Table of Contents

- [Prerequisites](#prerequisites)
- [Architecture Overview](#architecture-overview)
- [Security Checklist](#security-checklist)
- [Phase 1: Security Hardening](#phase-1-security-hardening)
- [Phase 2: Server Setup](#phase-2-server-setup)
- [Phase 3: Application Deployment](#phase-3-application-deployment)
- [Phase 4: SSL & Final Configuration](#phase-4-ssl--final-configuration)
- [Post-Deployment Verification](#post-deployment-verification)
- [Security Monitoring](#security-monitoring)
- [Incident Response](#incident-response)
- [Troubleshooting](#troubleshooting)
- [Maintenance](#maintenance)
- [Quick Reference](#quick-reference)

---

## Prerequisites

### Required Resources

| Resource | Value | Notes |
|----------|-------|-------|
| AWS EC2 Instance | Ubuntu 24.04 LTS | t3.medium or larger recommended |
| Elastic IP | 35.182.82.8 | Already associated |
| Domain | soyaflow.com | DNS must point to Elastic IP |
| SSH Key | soyaflow_key.pem | Keep secure, never commit to git |
| GitHub Repo | https://github.com/Amankrah/soya_excel.git | Verify clean before deployment |
| Your IP | 70.82.222.218 | For SSH firewall restriction |

### Your IP Address

Your public IP address for SSH restriction: **70.82.222.218**

```bash
# Verify your IP hasn't changed
curl -s ifconfig.me
# Should return: 70.82.222.218
```

### Recommended EC2 Instance Specs

| Spec | Minimum | Recommended |
|------|---------|-------------|
| Instance Type | t3.small | t3.medium |
| vCPU | 2 | 2-4 |
| RAM | 2 GB | 4 GB |
| Storage | 20 GB | 30 GB SSD |
| OS | Ubuntu 22.04 | Ubuntu 24.04 LTS |

### Security Group Configuration

Configure **before** launching instance:

| Type | Port | Source | Description |
|------|------|--------|-------------|
| SSH | 22 | Your IP/32 | SSH access (your IP only!) |
| HTTP | 80 | 0.0.0.0/0 | Web traffic |
| HTTPS | 443 | 0.0.0.0/0 | Secure web traffic |

⚠️ **Never** set SSH source to `0.0.0.0/0` (anywhere)

---

## Architecture Overview

```
                                    Internet
                                       │
                                  [Port 443 HTTPS]
                                       │
                              ┌────────┴────────┐
                              │  UFW Firewall   │
                              │  + fail2ban     │
                              └────────┬────────┘
                                       │
                                [Nginx Reverse Proxy]
                                       │
                    ┌──────────────────┴──────────────────┐
                    │                                      │
            [Django REST API]                      [Next.js Frontend]
            (/api/*, /admin)                       (All other routes)
                    │                                      │
              [Port 8000]                           [Port 3000]
                    │                                      │
            [Django + Gunicorn]  ◄────────────────  [Next.js Server]
            (Python REST API)      API Client       (React SSR)
                    │
                    ▼
            [PostgreSQL/SQLite]
            (Database)
            • Client management
            • Route optimization
            • Real-time tracking
```

### Technology Stack

| Layer | Technology | Purpose |
|-------|------------|---------|
| **Security** | UFW, fail2ban, auto-updates | Protection |
| **Frontend** | Next.js 15 + React 19 | User interface |
| **API Layer** | Django REST Framework | REST API |
| **Database** | SQLite (dev) / PostgreSQL (prod) | Data storage |
| **Web Server** | Nginx | Reverse proxy & SSL |
| **Process Manager** | Supervisor | Service management |
| **ASGI Server** | Gunicorn | Python WSGI HTTP Server |

---

## Security Checklist

Complete this checklist for every deployment:

### Pre-Deployment
- [ ] Verify your IP address for SSH restriction
- [ ] Check git repository is clean (`git status`)
- [ ] Run `npm audit` on frontend
- [ ] AWS Security Group restricts SSH to your IP
- [ ] Fresh EC2 instance (not reused from compromised server)

### During Deployment
- [ ] Security hardening runs FIRST (before app deployment)
- [ ] UFW firewall enabled with your IP only for SSH
- [ ] fail2ban installed and configured
- [ ] Automatic security updates enabled
- [ ] SSH hardened (key-only, no root login)
- [ ] Mining ports blocked (10128, 3333)
- [ ] Known attacker IPs blocked

### Post-Deployment
- [ ] Security check script installed and scheduled
- [ ] All services running via Supervisor
- [ ] SSL certificate installed
- [ ] DNS properly configured
- [ ] Test security monitoring script

---

## Phase 1: Security Hardening

> ⚠️ **CRITICAL**: Complete this phase BEFORE deploying the application!

### 1.1 Connect to Fresh EC2 Instance

```bash
# Set correct permissions for SSH key
chmod 400 soyaflow_key.pem

# Connect to EC2 instance
ssh -i soyaflow_key.pem ubuntu@35.182.82.8
```

### 1.2 System Updates

```bash
# Update system packages immediately
sudo apt update
sudo DEBIAN_FRONTEND=noninteractive apt upgrade -y
```

### 1.3 Install Security Tools

```bash
sudo apt install -y \
    fail2ban \
    ufw \
    unattended-upgrades \
    apt-listchanges \
    logwatch
```

### 1.4 Configure Firewall (UFW)

```bash
# Reset UFW to clean state
sudo ufw --force reset

# Set default policies
sudo ufw default deny incoming
sudo ufw default allow outgoing

# Allow SSH ONLY from your IP (70.82.222.218)
sudo ufw allow from 70.82.222.218 to any port 22 proto tcp comment 'SSH from my IP'

# Allow web traffic
sudo ufw allow 80/tcp comment 'HTTP'
sudo ufw allow 443/tcp comment 'HTTPS'

# Block known attacker IPs (from January 2026 incident)
sudo ufw deny from 38.150.0.118 comment 'Known attacker'
sudo ufw deny from 67.210.97.41 comment 'Known attacker'

# Block outbound connections to mining pools
sudo ufw deny out to any port 10128 comment 'Block mining pool'
sudo ufw deny out to any port 3333 comment 'Block mining pool'

# Enable firewall
sudo ufw --force enable

# Verify configuration
sudo ufw status verbose
```

**Expected output:**
```
Status: active

To                         Action      From
--                         ------      ----
22/tcp                     ALLOW       70.82.222.218
80/tcp                     ALLOW       Anywhere
443/tcp                    ALLOW       Anywhere
Anywhere                   DENY        38.150.0.118
Anywhere                   DENY        67.210.97.41
10128                      DENY OUT    Anywhere
3333                       DENY OUT    Anywhere
```

### 1.5 Configure fail2ban

```bash
sudo tee /etc/fail2ban/jail.local > /dev/null << 'EOF'
[DEFAULT]
bantime = 86400
findtime = 600
maxretry = 5
backend = systemd
banaction = ufw

[sshd]
enabled = true
port = ssh
filter = sshd
maxretry = 3
bantime = 86400
findtime = 600
EOF

sudo systemctl enable fail2ban
sudo systemctl restart fail2ban

# Verify fail2ban is running
sudo fail2ban-client status sshd
```

### 1.6 Configure Automatic Security Updates

```bash
sudo tee /etc/apt/apt.conf.d/20auto-upgrades > /dev/null << 'EOF'
APT::Periodic::Update-Package-Lists "1";
APT::Periodic::Unattended-Upgrade "1";
APT::Periodic::Download-Upgradeable-Packages "1";
APT::Periodic::AutocleanInterval "7";
EOF

sudo tee /etc/apt/apt.conf.d/50unattended-upgrades > /dev/null << 'EOF'
Unattended-Upgrade::Allowed-Origins {
    "${distro_id}:${distro_codename}";
    "${distro_id}:${distro_codename}-security";
    "${distro_id}ESMApps:${distro_codename}-apps-security";
    "${distro_id}ESM:${distro_codename}-infra-security";
};
Unattended-Upgrade::AutoFixInterruptedDpkg "true";
Unattended-Upgrade::MinimalSteps "true";
Unattended-Upgrade::Remove-Unused-Kernel-Packages "true";
Unattended-Upgrade::Remove-Unused-Dependencies "true";
Unattended-Upgrade::Automatic-Reboot "false";
EOF

sudo systemctl enable unattended-upgrades
sudo systemctl start unattended-upgrades
```

### 1.7 SSH Hardening

```bash
sudo tee /etc/ssh/sshd_config.d/hardening.conf > /dev/null << 'EOF'
# Disable root login
PermitRootLogin no

# Disable password authentication (key-only)
PasswordAuthentication no
PubkeyAuthentication yes

# Limit authentication attempts
MaxAuthTries 3

# Disconnect idle sessions
ClientAliveInterval 300
ClientAliveCountMax 2

# Disable forwarding
X11Forwarding no
AllowTcpForwarding no
AllowAgentForwarding no

# Other security settings
PermitEmptyPasswords no
ChallengeResponseAuthentication no
UsePAM yes
EOF

# Test configuration before applying
sudo sshd -t

# If test passes, restart SSH
sudo systemctl restart sshd || sudo systemctl restart ssh
```

### 1.8 Install Security Monitoring Script

```bash
sudo tee /usr/local/bin/security-check.sh > /dev/null << 'EOFSCRIPT'
#!/bin/bash

echo "=== Security Check $(date) ==="

echo -e "\n--- Crontabs ---"
for user in $(cut -f1 -d: /etc/passwd); do
    crontab -u $user -l 2>/dev/null | grep -v "^#" | grep -v "^$" && echo "  ^ User: $user"
done

echo -e "\n--- Suspicious processes ---"
ps aux | grep -E "(javae|xmrig|mine|pnscan|cc.txt|kdevtmpfsi|immunify|/dev/shm/|/var/tmp/\\.)" | grep -v grep || echo "None found"

echo -e "\n--- High CPU processes ---"
ps aux --sort=-%cpu | head -5

echo -e "\n--- Failed SSH attempts (last 24h) ---"
sudo grep "Failed password\|Invalid user" /var/log/auth.log 2>/dev/null | tail -10 || echo "None"

echo -e "\n--- fail2ban status ---"
sudo fail2ban-client status sshd 2>/dev/null || echo "fail2ban not running"

echo -e "\n--- Hidden directories in /tmp and /var/tmp ---"
find /tmp /var/tmp -name ".*" -type d 2>/dev/null | grep -v -E "^\.(X11|ICE|font|XIM)-unix$" || echo "None"

echo -e "\n--- Listening ports ---"
sudo ss -tlnp

echo -e "\n--- SSH authorized_keys ---"
cat ~/.ssh/authorized_keys 2>/dev/null | cut -d' ' -f3

echo -e "\n--- Shell config sizes ---"
ls -la ~/.bashrc ~/.profile ~/.bash_profile 2>/dev/null

echo -e "\n=== Check Complete ==="
EOFSCRIPT

sudo chmod +x /usr/local/bin/security-check.sh

# Schedule weekly security check (Mondays at 8 AM)
(crontab -l 2>/dev/null | grep -v "security-check.sh"; echo "0 8 * * 1 /usr/local/bin/security-check.sh >> /var/log/security-check.log 2>&1") | crontab -
```

### 1.9 Configure Temp Directory Cleanup

```bash
sudo tee /etc/tmpfiles.d/tmp-clean.conf > /dev/null << 'EOF'
# Clean temp directories automatically
D /tmp 1777 root root 1d
D /var/tmp 1777 root root 7d
D /dev/shm 1777 root root 1d
EOF
```

### 1.10 Verify Security Hardening

```bash
# Run security check
sudo /usr/local/bin/security-check.sh

# Verify firewall
sudo ufw status verbose

# Verify fail2ban
sudo fail2ban-client status sshd

# Verify SSH config
sudo sshd -T | grep -E "(permitrootlogin|passwordauthentication|maxauthtries)"
```

✅ **Security hardening complete!** Now proceed to Phase 2.

---

## Phase 2: Server Setup

### 2.1 Install System Dependencies

```bash
sudo apt install -y \
    python3-pip python3-venv python3-dev \
    nginx supervisor certbot python3-certbot-nginx \
    curl wget git build-essential \
    pkg-config libssl-dev \
    postgresql postgresql-contrib libpq-dev \
    redis-server \
    jq htop
```

### 2.2 Install Node.js 20.x

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# Verify installation
node --version
npm --version
```

### 2.3 Configure PostgreSQL (Recommended for production)

```bash
# Start PostgreSQL
sudo systemctl start postgresql
sudo systemctl enable postgresql

# Note: Database will be created in section 3.3 after .env file is generated
# This ensures the secure password from .env is used
```

### 2.4 Configure Redis (for WebSocket support)

```bash
sudo systemctl start redis-server
sudo systemctl enable redis-server

# Verify Redis is running
redis-cli ping
# Should return: PONG
```

### 2.5 Configure Timezone (Optional)

```bash
sudo timedatectl set-timezone America/Toronto
timedatectl
```

---

## Phase 3: Application Deployment

### 3.1 Clone Repository

```bash
# Create project directory
sudo mkdir -p /var/www/soyaflow
sudo chown $USER:$USER /var/www/soyaflow

# Clone repository
cd /var/www
git clone https://github.com/Amankrah/soya_excel.git soyaflow
cd soyaflow

# Verify structure
ls -la
# Should see: backend, frontend, ml, ml_training, etc.
```

### 3.2 Setup Django Backend

```bash
cd /var/www/soyaflow/backend

# Create virtual environment
python3 -m venv venv
source venv/bin/activate

# Install dependencies
pip install --upgrade pip
pip install -r requirements.txt

# Install production server
pip install gunicorn



### 3.3 Configure Django Environment

```bash
cd /var/www/soyaflow/backend

# Create .env file for production (using PostgreSQL)
cat > .env << EOF
# Django Settings
DJANGO_SECRET_KEY=$(python3 -c 'from django.core.management.utils import get_random_secret_key; print(get_random_secret_key())')
DJANGO_DEBUG=False
DJANGO_ALLOWED_HOSTS=soyaflow.com,www.soyaflow.com,35.182.82.8

# Database Configuration (PostgreSQL - recommended for production)
DATABASE_ENGINE=postgresql
DB_NAME=soyaflow_db
DB_USER=soyaflow_user
DB_PASSWORD=$(openssl rand -base64 32)
DB_HOST=localhost
DB_PORT=5432

# CORS Settings (comma-separated, no spaces)
CORS_ALLOWED_ORIGINS=https://soyaflow.com,https://www.soyaflow.com

# Google Maps API
GOOGLE_MAPS_API_KEY=AIzaSyCUXuIdWXdaKS7xCR2CVKoTQIyyF6VuSLY

# Redis (for WebSocket and Celery)
REDIS_URL=redis://localhost:6379/0

# Static and Media Files
STATIC_ROOT=/var/www/soyaflow/backend/staticfiles
MEDIA_ROOT=/var/www/soyaflow/backend/media

# Email Configuration (Optional)
EMAIL_BACKEND=django.core.mail.backends.console.EmailBackend
ADMIN_EMAIL=dishdevinfo@gmail.com
EOF

# Deactivate for now
deactivate


# Secure the .env file
chmod 600 .env

# Save the generated DB password for PostgreSQL setup
DB_PASSWORD=$(grep DB_PASSWORD .env | cut -d'=' -f2)

# Create PostgreSQL database and user
sudo -u postgres psql << EOF
CREATE DATABASE soyaflow_db;
CREATE USER soyaflow_user WITH PASSWORD '$DB_PASSWORD';
ALTER ROLE soyaflow_user SET client_encoding TO 'utf8';
ALTER ROLE soyaflow_user SET default_transaction_isolation TO 'read committed';
ALTER ROLE soyaflow_user SET timezone TO 'UTC';
GRANT ALL PRIVILEGES ON DATABASE soyaflow_db TO soyaflow_user;
\q
EOF

echo "✅ PostgreSQL database created successfully"
```

### 3.4 Verify Production Settings

The repository already includes a production_settings.py file that:

- Reads configuration from .env file using python-decouple
- Configures PostgreSQL database automatically
- Sets security headers (HTTPS, HSTS, XSS protection, etc.)
- Configures CORS for production domains
- Sets up logging with rotation
- Optimizes template caching

```bash
cd /var/www/soyaflow/backend

# Verify production settings file exists
ls -la soya_excel_backend/production_settings.py

# Verify .env.example exists
ls -la .env.example

# The production settings will use the .env file we created in section 3.3
```

**Key Features of production_settings.py:**

- ✅ PostgreSQL database configuration (using DB_ variables from .env)
- ✅ Security headers for HTTPS
- ✅ CORS configuration for production domains
- ✅ Static file serving configuration
- ✅ Logging with file rotation
- ✅ Email configuration (optional)
- ✅ Template caching optimization

### 3.5 Run Django Setup

```bash
cd /var/www/soyaflow/backend
source venv/bin/activate

# Set production settings
export DJANGO_SETTINGS_MODULE=soya_excel_backend.production_settings

# Run migrations
python manage.py migrate

# Collect static files
python manage.py collectstatic --noinput

# Create superuser (interactive)
python manage.py createsuperuser

deactivate
```

### 3.5.1 Verify MFA Setup

The backend includes Multi-Factor Authentication (MFA) support. Verify the setup:

```bash
cd /var/www/soyaflow/backend
source venv/bin/activate

# Verify MFA migration was applied
python manage.py showmigrations manager
# Should show:
#   [X] 0001_initial
#   [X] 0002_add_mfa_fields

# Verify MFA dependencies are installed
python -c "import pyotp; import qrcode; print('✅ MFA dependencies installed')"

# Test MFA endpoint (should return 401 without auth)
curl -s http://localhost:8000/api/auth/mfa/setup/ | head -1

deactivate
```

**MFA Features Included:**

- Password change endpoint (`/api/auth/change-password/`)
- MFA setup with QR code (`/api/auth/mfa/setup/`)
- MFA verification (`/api/auth/mfa/verify-setup/`)
- MFA login flow (`/api/auth/mfa/verify-login/`)
- MFA disable (`/api/auth/mfa/disable/`)

**Security Notes:**

- Managers can enable 2FA from the dashboard settings
- Compatible with Google Authenticator, Authy, Microsoft Authenticator
- MFA codes expire every 30 seconds
- Password changes require current password verification
- MFA secret keys are stored securely in the database

### 3.5.2 Run Required Management Commands

After migrations, run these essential management commands to set up the application:

```bash
cd /var/www/soyaflow/backend
source venv/bin/activate

# Set production settings
export DJANGO_SETTINGS_MODULE=soya_excel_backend.production_settings

# 1. Create test manager account (optional - for testing)
python manage.py create_test_manager
# Creates: username=testmanager, password=Pass_1234

# 2. Setup primary warehouse (REQUIRED)
python manage.py setup_warehouse
# Creates the main Soya Excel warehouse with geocoding
# Location: 2457 4e Rang S, Saint-Charles-sur-Richelieu, QC

# 3. Geocode client addresses (REQUIRED if you have clients)
# Note: Requires GOOGLE_MAPS_API_KEY in .env
python manage.py geocode_client_addresses --limit 100
# Options:
#   --force: Re-geocode all addresses
#   --country Canada: Only geocode specific country
#   --limit 100: Limit number of addresses to process
#   --async: Use async batch processing (faster)
#   --dry-run: Show what would be processed without making changes

# 4. Update AI predictions (REQUIRED for reorder predictions)
# Note: Only works after clients and orders are loaded
python manage.py update_predictions
# Options:
#   --client-id 123: Update specific client only
#   --show-upcoming 7: Show clients expected to reorder in next N days
#   --verbose: Show detailed failure information
#   --clear-stale: Remove predictions that can't be updated

deactivate
```

**Command Details:**

1. **create_test_manager**: Creates a test manager account for initial testing
   - Username: `testmanager`
   - Password: `Pass_1234`
   - Can be deleted later via Django admin

2. **setup_warehouse**: Creates the primary warehouse with geocoded coordinates
   - Required for route optimization
   - Uses Google Maps API for geocoding
   - Idempotent (safe to run multiple times)

3. **geocode_client_addresses**: Adds GPS coordinates to client addresses
   - Required for route planning and mapping
   - Processes clients in batches to avoid API rate limits
   - Recommend using `--async` flag for better performance
   - Can resume if interrupted (only processes clients without coordinates)

4. **update_predictions**: Updates AI reorder predictions for all clients
   - Uses XGBoost ML model
   - Model files should be in `model_deployment_xgboost/`
   - Predictions help prioritize which clients to contact
   - Should be run regularly (daily recommended)

**Scheduling Predictions (Optional but Recommended):**

Set up a cron job to update predictions daily:

```bash
# Edit crontab
crontab -e

# Add this line to run predictions daily at 2 AM
0 2 * * * cd /var/www/soyaflow/backend && source venv/bin/activate && DJANGO_SETTINGS_MODULE=soya_excel_backend.production_settings python manage.py update_predictions --clear-stale >> /var/log/soyaflow-predictions.log 2>&1
```

### 3.6 Build Frontend

```bash
cd /var/www/soyaflow/frontend

# Create production environment file
# Reference: See frontend/.env.example for all available options
cat > .env.production.local << EOF
NEXT_PUBLIC_API_URL=https://soyaflow.com/api
NEXT_PUBLIC_SITE_URL=https://soyaflow.com
NEXT_PUBLIC_DOMAIN=soyaflow.com
NEXT_PUBLIC_GOOGLE_MAPS_API_KEY=AIzaSyCUXuIdWXdaKS7xCR2CVKoTQIyyF6VuSLY
EOF

# Secure the .env file
chmod 600 .env.production.local

# Clear any previous builds
rm -rf .next node_modules/.cache

# Install dependencies
npm ci

# Build for production
npm run build
```

**Build time:** 2-5 minutes

### 3.7 Configure Nginx

```bash
sudo tee /etc/nginx/sites-available/soyaflow.com > /dev/null << 'EOF'
# Rate limiting zones
limit_req_zone $binary_remote_addr zone=api_limit:10m rate=10r/s;
limit_req_zone $binary_remote_addr zone=general_limit:10m rate=30r/s;
limit_conn_zone $binary_remote_addr zone=conn_limit:10m;

# Upstream definitions
upstream django_backend {
    server 127.0.0.1:8000 fail_timeout=30s;
    keepalive 32;
}

upstream nextjs_frontend {
    server 127.0.0.1:3000 fail_timeout=30s;
    keepalive 32;
}

# Block direct IP access
server {
    listen 80 default_server;
    listen [::]:80 default_server;
    server_name _;
    return 444;
}

# Main server block
server {
    listen 80;
    listen [::]:80;
    server_name soyaflow.com www.soyaflow.com;

    # Let's Encrypt challenge
    location /.well-known/acme-challenge/ {
        root /var/www/html;
    }

    # Security headers
    add_header X-Frame-Options DENY always;
    add_header X-Content-Type-Options nosniff always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;

    client_max_body_size 20M;

    # Common proxy settings
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_redirect off;
    proxy_read_timeout 300;
    proxy_connect_timeout 300;
    proxy_send_timeout 300;

    # Django static files
    location /static/ {
        alias /var/www/soyaflow/backend/staticfiles/;
        expires 1y;
        add_header Cache-Control "public, immutable";
        access_log off;
    }

    # Django media files
    location /media/ {
        alias /var/www/soyaflow/backend/media/;
        expires 1y;
        add_header Cache-Control "public";
    }

    # Django admin
    location /admin {
        limit_req zone=api_limit burst=10 nodelay;
        proxy_pass http://django_backend;
    }

    location /admin/ {
        limit_req zone=api_limit burst=10 nodelay;
        proxy_pass http://django_backend;
    }

    # API endpoints
    location /api/ {
        limit_req zone=api_limit burst=20 nodelay;
        limit_conn conn_limit 10;
        proxy_pass http://django_backend;
    }

    location /api {
        limit_req zone=api_limit burst=20 nodelay;
        proxy_pass http://django_backend;
    }

    # WebSocket support (for real-time tracking)
    location /ws/ {
        proxy_pass http://django_backend;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }

    # Next.js static files
    location /_next/static/ {
        proxy_pass http://nextjs_frontend;
        expires 1y;
        add_header Cache-Control "public, immutable";
        access_log off;
    }

    # Frontend (all other routes)
    location / {
        limit_req zone=general_limit burst=50 nodelay;
        proxy_pass http://nextjs_frontend;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_cache_bypass $http_upgrade;
    }

    # Error pages
    error_page 502 503 504 /50x.html;
    location = /50x.html {
        root /var/www/html;
        internal;
    }
}
EOF

# Enable site
sudo ln -sf /etc/nginx/sites-available/soyaflow.com /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default

# Test configuration
sudo nginx -t
```

### 3.8 Create Error Page

```bash
sudo mkdir -p /var/www/html
sudo tee /var/www/html/50x.html > /dev/null << 'EOF'
<!DOCTYPE html>
<html>
<head>
    <title>SoyaFlow - Service Temporarily Unavailable</title>
    <style>
        body {
            font-family: -apple-system, sans-serif;
            text-align: center;
            margin-top: 100px;
            background: linear-gradient(135deg, #3b82f6, #8b5cf6);
            color: white;
            padding: 20px;
        }
        .container {
            background: rgba(255,255,255,0.1);
            border-radius: 20px;
            padding: 40px;
            max-width: 600px;
            margin: 0 auto;
        }
    </style>
</head>
<body>
    <div class="container">
        <h1>🚚 SoyaFlow</h1>
        <h2>Service Temporarily Unavailable</h2>
        <p>Our services are starting up. Please try again in a moment.</p>
    </div>
</body>
</html>
EOF
```

### 3.9 Configure Supervisor

```bash
# Get paths
VENV_DIR="/var/www/soyaflow/backend/venv"
BACKEND_DIR="/var/www/soyaflow/backend"
FRONTEND_DIR="/var/www/soyaflow/frontend"
NPM_PATH=$(which npm)

# Django backend configuration
sudo tee /etc/supervisor/conf.d/soyaflow-backend.conf > /dev/null << EOF
[program:soyaflow-backend]
command=$VENV_DIR/bin/gunicorn soya_excel_backend.wsgi:application --bind 127.0.0.1:8000 --workers 4 --timeout 120 --access-logfile - --error-logfile -
directory=$BACKEND_DIR
user=$USER
autostart=true
autorestart=true
redirect_stderr=true
stdout_logfile=/var/log/soyaflow-backend.log
stderr_logfile=/var/log/soyaflow-backend-error.log
environment=PATH="$VENV_DIR/bin:/usr/local/bin:/usr/bin:/bin",DJANGO_SETTINGS_MODULE="soya_excel_backend.production_settings",PYTHONPATH="$BACKEND_DIR"
stopwaitsecs=60
stopsignal=QUIT
stopasgroup=true
killasgroup=true
EOF

# Frontend configuration
sudo tee /etc/supervisor/conf.d/soyaflow-frontend.conf > /dev/null << EOF
[program:soyaflow-frontend]
command=$NPM_PATH start
directory=$FRONTEND_DIR
user=$USER
autostart=true
autorestart=true
redirect_stderr=true
stdout_logfile=/var/log/soyaflow-frontend.log
stderr_logfile=/var/log/soyaflow-frontend-error.log
environment=NODE_ENV="production",PORT="3000"
stopwaitsecs=60
stopsignal=KILL
stopasgroup=true
killasgroup=true
EOF

# Create log files
sudo touch /var/log/soyaflow-{backend,backend-error,frontend,frontend-error}.log
sudo chown $USER:$USER /var/log/soyaflow-*.log
```

### 3.10 Start Services

```bash
# Enable and start services
sudo systemctl enable nginx supervisor

# Load supervisor configurations
sudo supervisorctl reread
sudo supervisorctl update

# Start nginx
sudo systemctl start nginx

# Start application services
sudo supervisorctl start all

# Wait for services to initialize
sleep 10

# Check status
sudo supervisorctl status
```

**Expected output:**
```
soyaflow-backend    RUNNING   pid 12345, uptime 0:00:10
soyaflow-frontend   RUNNING   pid 12346, uptime 0:00:10
```

---

## Phase 4: SSL & Final Configuration

### 4.1 Verify DNS Configuration

Before requesting SSL certificate, verify DNS:

```bash
# Check DNS resolution
dig soyaflow.com
dig www.soyaflow.com

# Should return 35.182.82.8
```

If DNS is not propagated yet, wait before proceeding with SSL.

### 4.2 Request SSL Certificate

```bash
# Download certbot configuration files
sudo mkdir -p /etc/letsencrypt
if [ ! -f "/etc/letsencrypt/options-ssl-nginx.conf" ]; then
    sudo curl -s https://raw.githubusercontent.com/certbot/certbot/master/certbot-nginx/certbot_nginx/_internal/tls_configs/options-ssl-nginx.conf -o /etc/letsencrypt/options-ssl-nginx.conf
    sudo curl -s https://raw.githubusercontent.com/certbot/certbot/master/certbot/certbot/ssl-dhparams.pem -o /etc/letsencrypt/ssl-dhparams.pem
fi

# Request certificate
sudo certbot --nginx \
    -d soyaflow.com \
    -d www.soyaflow.com \
    --non-interactive \
    --agree-tos \
    --email dishdevinfo@gmail.com \
    --redirect

# Verify certificate
sudo certbot certificates
```

### 4.3 Setup SSL Auto-Renewal

```bash
# Add renewal to root crontab
(sudo crontab -l 2>/dev/null | grep -v "certbot renew"; echo "0 12 * * * /usr/bin/certbot renew --quiet && systemctl reload nginx") | sudo crontab -

# Test renewal process
sudo certbot renew --dry-run
```

### 4.4 Create Utility Scripts

#### Update Script

```bash
sudo tee /usr/local/bin/soyaflow-update.sh > /dev/null << 'EOF'
#!/bin/bash
set -e

echo "🔄 Updating SoyaFlow..."

cd /var/www/soyaflow
git pull origin main

# Update backend
echo "Updating Django backend..."
cd backend
source venv/bin/activate
pip install -r requirements.txt
python manage.py migrate
python manage.py collectstatic --noinput
deactivate

# Rebuild frontend
echo "Rebuilding frontend..."
cd ../frontend
npm ci
npm run build

# Restart services
echo "Restarting services..."
sudo supervisorctl restart all
sudo systemctl reload nginx

echo "✅ Update complete!"
EOF

sudo chmod +x /usr/local/bin/soyaflow-update.sh
```

#### Status Script

```bash
sudo tee /usr/local/bin/soyaflow-status.sh > /dev/null << 'EOF'
#!/bin/bash
echo "=== SoyaFlow Status ==="
echo ""
echo "📊 Services:"
sudo supervisorctl status
echo ""
echo "🔒 Firewall:"
sudo ufw status | head -15
echo ""
echo "🛡️ fail2ban:"
sudo fail2ban-client status sshd 2>/dev/null | grep -E "(Currently|Total)" || echo "Not running"
echo ""
echo "💾 Disk:"
df -h / | tail -1
echo ""
echo "🧠 Memory:"
free -h | grep Mem
echo ""
echo "⚡ CPU (top 3):"
ps aux --sort=-%cpu | head -4
EOF

sudo chmod +x /usr/local/bin/soyaflow-status.sh
```

#### Backup Script

```bash
sudo tee /usr/local/bin/soyaflow-backup.sh > /dev/null << 'EOF'
#!/bin/bash
BACKUP_DIR="/var/backups/soyaflow"
DATE=$(date +%Y%m%d_%H%M%S)
mkdir -p $BACKUP_DIR

# Backup database
cd /var/www/soyaflow/backend
source venv/bin/activate
python manage.py dumpdata --natural-foreign --natural-primary -e contenttypes -e auth.Permission > $BACKUP_DIR/db_backup_$DATE.json
deactivate

# Backup project directory (excluding venv, node_modules)
tar --exclude='venv' \
    --exclude='node_modules' \
    --exclude='.next' \
    --exclude='__pycache__' \
    --exclude='*.pyc' \
    -czf $BACKUP_DIR/project_backup_$DATE.tar.gz \
    /var/www/soyaflow

# Keep only last 7 days of backups
find $BACKUP_DIR -name "*_backup_*.tar.gz" -mtime +7 -delete
find $BACKUP_DIR -name "db_backup_*.json" -mtime +7 -delete

echo "Backup completed: project_backup_$DATE.tar.gz"
EOF

sudo chmod +x /usr/local/bin/soyaflow-backup.sh

# Schedule daily backup at 2 AM
(sudo crontab -l 2>/dev/null | grep -v "soyaflow-backup"; echo "0 2 * * * /usr/local/bin/soyaflow-backup.sh >> /var/log/soyaflow-backup.log 2>&1") | sudo crontab -
```

---

## Post-Deployment Verification

### 5.1 Service Health Check

```bash
# Check all services
sudo supervisorctl status

# Test Django backend health
curl -f http://localhost:8000/api/ && echo " ✅ Django OK" || echo " ❌ Django FAILED"

# Test frontend
curl -f http://localhost:3000 > /dev/null && echo "✅ Frontend OK" || echo "❌ Frontend FAILED"

# Test via domain (after DNS propagation)
curl -f https://soyaflow.com && echo " ✅ HTTPS OK" || echo " ❌ HTTPS FAILED"
```

### 5.2 Security Verification

```bash
# Run security check
sudo /usr/local/bin/security-check.sh

# Verify only your SSH key is present
cat ~/.ssh/authorized_keys

# Verify firewall rules
sudo ufw status verbose

# Check for any suspicious processes
ps aux | grep -E "(xmrig|mine|javae|cc.txt)" | grep -v grep
```

### 5.3 Performance Verification

```bash
# Test API response time
time curl -s https://soyaflow.com/api/

# Should return in <500ms
```

---

## Security Monitoring

### Daily Checks

```bash
# Quick status
soyaflow-status.sh

# Check fail2ban
sudo fail2ban-client status sshd

# Check recent logins
last -a | head -10
```

### Weekly Checks

The security check script runs automatically every Monday at 8 AM. Review the log:

```bash
cat /var/log/security-check.log
```

### Signs of Compromise

Watch for these indicators:

| Indicator | How to Check | Action |
|-----------|--------------|--------|
| High CPU usage | `htop` | Investigate process, kill if suspicious |
| Unknown cron jobs | `crontab -l` | Remove malicious entries |
| Unknown SSH keys | `cat ~/.ssh/authorized_keys` | Remove unauthorized keys |
| Suspicious processes | `ps aux \| grep -E "(mine\|xmrig)"` | Kill and investigate |
| Hidden directories | `find /tmp /var/tmp -name ".*" -type d` | Remove malware |
| Network connections to mining pools | `sudo ss -tupn \| grep -E ":10128\|:3333"` | Block and investigate |

---

## Incident Response

If you suspect a compromise, follow these steps:

### Immediate Actions

```bash
# 1. Check for suspicious processes
ps aux --sort=-%cpu | head -10

# 2. Check crontabs
crontab -l

# 3. Check SSH keys
cat ~/.ssh/authorized_keys

# 4. Kill any suspicious processes
sudo pkill -9 -f "suspicious_process_name"

# 5. Remove malicious cron entries
crontab -r  # Removes all - recreate legitimate ones after
```

### If Malware Found

```bash
# 1. Kill all suspicious processes
sudo pkill -9 -f "javae|xmrig|kdevtmpfsi|cc.txt|/dev/shm/|/var/tmp/\\."

# 2. Remove malicious files
sudo rm -rf /tmp/cc.txt /var/tmp/.* /dev/shm/*

# 3. Check and restore crontab
crontab -r
(echo "0 8 * * 1 /usr/local/bin/security-check.sh >> /var/log/security-check.log 2>&1") | crontab -

# 4. Verify SSH keys - keep only your key
echo "your-ssh-public-key-here" > ~/.ssh/authorized_keys
chmod 600 ~/.ssh/authorized_keys

# 5. Run security check
sudo /usr/local/bin/security-check.sh
```

### When to Rebuild

Consider terminating and rebuilding the instance if:

- Malware keeps returning after cleanup
- You cannot identify the persistence mechanism
- Root access may have been compromised
- You're unsure of the full extent of the breach

---

## Troubleshooting

### Services Not Starting

```bash
# Check Django logs
sudo tail -f /var/log/soyaflow-backend.log

# Check frontend logs
sudo tail -f /var/log/soyaflow-frontend.log

# Restart services
sudo supervisorctl restart all
```

### 502 Bad Gateway

```bash
# Check if backend services are running
sudo supervisorctl status

# Check what's using ports
sudo lsof -i :8000
sudo lsof -i :3000

# Restart services
sudo supervisorctl restart soyaflow-backend
sudo supervisorctl restart soyaflow-frontend
```

### SSL Issues

```bash
# Check certificate status
sudo certbot certificates

# Renew manually
sudo certbot renew

# Test renewal
sudo certbot renew --dry-run
```

### Nginx Issues

```bash
# Test configuration
sudo nginx -t

# View error log
sudo tail -f /var/log/nginx/error.log

# Restart nginx
sudo systemctl restart nginx
```

### Database Issues

```bash
# Check migrations
cd /var/www/soyaflow/backend
source venv/bin/activate
python manage.py showmigrations
python manage.py migrate
```

---

## Maintenance

### Updating the Application

```bash
# Use the update script
sudo /usr/local/bin/soyaflow-update.sh
```

### Updating Only Frontend

```bash
cd /var/www/soyaflow/frontend
git pull
npm ci && npm run build
sudo supervisorctl restart soyaflow-frontend
```

### Updating Only Backend

```bash
cd /var/www/soyaflow/backend
git pull
source venv/bin/activate
pip install -r requirements.txt
python manage.py migrate
python manage.py collectstatic --noinput
deactivate
sudo supervisorctl restart soyaflow-backend
```

### System Updates

```bash
# Monthly system update
sudo apt update
sudo apt upgrade -y

# Restart services after updates
sudo supervisorctl restart all
```

### Cache Cleanup

Clean cache files to free disk space and ensure fresh builds:

```bash
# Clean Python cache files
cd /var/www/soyaflow/backend
find . -type d -name "__pycache__" -exec rm -rf {} + 2>/dev/null
find . -type f \( -name "*.pyc" -o -name "*.pyo" \) -delete 2>/dev/null
echo "✓ Python cache cleaned"

# Clean frontend cache
cd /var/www/soyaflow/frontend
rm -rf .next .turbo node_modules/.cache
echo "✓ Frontend cache cleaned"

# Clean system temp files (optional)
sudo apt clean
sudo apt autoclean
sudo journalctl --vacuum-time=7d
echo "✓ System cache cleaned"
```

**When to run cache cleanup:**

- After major updates or deployments
- When experiencing build issues
- To free disk space
- Before creating backups

**Note:** Frontend cache (.next) will be regenerated on next build. Backend cache (**pycache**) regenerates automatically on next Python import.

---

## Quick Reference

### Important Paths

```
/var/www/soyaflow/                              # Project root
├── backend/                                    # Django application
│   ├── manage.py                              # Django management
│   ├── venv/                                  # Python virtual environment
│   ├── .env                                   # Backend configuration
│   ├── soya_excel_backend/                    # Django project settings
│   ├── clients/                               # Clients app
│   ├── route/                                 # Route optimization app
│   ├── driver/                                # Driver management app
│   ├── manager/                               # Manager app
│   ├── staticfiles/                           # Collected static files
│   └── media/                                 # User uploads
├── frontend/                                   # Next.js frontend
│   ├── .next/                                 # Production build
│   └── .env.production.local                  # Frontend configuration
├── ml/                                         # Machine learning models
└── ml_training/                                # ML training scripts

/etc/nginx/sites-available/soyaflow.com         # Nginx configuration
/etc/supervisor/conf.d/soyaflow-*.conf          # Supervisor configurations
/var/log/soyaflow-*.log                         # Application logs
/var/log/security-check.log                     # Security scan logs
/usr/local/bin/security-check.sh                # Security monitoring script
/usr/local/bin/soyaflow-update.sh               # Update script
/usr/local/bin/soyaflow-status.sh               # Status script
```

### Essential Commands

```bash
# Status
sudo supervisorctl status
soyaflow-status.sh

# Restart everything
sudo supervisorctl restart all && sudo systemctl reload nginx

# View logs
sudo tail -f /var/log/soyaflow-backend.log
sudo tail -f /var/log/soyaflow-frontend.log

# Update application
sudo /usr/local/bin/soyaflow-update.sh

# Security check
sudo /usr/local/bin/security-check.sh

# Backup
sudo /usr/local/bin/soyaflow-backup.sh

# SSL check
sudo certbot certificates

# Django management
cd /var/www/soyaflow/backend
source venv/bin/activate
python manage.py <command>
```

### Firewall Management

```bash
# Check status
sudo ufw status verbose

# Add your new IP if it changes
sudo ufw allow from NEW_IP to any port 22
sudo ufw delete allow from OLD_IP to any port 22
```

---

## Deployment Checklist

### Before Deployment
- [ ] Your IP noted for SSH restriction
- [ ] Git repository verified clean
- [ ] `npm audit` run on frontend
- [ ] AWS Security Group restricts SSH to your IP
- [ ] Fresh EC2 instance launched

### Phase 1: Security
- [ ] System updated
- [ ] Security tools installed
- [ ] UFW firewall configured (SSH restricted to your IP)
- [ ] fail2ban configured
- [ ] Auto-updates enabled
- [ ] SSH hardened
- [ ] Security monitoring script installed

### Phase 2: Dependencies
- [ ] Python installed
- [ ] Node.js installed
- [ ] Nginx installed
- [ ] Supervisor installed
- [ ] PostgreSQL installed (optional)
- [ ] Redis installed

### Phase 3: Application
- [ ] Repository cloned
- [ ] Django backend configured
- [ ] Python dependencies installed
- [ ] Database migrations run
- [ ] Static files collected
- [ ] Frontend built
- [ ] Nginx configured
- [ ] Supervisor configured
- [ ] Services running

### Phase 4: SSL
- [ ] DNS propagated
- [ ] SSL certificate installed
- [ ] Auto-renewal configured
- [ ] Utility scripts created

### Verification
- [ ] Backend API responds
- [ ] Frontend loads
- [ ] Security check passes
- [ ] No suspicious processes
- [ ] Only your SSH key present

---

## Support

### Technical Contact
- **Domain**: soyaflow.com
- **Elastic IP**: 35.182.82.8

### Resources
- **Django Docs**: https://docs.djangoproject.com/
- **Django REST Framework**: https://www.django-rest-framework.org/
- **Next.js Docs**: https://nextjs.org/docs

---

**Guide Version:** 2.0 (SoyaFlow Security-Hardened Edition)
**Last Updated:** January 2026
**Platform:** SoyaFlow - Route Optimization & Client Management System

---

_Built for efficient delivery operations_
