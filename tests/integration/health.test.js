import '../setup/env.js'; // Must be first
import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import { createTestDb } from '../setup/testDb.js';
import { createTestApp, seedAdmin, seedApiKey } from '../setup/testServer.js';

let db;
let app;

vi.mock('../../src/db/connection.js', () => ({
  getDb: vi.fn(() => db),
}));
vi.mock('../../src/config.js', () => ({
  env: {
    OPENAI_API_KEY: 'sk-test',
    JWT_SECRET: 'test-jwt-secret-that-is-at-least-32-chars-long!!',
    ADMIN_EMAIL: 'admin@test.com',
    ADMIN_PASSWORD: 'password123',
    NODE_ENV: 'test',
    PORT: 0,
    LOG_LEVEL: 'error',
  },
}));
vi.mock('../../src/utils/logger.js', () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock('../../src/services/embeddingService.js', () => ({
  findSimilarChunks: vi.fn(async () => []),
  loadAllEmbeddings: vi.fn(),
}));
vi.mock('openai', () => {
  return { default: class { constructor() {} } };
});

beforeEach(() => {
  db = createTestDb();
  app = createTestApp(db);
});

describe('GET /health', () => {
  it('returns 200', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
  });

  it('returns ok status', async () => {
    const res = await request(app).get('/health');
    expect(res.body).toHaveProperty('status');
  });
});
