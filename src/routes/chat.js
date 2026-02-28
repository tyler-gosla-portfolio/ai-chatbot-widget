import { Router } from 'express';
import { z } from 'zod';
import { apiKeyAuth } from '../middleware/apiKeyAuth.js';
import { chatRateLimit, trackSseConnection } from '../middleware/rateLimiter.js';
import { validate } from '../middleware/validate.js';
import { getOrCreateSession, streamChatMessage, getSessionHistory, deleteSession } from '../services/chatService.js';

const router = Router();

const messageSchema = z.object({
  message: z.string().min(1).max(2000),
  sessionId: z.string().optional(),
});

router.post('/message', apiKeyAuth, chatRateLimit, validate(messageSchema), async (req, res, next) => {
  try {
    const { message, sessionId } = req.validated;
    const apiKey = req.apiKey;
    const origin = req.headers.origin || null;
    
    // Track SSE connection limit
    if (!trackSseConnection(apiKey.id, res)) {
      return res.status(429).json({ error: 'rate_limited', message: 'Too many concurrent connections for this API key' });
    }
    
    const session = await getOrCreateSession(sessionId, apiKey.id, origin);
    
    await streamChatMessage({ session, message, res, req: req });
  } catch (err) {
    if (!res.headersSent) {
      next(err);
    }
  }
});

router.get('/history/:sessionId', apiKeyAuth, (req, res, next) => {
  try {
    const history = getSessionHistory(req.params.sessionId, req.apiKey.id);
    if (!history) return res.status(404).json({ error: 'not_found', message: 'Session not found' });
    res.json(history);
  } catch (err) { next(err); }
});

router.delete('/sessions/:sessionId', apiKeyAuth, (req, res, next) => {
  try {
    const deleted = deleteSession(req.params.sessionId, req.apiKey.id);
    if (!deleted) return res.status(404).json({ error: 'not_found', message: 'Session not found' });
    res.status(204).send();
  } catch (err) { next(err); }
});

export default router;
