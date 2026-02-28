import '../setup/env.js';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import { createTestDb } from '../setup/testDb.js';
import { createTestApp, makeAdminToken, seedApiKey } from '../setup/testServer.js';

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

describe('API Keys CRUD', () => {
  it('creates a new API key', async () => {
    const res = await request(app)
      .post('/api/v1/admin/keys')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Widget Key', allowedOrigins: ['https://example.com'] });
    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty('apiKey');
    expect(res.body.apiKey).toMatch(/^pk_live_/);
    expect(res.body.name).toBe('Widget Key');
    expect(res.body.allowedOrigins).toContain('https://example.com');
  });

  it('lists all keys', async () => {
    seedApiKey(db, { name: 'Key One', apiKey: 'pk_live_' + '1'.repeat(48) });
    seedApiKey(db, { name: 'Key Two', apiKey: 'pk_live_' + '2'.repeat(48) });
    const res = await request(app)
      .get('/api/v1/admin/keys')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.length).toBe(2);
  });

  it('deletes an API key', async () => {
    const { id } = seedApiKey(db);
    const res = await request(app)
      .delete(`/api/v1/admin/keys/${id}`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(204);
    // Verify deactivated
    const row = db.prepare('SELECT is_active FROM api_keys WHERE id = ?').get(id);
    expect(row.is_active).toBe(0);
  });

  it('using deleted key returns 401', async () => {
    const { id, apiKey } = seedApiKey(db);
    // Delete it
    db.prepare('UPDATE api_keys SET is_active = 0 WHERE id = ?').run(id);
    const res = await request(app)
      .get('/api/v1/chat/history/ses_fake')
      .set('X-API-Key', apiKey);
    expect(res.status).toBe(401);
  });

  it('rotates an API key', async () => {
    const { id, apiKey: oldKey } = seedApiKey(db);
    const res = await request(app)
      .post(`/api/v1/admin/keys/${id}/rotate`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.apiKey).toMatch(/^pk_live_/);
    expect(res.body.apiKey).not.toBe(oldKey);
  });

  it('returns 404 when deleting non-existent key', async () => {
    const res = await request(app)
      .delete('/api/v1/admin/keys/key_nonexistent')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(404);
  });

  it('requires name field', async () => {
    const res = await request(app)
      .post('/api/v1/admin/keys')
      .set('Authorization', `Bearer ${token}`)
      .send({});
    expect(res.status).toBe(400);
  });
});
