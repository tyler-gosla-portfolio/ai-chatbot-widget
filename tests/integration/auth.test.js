import '../setup/env.js';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import { createTestDb } from '../setup/testDb.js';
import { createTestApp, seedAdmin, makeAdminToken, makeExpiredToken } from '../setup/testServer.js';

let db;
let app;

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

beforeEach(async () => {
  db = createTestDb();
  app = createTestApp(db);
  await seedAdmin(db);
});

describe('POST /api/v1/admin/login', () => {
  it('returns token on valid credentials', async () => {
    const res = await request(app)
      .post('/api/v1/admin/login')
      .send({ email: 'admin@test.com', password: 'password123' });
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('token');
    expect(res.body.expiresIn).toBe(86400);
  });

  it('returns 401 for wrong password', async () => {
    const res = await request(app)
      .post('/api/v1/admin/login')
      .send({ email: 'admin@test.com', password: 'wrongpassword' });
    expect(res.status).toBe(401);
  });

  it('returns 401 for unknown email', async () => {
    const res = await request(app)
      .post('/api/v1/admin/login')
      .send({ email: 'nobody@test.com', password: 'password123' });
    expect(res.status).toBe(401);
  });

  it('returns 400 for invalid email format', async () => {
    const res = await request(app)
      .post('/api/v1/admin/login')
      .send({ email: 'not-an-email', password: 'password123' });
    expect(res.status).toBe(400);
  });

  it('returns 400 for missing fields', async () => {
    const res = await request(app)
      .post('/api/v1/admin/login')
      .send({ email: 'admin@test.com' });
    expect(res.status).toBe(400);
  });

  it('brute-force rate limiting: 429 after 5 attempts', async () => {
    // Make 5 failed attempts
    for (let i = 0; i < 5; i++) {
      await request(app)
        .post('/api/v1/admin/login')
        .send({ email: 'admin@test.com', password: 'wrong' })
        .set('X-Forwarded-For', '10.0.0.1');
    }
    // 6th attempt should be rate limited
    const res = await request(app)
      .post('/api/v1/admin/login')
      .send({ email: 'admin@test.com', password: 'wrong' })
      .set('X-Forwarded-For', '10.0.0.1');
    expect(res.status).toBe(429);
  });
});

describe('Admin JWT middleware', () => {
  it('protected routes reject missing token', async () => {
    const res = await request(app).get('/api/v1/admin/keys');
    expect(res.status).toBe(401);
  });

  it('protected routes reject expired token', async () => {
    const token = makeExpiredToken();
    const res = await request(app)
      .get('/api/v1/admin/keys')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(401);
  });

  it('protected routes reject invalid token', async () => {
    const res = await request(app)
      .get('/api/v1/admin/keys')
      .set('Authorization', 'Bearer totally.invalid.token');
    expect(res.status).toBe(401);
  });

  it('protected routes accept valid token', async () => {
    const token = makeAdminToken();
    const res = await request(app)
      .get('/api/v1/admin/keys')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
  });
});
