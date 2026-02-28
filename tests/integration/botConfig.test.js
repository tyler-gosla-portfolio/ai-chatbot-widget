import '../setup/env.js';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import { createTestDb } from '../setup/testDb.js';
import { createTestApp, makeAdminToken } from '../setup/testServer.js';

let db;
let app;
let token;

vi.mock('../../src/db/connection.js', () => ({ getDb: vi.fn(() => db) }));
vi.mock('../../src/config.js', () => ({
  env: {
    OPENAI_API_KEY: 'sk-test',
    JWT_SECRET: 'test-jwt-secret-that-is-at-least-32-chars-long!!',
    NODE_ENV: 'test', PORT: 0, LOG_LEVEL: 'error',
    ADMIN_EMAIL: 'admin@test.com', ADMIN_PASSWORD: 'password123',
  },
}));
vi.mock('../../src/utils/logger.js', () => ({ default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
vi.mock('../../src/services/embeddingService.js', () => ({ findSimilarChunks: vi.fn(async () => []), loadAllEmbeddings: vi.fn() }));
vi.mock('openai', () => ({ default: class { constructor() {} } }));

beforeEach(() => {
  db = createTestDb();
  app = createTestApp(db);
  token = makeAdminToken();
});

describe('Bot Config API', () => {
  it('GET /api/v1/admin/config returns default config', async () => {
    const res = await request(app)
      .get('/api/v1/admin/config')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.id).toBe('default');
    expect(res.body.bot_name).toBe('AI Assistant');
    expect(res.body.system_prompt).toBe('You are a helpful assistant.');
  });

  it('PATCH updates bot_name', async () => {
    const res = await request(app)
      .patch('/api/v1/admin/config')
      .set('Authorization', `Bearer ${token}`)
      .send({ botName: 'Awesome Bot' });
    expect(res.status).toBe(200);
    expect(res.body.bot_name).toBe('Awesome Bot');
  });

  it('PATCH updates multiple fields', async () => {
    const res = await request(app)
      .patch('/api/v1/admin/config')
      .set('Authorization', `Bearer ${token}`)
      .send({ temperature: 0.5, maxTokens: 300, model: 'gpt-4' });
    expect(res.status).toBe(200);
    expect(res.body.temperature).toBe(0.5);
    expect(res.body.max_tokens).toBe(300);
    expect(res.body.model).toBe('gpt-4');
  });

  it('PATCH rejects unknown fields (strict schema)', async () => {
    const res = await request(app)
      .patch('/api/v1/admin/config')
      .set('Authorization', `Bearer ${token}`)
      .send({ unknownField: 'evil' });
    expect(res.status).toBe(400);
  });

  it('PATCH validates temperature range (0-2)', async () => {
    const res = await request(app)
      .patch('/api/v1/admin/config')
      .set('Authorization', `Bearer ${token}`)
      .send({ temperature: 5.0 });
    expect(res.status).toBe(400);
  });

  it('requires auth', async () => {
    const res = await request(app).get('/api/v1/admin/config');
    expect(res.status).toBe(401);
  });

  it('updates persist across requests', async () => {
    await request(app)
      .patch('/api/v1/admin/config')
      .set('Authorization', `Bearer ${token}`)
      .send({ botName: 'PersistBot' });
    const res = await request(app)
      .get('/api/v1/admin/config')
      .set('Authorization', `Bearer ${token}`);
    expect(res.body.bot_name).toBe('PersistBot');
  });
});
