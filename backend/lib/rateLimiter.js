const rateLimit = require('express-rate-limit');
const { getRedis, isRedisAvailable } = require('./redis');
const { logger } = require('./logger');

/**
 * createRateLimiter(options)
 *
 * Builds an Express rate limiter that uses Redis when available (multi-instance safe)
 * and falls back to in-memory when Redis is unavailable.
 *
 * Key is per-user when authenticated, per-IP when not.
 * This means a single heavy user cannot starve other users sharing the same IP
 * (e.g. a branch office on a shared internet connection).
 */
const createRateLimiter = ({
  windowMs = 15 * 60 * 1000,
  max = 300,
  prefix = 'rl',
  message = 'Too many requests',
  skipSuccessfulRequests = false,
}) => {
  const baseOptions = {
    windowMs,
    max,
    standardHeaders: true,
    legacyHeaders: false,
    skipSuccessfulRequests,
    keyGenerator: (req) => {
      // Authenticated: key by user ID (per-tenant isolation)
      // Unauthenticated: key by IP
      const id = req.user?.id || req.ip;
      return `${prefix}:${id}`;
    },
    handler: (req, res) => {
      logger.warn('rate_limit_exceeded', {
        key: req.user?.id || req.ip,
        path: req.path,
        trace_id: req.traceId,
      });
      res.status(429).json({
        type: 'https://balanzify.com/errors/too-many-requests',
        title: 'Rate limit exceeded',
        status: 429,
        detail: message,
        retry_after: Math.ceil(windowMs / 1000),
      });
    },
  };

  // Build BOTH limiter instances once, at startup — never inside a request handler.
  // express-rate-limit throws ERR_ERL_CREATED_IN_REQUEST_HANDLER otherwise.
  const memoryLimiter = rateLimit(baseOptions);
  let redisLimiter = null;

  const buildRedisLimiter = () => {
    try {
      const RedisStore = require('rate-limit-redis');
      return rateLimit({
        ...baseOptions,
        store: new RedisStore({
          sendCommand: (...args) => getRedis().sendCommand(args),
          prefix,
        }),
      });
    } catch {
      return null;
    }
  };

  // Prefer Redis limiter when available, else memory. Both built at startup.
  return (req, res, next) => {
    if (isRedisAvailable()) {
      if (!redisLimiter) redisLimiter = buildRedisLimiter();
      if (redisLimiter) return redisLimiter(req, res, next);
    }
    return memoryLimiter(req, res, next);
  };
};

// ── Pre-built limiters ────────────────────────────────────────────────────────
const authLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 10,
  prefix: 'rl:auth',
  message: 'Too many authentication attempts. Try again in 15 minutes.',
  skipSuccessfulRequests: true, // only count failures toward the limit
});

const apiLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 300,
  prefix: 'rl:api',
  message: 'API rate limit exceeded.',
});

const strictLimiter = createRateLimiter({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 50,
  prefix: 'rl:strict',
  message: 'Rate limit exceeded for this operation.',
});

module.exports = { createRateLimiter, authLimiter, apiLimiter, strictLimiter };
