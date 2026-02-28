import { rateLimit } from 'express-rate-limit';

export const chatRateLimit = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  keyGenerator: (req) => req.apiKey?.id || req.ip,
  handler: (req, res) => {
    res.status(429).json({ error: 'rate_limited', message: 'Too many requests, please try again later' });
  },
  standardHeaders: true,
  legacyHeaders: false,
});

export const uploadRateLimit = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  keyGenerator: (req) => req.admin?.id || req.ip,
  handler: (req, res) => {
    res.status(429).json({ error: 'rate_limited', message: 'Too many upload requests' });
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// Track active SSE connections per API key
const sseConnections = new Map();

export function trackSseConnection(apiKeyId, res) {
  const current = sseConnections.get(apiKeyId) || 0;
  if (current >= 5) return false;
  sseConnections.set(apiKeyId, current + 1);
  res.on('close', () => {
    const n = sseConnections.get(apiKeyId) || 1;
    sseConnections.set(apiKeyId, Math.max(0, n - 1));
  });
  return true;
}
