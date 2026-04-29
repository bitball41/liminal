#!/usr/bin/env bash
# One-time setup script — run this once on a fresh EC2 instance.
# Works on Amazon Linux 2/2023 and Ubuntu 22.04+.
set -euo pipefail

APP_DIR="/var/www/liminal"
REPO="https://github.com/WhopperCat/liminal.git"
NODE_VERSION="20"

echo "==> Detecting OS"
if [ -f /etc/os-release ]; then
  . /etc/os-release
  OS=$ID
else
  echo "Cannot detect OS"; exit 1
fi

echo "==> Installing system packages"
if [[ "$OS" == "amzn" ]]; then
  sudo yum update -y
  sudo yum install -y git nginx
elif [[ "$OS" == "ubuntu" ]]; then
  sudo apt-get update -y
  sudo apt-get install -y git nginx
else
  echo "Unsupported OS: $OS"; exit 1
fi

echo "==> Installing Node.js $NODE_VERSION via nvm"
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash
export NVM_DIR="$HOME/.nvm"
# shellcheck disable=SC1091
source "$NVM_DIR/nvm.sh"
nvm install "$NODE_VERSION"
nvm alias default "$NODE_VERSION"

echo "==> Installing PM2"
npm install -g pm2

echo "==> Cloning repository"
sudo mkdir -p "$(dirname "$APP_DIR")"
sudo chown "$USER":"$USER" "$(dirname "$APP_DIR")"
git clone "$REPO" "$APP_DIR"
cd "$APP_DIR"
npm install --omit=dev

echo "==> Starting app with PM2"
pm2 start server.js --name axis
pm2 save
pm2 startup | tail -1 | sudo bash   # registers PM2 to start on reboot

echo "==> Configuring nginx"
sudo cp "$APP_DIR/scripts/nginx-axis.conf" /etc/nginx/conf.d/axis.conf
sudo nginx -t
sudo systemctl enable --now nginx

echo ""
echo "✓ Setup complete."
echo "  App running on port 8080, nginx proxying on port 80."
echo "  Point your CloudFront origin to:  http://$(curl -s http://169.254.169.254/latest/meta-data/public-hostname)"
