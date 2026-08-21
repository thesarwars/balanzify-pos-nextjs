#!/bin/sh
# Pick HTTP-only nginx until Let's Encrypt certs exist, then use HTTPS template.
set -eu

DOMAIN="${BALANZIFY_DOMAIN:-pos.balanzify.africa}"
CERT="/etc/nginx/certs/live/${DOMAIN}/fullchain.pem"

# Marketing site (optional, served from a read-only bind mount). The vhost is
# only emitted once its OWN certificate exists: an ssl_certificate line pointing
# at a missing file makes nginx refuse to start, which would take the POS down
# alongside the marketing page.
LANDING_DOMAIN="${LANDING_DOMAIN:-}"
LANDING_TEMPLATE="/etc/nginx/landing.conf.template"
LANDING_DIR="/etc/nginx/sites"

mkdir -p "$LANDING_DIR"
rm -f "$LANDING_DIR/landing.conf"

if [ -f "$CERT" ]; then
  sed "s/BALANZIFY_DOMAIN/${DOMAIN}/g" /etc/nginx/nginx.conf.template > /etc/nginx/nginx.conf

  if [ -n "$LANDING_DOMAIN" ] \
     && [ -f "/etc/nginx/certs/live/${LANDING_DOMAIN}/fullchain.pem" ] \
     && [ -f "$LANDING_TEMPLATE" ]; then
    sed "s/LANDING_DOMAIN/${LANDING_DOMAIN}/g" "$LANDING_TEMPLATE" > "$LANDING_DIR/landing.conf"
    echo "balanzify: marketing vhost enabled for ${LANDING_DOMAIN}"
  else
    echo "balanzify: marketing vhost skipped (no certificate for '${LANDING_DOMAIN:-unset}')"
  fi
else
  cp /etc/nginx/nginx.http-only.conf /etc/nginx/nginx.conf
fi
