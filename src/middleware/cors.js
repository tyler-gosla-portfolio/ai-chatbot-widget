import cors from 'cors';
import { getDb } from '../db/connection.js';

export function dynamicCors(req, res, next) {
  const origin = req.headers.origin;

  // For admin routes, allow all origins (or configure separately)
  if (req.path.startsWith('/api/v1/admin') || req.path.startsWith('/admin') || req.path === '/health') {
    return cors({
      origin: true,
      methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-API-Key'],
      maxAge: 3600,
    })(req, res, next);
  }

  // For widget API routes, validate against api key's allowed_origins
  const apiKey = req.headers['x-api-key'];
  if (!apiKey || !origin) {
    return cors({
      origin: false,
      methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-API-Key'],
      maxAge: 3600,
    })(req, res, next);
  }

  try {
    const db = getDb();
    const row = db.prepare('SELECT allowed_origins FROM api_keys WHERE api_key = ? AND is_active = 1').get(apiKey);

    let originAllowed = false;
    if (row) {
      let allowedOrigins = [];
      try { allowedOrigins = JSON.parse(row.allowed_origins || '[]'); } catch {}
      originAllowed = allowedOrigins.length === 0 || allowedOrigins.includes(origin) || allowedOrigins.includes('*');
    }

    return cors({
      origin: originAllowed ? origin : false,
      methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-API-Key'],
      maxAge: 3600,
    })(req, res, next);
  } catch {
    return cors({ origin: false })(req, res, next);
  }
}
