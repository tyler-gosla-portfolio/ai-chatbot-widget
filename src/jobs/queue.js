import { getDb } from '../db/connection.js';
import { newJobId } from '../utils/ids.js';
import logger from '../utils/logger.js';

const POLL_INTERVAL_MS = 2000;
let pollTimer = null;
const handlers = new Map();

export function registerHandler(type, fn) {
  handlers.set(type, fn);
}

export function enqueueJob(type, payload) {
  const db = getDb();
  const id = newJobId();
  db.prepare(`
    INSERT INTO jobs (id, type, payload, status, attempts, max_attempts)
    VALUES (?, ?, ?, 'pending', 0, 3)
  `).run(id, type, JSON.stringify(payload));
  logger.info(`Job enqueued: ${type} (${id})`);
  return id;
}

async function processNextJob() {
  const db = getDb();
  const job = db.prepare(`
    SELECT * FROM jobs WHERE status = 'pending' ORDER BY created_at ASC LIMIT 1
  `).get();

  if (!job) return;

  db.prepare(`
    UPDATE jobs SET status = 'running', started_at = datetime('now'), attempts = attempts + 1 WHERE id = ?
  `).run(job.id);

  const handler = handlers.get(job.type);
  if (!handler) {
    db.prepare(`UPDATE jobs SET status = 'failed', error = ? WHERE id = ?`)
      .run(`No handler for job type: ${job.type}`, job.id);
    return;
  }

  try {
    await handler(JSON.parse(job.payload));
    db.prepare(`UPDATE jobs SET status = 'completed', completed_at = datetime('now') WHERE id = ?`).run(job.id);
    logger.info(`Job completed: ${job.type} (${job.id})`);
  } catch (err) {
    logger.error(`Job failed: ${job.type} (${job.id}): ${err.message}`);
    const attempts = job.attempts + 1;
    if (attempts >= job.max_attempts) {
      db.prepare(`UPDATE jobs SET status = 'failed', error = ? WHERE id = ?`).run(err.message, job.id);
    } else {
      db.prepare(`UPDATE jobs SET status = 'pending', error = ? WHERE id = ?`).run(err.message, job.id);
    }
  }
}

export function startWorker() {
  logger.info('Job queue worker started');
  const tick = async () => {
    try {
      await processNextJob();
    } catch (err) {
      logger.error('Job worker error:', err);
    } finally {
      pollTimer = setTimeout(tick, POLL_INTERVAL_MS);
    }
  };
  pollTimer = setTimeout(tick, POLL_INTERVAL_MS);
}

export function stopWorker() {
  if (pollTimer) {
    clearTimeout(pollTimer);
    pollTimer = null;
  }
}
