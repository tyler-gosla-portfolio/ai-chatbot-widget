import { Router } from 'express';
import { getDb } from '../db/connection.js';

const router = Router();

router.get('/', (req, res) => {
  let dbStatus = 'disconnected';
  try {
    const db = getDb();
    db.prepare('SELECT 1').get();
    dbStatus = 'connected';
  } catch {}

  res.json({
    status: 'ok',
    uptime: Math.floor(process.uptime()),
    dbStatus,
  });
});

export default router;
