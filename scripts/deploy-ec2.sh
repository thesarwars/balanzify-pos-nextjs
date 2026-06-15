#!/bin/bash
# Deploy Balanzify to EC2 with external RDS + S3 (no local Postgres)
#
# Prerequisites:
#   - SSH key for EC2
#   - RDS database "balanzify_pos" must exist
#   - .env.ec2 filled in (copy from .env.ec2.example)
#
# Usage:
#   cp .env.ec2.example .env.ec2   # fill in values once
#   ./scripts/deploy-ec2.sh

set -euo pipefail

APP_DIR="$(cd "$(dirname "$0")/.." && pwd)"
ENV_FILE="$APP_DIR/.env.ec2"

EC2_HOST="${EC2_HOST:-ubuntu@18.221.211.50}"
EC2_KEY="${EC2_KEY:-$HOME/Desktop/Projects/Jumatechs/Balanzify/key/balanzify_pos.pem}"
REMOTE_DIR="${REMOTE_DIR:-/opt/balanzify}"

if [ ! -f "$ENV_FILE" ]; then
  echo "ERROR: $ENV_FILE not found."
  echo "Copy .env.ec2.example to .env.ec2 and fill in RDS password + JWT_SECRET."
  exit 1
fi

if [ ! -f "$EC2_KEY" ]; then
  echo "ERROR: SSH key not found at $EC2_KEY"
  echo "Set EC2_KEY=/path/to/key.pem"
  exit 1
fi

SSH="ssh -i $EC2_KEY -o StrictHostKeyChecking=no $EC2_HOST"
RSYNC="rsync -az --delete --exclude node_modules --exclude .git --exclude backend/logs --exclude .env --exclude .env.ec2"

echo "[1/4] Ensuring remote directory exists ..."
$SSH "sudo mkdir -p $REMOTE_DIR && sudo chown \$(whoami):\$(whoami) $REMOTE_DIR"

echo "[2/4] Syncing project to $EC2_HOST:$REMOTE_DIR ..."
$RSYNC -e "ssh -i $EC2_KEY -o StrictHostKeyChecking=no" "$APP_DIR/" "$EC2_HOST:$REMOTE_DIR/"

echo "[3/4] Uploading .env ..."
scp -i "$EC2_KEY" -o StrictHostKeyChecking=no "$ENV_FILE" "$EC2_HOST:$REMOTE_DIR/.env"

echo "[4/4] Building and starting containers (this may take several minutes) ..."
$SSH "cd $REMOTE_DIR && sudo docker compose -f docker-compose.ec2.yml down --remove-orphans 2>/dev/null || true"
$SSH "cd $REMOTE_DIR && sudo docker volume rm balanzify_api_logs 2>/dev/null || true"
$SSH "cd $REMOTE_DIR && sudo docker compose -f docker-compose.ec2.yml up -d --build"

echo "[5/5] Checking health ..."
sleep 15
$SSH "cd $REMOTE_DIR && sudo docker compose -f docker-compose.ec2.yml ps"
curl -sf "http://18.221.211.50/health" && echo "" || echo "WARN: /health not reachable yet — check logs with: ssh ... 'sudo docker compose -f docker-compose.ec2.yml logs -f api'"

echo ""
echo "Done. App URL: http://18.221.211.50"
