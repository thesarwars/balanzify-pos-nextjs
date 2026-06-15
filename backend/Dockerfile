# ── Stage 1: Dependencies ──────────────────────────────────────────────────────
FROM node:20-alpine AS deps
WORKDIR /app

# Copy package files AND prisma schema before npm ci + prisma generate
COPY package*.json ./
COPY prisma ./prisma/

RUN npm ci --only=production \
 && npx prisma generate \
 && npm cache clean --force

# ── Stage 2: Production image ──────────────────────────────────────────────────
FROM node:20-alpine AS production
WORKDIR /app

# Security: run as non-root
RUN addgroup --system --gid 1001 nodejs \
 && adduser  --system --uid 1001 balanzify

# Copy node_modules + generated Prisma client from stage 1
COPY --from=deps /app/node_modules ./node_modules

# Copy all source (chown in one layer is cheaper than chown after copy)
COPY --chown=balanzify:nodejs . .

# Logs directory
RUN mkdir -p logs && chown balanzify:nodejs logs

USER balanzify

EXPOSE 5000

# Healthcheck — Docker restarts container if this fails 3× in a row
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
  CMD node -e "require('http').get('http://localhost:5000/health', r => process.exit(r.statusCode===200?0:1)).on('error',()=>process.exit(1))"

# Runs prisma migrate deploy then starts the server.
# migrate deploy is idempotent — safe to run on every container start.
CMD ["sh", "-c", "npx prisma migrate deploy && node server.js"]
