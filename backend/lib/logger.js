const winston = require('winston');
const DailyRotateFile = require('winston-daily-rotate-file');
const { v4: uuidv4 } = require('uuid');

const { combine, timestamp, json, errors, colorize, simple } = winston.format;

const isProd = process.env.NODE_ENV === 'production';

// ── Transports ────────────────────────────────────────────────────────────────
const transports = [];

if (isProd) {
  transports.push(
    new DailyRotateFile({
      filename: 'logs/app-%DATE%.log',
      datePattern: 'YYYY-MM-DD',
      maxSize: '50m',
      maxFiles: '30d',
      level: 'info',
      format: combine(timestamp(), errors({ stack: true }), json()),
    }),
    new DailyRotateFile({
      filename: 'logs/error-%DATE%.log',
      datePattern: 'YYYY-MM-DD',
      maxSize: '20m',
      maxFiles: '90d',
      level: 'error',
      format: combine(timestamp(), errors({ stack: true }), json()),
    })
  );
} else {
  transports.push(new winston.transports.Console({
    format: combine(colorize(), simple()),
  }));
}

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  defaultMeta: { service: 'balanzify-api', version: '2.0.0' },
  transports,
  exceptionHandlers: isProd ? [new DailyRotateFile({ filename: 'logs/exceptions-%DATE%.log', datePattern: 'YYYY-MM-DD' })] : [],
  rejectionHandlers: isProd ? [new DailyRotateFile({ filename: 'logs/rejections-%DATE%.log', datePattern: 'YYYY-MM-DD' })] : [],
});

// ── Request tracing middleware ────────────────────────────────────────────────
// Attaches a unique trace_id to every request. All log calls within
// the request lifecycle include this ID — makes cross-log correlation possible.
const requestLogger = (req, res, next) => {
  req.traceId = req.headers['x-trace-id'] || uuidv4();
  res.setHeader('x-trace-id', req.traceId);

  const start = Date.now();

  res.on('finish', () => {
    const duration = Date.now() - start;
    const level = res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info';

    logger[level]('http_request', {
      trace_id: req.traceId,
      method: req.method,
      path: req.path,
      status: res.statusCode,
      duration_ms: duration,
      user_id: req.user?.id,
      business_id: req.user?.business_id,
      ip: req.ip,
      user_agent: req.headers['user-agent'],
    });

    // Slow request warning — anything over 2s in production is a signal
    if (duration > 2000) {
      logger.warn('slow_request', {
        trace_id: req.traceId,
        method: req.method,
        path: req.path,
        duration_ms: duration,
      });
    }
  });

  next();
};

// ── Audit logger ──────────────────────────────────────────────────────────────
// Structured security-relevant events. Separate from request logs.
const audit = (event, data = {}) => {
  logger.info('audit_event', { event, ...data, ts: new Date().toISOString() });
};

// ── Security logger ───────────────────────────────────────────────────────────
const security = (event, data = {}) => {
  logger.warn('security_event', { event, ...data, ts: new Date().toISOString() });
};

module.exports = { logger, requestLogger, audit, security };
