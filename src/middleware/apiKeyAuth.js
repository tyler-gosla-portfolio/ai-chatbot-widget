import crypto from 'crypto';
import { getDb } from '../db/connection.js';
import logger from '../utils/logger.js';

export function apiKeyAuth(req, res, next) {
  const apiKey = req.headers['x-api-key'];
  if (!apiKey) {
    return res.status(401).json({ error: 'invalid_api_key', message: 'Missing X-API-Key header' });
  }

  const db = getDb();
  const row = db.prepare('SELECT * FROM api_keys WHERE is_active = 1').all()
    .find(k => {
      try {
        const a = Buffer.from(k.api_key, 'utf8');
        const b = Buffer.from(apiKey, 'utf8');
        if (a.length !== b.length) return false;
        return crypto.timingSafeEqual(a, b);
      } catch {
        return false;
      }
    });

  if (!row) {
    return res.status(401).json({ error: 'invalid_api_key', message: 'Invalid or revoked API key' });
  }

  // Update last_used
  db.prepare('UPDATE api_keys SET last_used = datetime(\'now\') WHERE id = ?').run(row.id);

  // Log warning if no allowed origins configured
  if (row.allowed_origins === '[]' || !row.allowed_origins) {
    logger.warn(`API key "${row.name}" has no allowedOrigins — development mode only`);
  }

  req.apiKey = row;
  next();
}
