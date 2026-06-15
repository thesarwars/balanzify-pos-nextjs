const { logger } = require('../lib/logger');
const { Prisma } = require('@prisma/client');

const isProd = process.env.NODE_ENV === 'production';

/**
 * Global error handler — registered last in the Express middleware chain.
 * Returns RFC 7807 Problem Details for all errors.
 * Handles both legacy pg error codes AND Prisma error codes.
 */
const errorHandler = (err, req, res, next) => {
  const status = err.status || err.statusCode || 500;

  logger.error('unhandled_error', {
    trace_id: req.traceId,
    message: err.message,
    stack: err.stack,
    method: req.method,
    path: req.path,
    user_id: req.user?.id,
    business_id: req.user?.business_id,
    prisma_code: err instanceof Prisma.PrismaClientKnownRequestError ? err.code : undefined,
    pg_code: err.code,
    status,
  });

  // ── Prisma known errors ──────────────────────────────────────────────────────
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    switch (err.code) {
      case 'P2002': // Unique constraint violation
        return res.status(409).json({
          type: 'https://balanzify.com/errors/conflict',
          title: 'A record with this value already exists',
          status: 409,
          field: err.meta?.target?.[0] ?? null,
          trace_id: req.traceId,
        });

      case 'P2003': // Foreign key constraint violation
        return res.status(422).json({
          type: 'https://balanzify.com/errors/validation',
          title: 'Referenced resource does not exist',
          status: 422,
          field: err.meta?.field_name ?? null,
          trace_id: req.traceId,
        });

      case 'P2025': // Record not found (update/delete on non-existent row)
        return res.status(404).json({
          type: 'https://balanzify.com/errors/not-found',
          title: 'Record not found',
          status: 404,
          trace_id: req.traceId,
        });

      case 'P2014': // Required relation violation
        return res.status(422).json({
          type: 'https://balanzify.com/errors/validation',
          title: 'Required relation missing',
          status: 422,
          trace_id: req.traceId,
        });

      case 'P2034': // Transaction conflict (serializable isolation)
        return res.status(409).json({
          type: 'https://balanzify.com/errors/conflict',
          title: 'Transaction conflict — please retry',
          status: 409,
          code: 'TRANSACTION_CONFLICT',
          trace_id: req.traceId,
        });

      default:
        // Log full Prisma error detail in non-prod
        return res.status(500).json({
          type: 'https://balanzify.com/errors/database',
          title: 'A database error occurred',
          status: 500,
          trace_id: req.traceId,
          ...(isProd ? {} : { detail: err.message, prisma_code: err.code }),
        });
    }
  }

  // ── Prisma validation errors (malformed query from code) ──────────────────
  if (err instanceof Prisma.PrismaClientValidationError) {
    return res.status(500).json({
      type: 'https://balanzify.com/errors/internal',
      title: 'An unexpected error occurred',
      status: 500,
      trace_id: req.traceId,
      ...(isProd ? {} : { detail: err.message }),
    });
  }

  // ── Legacy pg error codes (raw $queryRaw / $executeRaw) ───────────────────
  if (err.code === '23505') {
    return res.status(409).json({
      type: 'https://balanzify.com/errors/conflict',
      title: 'A record with this value already exists',
      status: 409,
      trace_id: req.traceId,
    });
  }
  if (err.code === '23503') {
    return res.status(422).json({
      type: 'https://balanzify.com/errors/validation',
      title: 'Referenced resource does not exist',
      status: 422,
      trace_id: req.traceId,
    });
  }
  if (err.code === '23514') {
    return res.status(422).json({
      type: 'https://balanzify.com/errors/validation',
      title: 'Value violates a database constraint',
      status: 422,
      trace_id: req.traceId,
    });
  }
  if (err.code === '40001' || err.code === '40P01') {
    // Serialization failure / deadlock — client should retry
    return res.status(409).json({
      type: 'https://balanzify.com/errors/conflict',
      title: 'Transaction conflict — please retry',
      status: 409,
      code: 'TRANSACTION_CONFLICT',
      trace_id: req.traceId,
    });
  }

  // ── Explicit HTTP errors (thrown with err.statusCode) ────────────────────
  if (err.status || err.statusCode) {
    return res.status(status).json({
      type: `https://balanzify.com/errors/${err.code || 'error'}`,
      title: err.message || 'An error occurred',
      status,
      trace_id: req.traceId,
    });
  }

  // ── Zod validation (already handled by validate middleware, safety net) ──
  if (err.name === 'ZodError') {
    return res.status(422).json({
      type: 'https://balanzify.com/errors/validation',
      title: 'Validation failed',
      status: 422,
      errors: err.errors.map(e => ({ field: e.path.join('.'), message: e.message })),
      trace_id: req.traceId,
    });
  }

  // ── Multer errors (file upload) ─────────────────────────────────────────
  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.status(413).json({
      type: 'https://balanzify.com/errors/file-too-large',
      title: 'File exceeds the 5MB limit',
      status: 413,
      trace_id: req.traceId,
    });
  }

  // ── Default 500 ──────────────────────────────────────────────────────────
  return res.status(500).json({
    type: 'https://balanzify.com/errors/internal',
    title: 'An unexpected error occurred',
    status: 500,
    trace_id: req.traceId,
    ...(isProd ? {} : { detail: err.message, stack: err.stack }),
  });
};

const notFoundHandler = (req, res) => {
  res.status(404).json({
    type: 'https://balanzify.com/errors/not-found',
    title: 'Endpoint not found',
    status: 404,
    detail: `${req.method} ${req.path} does not exist`,
  });
};

module.exports = { errorHandler, notFoundHandler };
