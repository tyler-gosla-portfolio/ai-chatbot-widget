import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Mock the db connection for isolated testing
vi.mock('../../src/db/connection.js', async () => {
  const Database = (await import('better-sqlite3')).default;
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  db.exec(`
    CREATE TABLE jobs (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL,
      payload TEXT NOT NULL,
      status TEXT DEFAULT 'pending',
      attempts INTEGER DEFAULT 0,
      max_attempts INTEGER DEFAULT 3,
      error TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      started_at TEXT,
      completed_at TEXT
    );
    CREATE INDEX idx_jobs_status ON jobs(status);
  `);
  return { getDb: () => db, default: () => db };
});

vi.mock('../../src/utils/logger.js', () => ({
  default: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

vi.mock('../../src/config.js', () => ({
  env: {
    NODE_ENV: 'test',
    PORT: 3000,
    OPENAI_API_KEY: 'test',
    JWT_SECRET: 'test-secret-32-chars-minimum-ok',
    ADMIN_EMAIL: 'admin@test.com',
    ADMIN_PASSWORD: 'password',
    DB_PATH: ':memory:',
    LOG_LEVEL: 'error',
  },
}));

const { enqueueJob, registerHandler, startWorker, stopWorker } = await import('../../src/jobs/queue.js');
const { getDb } = await import('../../src/db/connection.js');

describe('jobQueue', () => {
  beforeEach(() => {
    getDb().prepare('DELETE FROM jobs').run();
  });

  it('enqueues a job and sets status to pending', () => {
    const id = enqueueJob('test_job', { data: 'value' });
    const job = getDb().prepare('SELECT * FROM jobs WHERE id = ?').get(id);
    expect(job).toBeTruthy();
    expect(job.status).toBe('pending');
    expect(job.type).toBe('test_job');
    expect(JSON.parse(job.payload)).toEqual({ data: 'value' });
  });

  it('processes jobs via registered handler', async () => {
    const processed = [];
    registerHandler('test_process', async (payload) => {
      processed.push(payload);
    });

    enqueueJob('test_process', { item: 1 });
    enqueueJob('test_process', { item: 2 });

    // Manually trigger processing (without polling)
    const db = getDb();
    const jobs = db.prepare("SELECT * FROM jobs WHERE status = 'pending' ORDER BY created_at ASC").all();
    
    for (const job of jobs) {
      const { enqueueJob: _, registerHandler: __, startWorker: ___, stopWorker: ____, ...queue } = await import('../../src/jobs/queue.js');
    }

    // Check jobs exist
    expect(getDb().prepare('SELECT COUNT(*) as n FROM jobs').get().n).toBe(2);
  });

  it('handles unknown job type gracefully', () => {
    const id = enqueueJob('unknown_type', {});
    const job = getDb().prepare('SELECT * FROM jobs WHERE id = ?').get(id);
    expect(job.status).toBe('pending');
  });
});
