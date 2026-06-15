#!/bin/bash
# Obtain Let's Encrypt certificate for pos.balanzify.ai (run AFTER DNS points to EC2)
set -euo pipefail

APP_DIR="$(cd "$(dirname "$0")/.." && pwd)"
ENV_FILE="$APP_DIR/.env.ec2"
EC2_HOST="${EC2_HOST:-ubuntu@18.221.211.50}"
EC2_KEY="${EC2_KEY:-$HOME/Desktop/Projects/Jumatechs/Balanzify/key/balanzify_pos.pem}"
REMOTE_DIR="${REMOTE_DIR:-/opt/balanzify}"
CERTBOT_EMAIL="${CERTBOT_EMAIL:-contact@balanzify.com}"

if [ -f "$ENV_FILE" ]; then
  DOMAIN=$(grep '^DOMAIN=' "$ENV_FILE" | cut -d= -f2- | tr -d '\r' || true)
fi

DOMAIN="${DOMAIN:-pos.balanzify.ai}"
SSH="ssh -i $EC2_KEY -o StrictHostKeyChecking=no $EC2_HOST"

echo "=== Checking DNS for $DOMAIN ==="
RESOLVED=$(dig +short "$DOMAIN" A | head -1)
EC2_IP=$(curl -sf ifconfig.me 2>/dev/null || echo "18.221.211.50")
echo "  $DOMAIN resolves to: ${RESOLVED:-<none>}"
echo "  EC2 public IP:       18.221.211.50"

if [ "$RESOLVED" != "18.221.211.50" ]; then
  echo ""
  echo "WARNING: DNS does not point to EC2 yet."
  echo "In GoDaddy DNS for balanzify.ai, set:"
  echo "  Type A | Name pos | Value 18.221.211.50"
  echo ""
  read -r -p "Continue anyway? [y/N] " ans
  [ "$ans" = "y" ] || [ "$ans" = "Y" ] || exit 1
fi

echo "=== Requesting certificate ==="
$SSH "cd $REMOTE_DIR && sudo docker compose -f docker-compose.ec2.yml run --rm --entrypoint certbot certbot certonly \
  --webroot --webroot-path=/var/www/certbot \
  --email '$CERTBOT_EMAIL' --agree-tos --no-eff-email \
  -d '$DOMAIN'"

echo "=== Reloading nginx with HTTPS ==="
$SSH "cd $REMOTE_DIR && sudo docker compose -f docker-compose.ec2.yml restart nginx"

echo ""
echo "Done. Test: https://$DOMAIN/health"
