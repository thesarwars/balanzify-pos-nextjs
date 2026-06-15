const { ZodError } = require('zod');

/**
 * validate(schema, source?)
 * Validates req[source] against schema. source defaults to 'body'.
 * On failure returns RFC 7807 Problem Details format.
 */
const validate = (schema, source = 'body') => (req, res, next) => {
  try {
    const parsed = schema.parse(req[source]);
    req[source] = parsed; // replace with coerced/defaulted values
    next();
  } catch (err) {
    if (err instanceof ZodError) {
      return res.status(422).json({
        type: 'https://balanzify.com/errors/validation',
        title: 'Validation failed',
        status: 422,
        errors: err.errors.map(e => ({
          field: e.path.join('.'),
          message: e.message,
          code: e.code,
        })),
      });
    }
    next(err);
  }
};

/**
 * validateQuery(schema)
 * Convenience wrapper for query string validation.
 */
const validateQuery = (schema) => validate(schema, 'query');

/**
 * validateParams(schema)
 * Convenience wrapper for URL param validation.
 */
const validateParams = (schema) => validate(schema, 'params');

module.exports = { validate, validateQuery, validateParams };
