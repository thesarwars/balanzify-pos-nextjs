#!/bin/sh
# Pick HTTP-only nginx until Let's Encrypt certs exist, then use HTTPS template.
set -eu

DOMAIN="${BALANZIFY_DOMAIN:-pos.balanzify.ai}"
CERT="/etc/nginx/certs/live/${DOMAIN}/fullchain.pem"

if [ -f "$CERT" ]; then
  sed "s/BALANZIFY_DOMAIN/${DOMAIN}/g" /etc/nginx/nginx.conf.template > /etc/nginx/nginx.conf
else
  cp /etc/nginx/nginx.http-only.conf /etc/nginx/nginx.conf
fi
