# ── Stage 1: Build the static export ──────────────────────────────────────────
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci --legacy-peer-deps
COPY . .
# Build talks to the real backend. NEXT_PUBLIC_BACKEND_URL is the API origin
# (empty = same-origin behind a reverse proxy; e.g. http://localhost:5000 for the
# local direct-to-API setup). Set NEXT_PUBLIC_API_MODE=mock for a self-contained demo.
ARG NEXT_PUBLIC_API_MODE=real
ARG NEXT_PUBLIC_BACKEND_URL=
ENV NEXT_PUBLIC_API_MODE=$NEXT_PUBLIC_API_MODE
ENV NEXT_PUBLIC_BACKEND_URL=$NEXT_PUBLIC_BACKEND_URL
RUN npm run build          # next build → static export in /app/out

# ── Stage 2: Serve with Nginx (drop-in for the existing frontend container) ─────
FROM nginx:1.25-alpine AS production
COPY --from=builder /app/out /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=5s \
  CMD wget -qO- http://localhost/health || exit 1

CMD ["nginx", "-g", "daemon off;"]
