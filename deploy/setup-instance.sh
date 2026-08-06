#!/usr/bin/env bash
# Run this ON the Lightsail/EC2 Ubuntu instance after SSH.
# Usage: curl -fsSL ... | bash   OR   bash setup-instance.sh
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
APP_DIR="${APP_DIR:-$REPO_ROOT}"
PORT="${PORT:-3000}"

if [ ! -f "$APP_DIR/Dockerfile" ]; then
  echo "No Dockerfile in $APP_DIR"
  echo "Clone/scp the bot repo, then run: bash deploy/setup-instance.sh"
  exit 1
fi

echo "==> App directory: $APP_DIR"
echo "==> Installing Docker..."
if ! command -v docker >/dev/null 2>&1; then
  sudo apt-get update -y
  sudo apt-get install -y ca-certificates curl gnupg
  sudo install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
  sudo chmod a+r /etc/apt/keyrings/docker.gpg
  echo \
    "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu \
    $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | \
    sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
  sudo apt-get update -y
  sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin
  sudo usermod -aG docker "$USER" || true
fi

cd "$APP_DIR"

echo "==> Building image (Playwright + Chromium — may take a few minutes)..."
sudo docker build -t form-bot .

echo "==> Stopping any old container..."
sudo docker rm -f form-bot 2>/dev/null || true

echo "==> Starting form-bot on port $PORT..."
sudo docker run -d \
  --name form-bot \
  --restart unless-stopped \
  -p "${PORT}:3000" \
  -e HEADLESS=true \
  -e PORT=3000 \
  form-bot

PUBLIC_IP="$(curl -fsSL http://checkip.amazonaws.com 2>/dev/null || hostname -I | awk '{print $1}')"
echo ""
echo "Done. Open: http://${PUBLIC_IP}:${PORT}"
echo "Make sure Lightsail Networking / EC2 Security Group allows inbound TCP ${PORT}."
