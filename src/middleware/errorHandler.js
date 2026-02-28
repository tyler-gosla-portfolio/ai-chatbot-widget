import { ZodError } from 'zod';
import logger from '../utils/logger.js';
import { env } from '../config.js';

export function errorHandler(err, req, res, next) {
  if (res.headersSent) return next(err);

  if (err instanceof ZodError) {
    return res.status(400).json({
      error: 'validation_error',
      message: 'Request validation failed',
      details: err.errors.map(e => ({ path: e.path.join('.'), message: e.message })),
    });
  }

  const status = err.status || err.statusCode || 500;
  const errorCode = err.code || 'internal_error';

  logger.error(`${req.method} ${req.path} — ${err.message}`, {
    status,
    stack: env.NODE_ENV === 'development' ? err.stack : undefined,
  });

  res.status(status).json({
    error: errorCode,
    message: env.NODE_ENV === 'production' && status === 500
      ? 'Internal server error'
      : err.message,
    ...(env.NODE_ENV === 'development' && { stack: err.stack }),
  });
}
