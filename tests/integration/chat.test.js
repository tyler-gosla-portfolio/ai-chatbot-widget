import '../setup/env.js';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import { createTestDb } from '../setup/testDb.js';
import { createTestApp, seedApiKey } from '../setup/testServer.js';

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

vi.mock('../../src/services/embeddingService.js', () => ({
  findSimilarChunks: vi.fn(async () => []),
  loadAllEmbeddings: vi.fn(),
}));

vi.mock('openai', () => {
  const MockOpenAI = class {
    constructor() {
      this.embeddings = {
        create: vi.fn(async ({ input }) => ({
          data: (Array.isArray(input) ? input : [input]).map((_, i) => ({
            embedding: new Array(1536).fill(0.1),
          })),
        })),
      };
      this.chat = {
        completions: {
          create: vi.fn(async () => {
            async function* gen() {
              yield { choices: [{ delta: { content: 'Hello ' } }] };
              yield { choices: [{ delta: { content: 'world!' } }] };
              yield { choices: [{ delta: {} }] };
            }
            const g = gen();
            g.controller = { abort: vi.fn() };
            return g;
          }),
        },
      };
    }
  };
  return { default: MockOpenAI };
});

beforeEach(() => {
  db = createTestDb();
  app = createTestApp(db);
});

describe('Chat API — authentication', () => {
  it('rejects request without API key (401)', async () => {
    const res = await request(app)
      .post('/api/v1/chat/message')
      .send({ message: 'Hello' });
    expect(res.status).toBe(401);
  });

  it('rejects request with invalid API key (401)', async () => {
    const res = await request(app)
      .post('/api/v1/chat/message')
      .set('X-API-Key', 'pk_live_invalid')
      .send({ message: 'Hello' });
    expect(res.status).toBe(401);
  });

  it('rejects deactivated API key (401)', async () => {
    const { apiKey } = seedApiKey(db, { isActive: 0 });
    const res = await request(app)
      .post('/api/v1/chat/message')
      .set('X-API-Key', apiKey)
      .send({ message: 'Hello' });
    expect(res.status).toBe(401);
  });
});

describe('Chat API — message sending', () => {
  it('sends message and receives SSE stream with valid key', async () => {
    const { apiKey } = seedApiKey(db, { apiKey: 'pk_live_' + 'b'.repeat(48) });
    const res = await request(app)
      .post('/api/v1/chat/message')
      .set('X-API-Key', apiKey)
      .send({ message: 'Hello there!' });
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/event-stream');
  });

  it('SSE response contains start event with sessionId', async () => {
    const { apiKey } = seedApiKey(db, { apiKey: 'pk_live_' + 'c'.repeat(48) });
    const res = await request(app)
      .post('/api/v1/chat/message')
      .set('X-API-Key', apiKey)
      .send({ message: 'Test message' });
    expect(res.text).toContain('"type":"start"');
    expect(res.text).toContain('sessionId');
  });

  it('SSE response contains done event', async () => {
    const { apiKey } = seedApiKey(db, { apiKey: 'pk_live_' + 'd'.repeat(48) });
    const res = await request(app)
      .post('/api/v1/chat/message')
      .set('X-API-Key', apiKey)
      .send({ message: 'Test done' });
    expect(res.text).toContain('"type":"done"');
  });

  it('rejects empty message', async () => {
    const { apiKey } = seedApiKey(db, { apiKey: 'pk_live_' + 'e'.repeat(48) });
    const res = await request(app)
      .post('/api/v1/chat/message')
      .set('X-API-Key', apiKey)
      .send({ message: '' });
    expect(res.status).toBe(400);
  });

  it('rejects message over 2000 chars', async () => {
    const { apiKey } = seedApiKey(db, { apiKey: 'pk_live_' + 'f'.repeat(48) });
    const res = await request(app)
      .post('/api/v1/chat/message')
      .set('X-API-Key', apiKey)
      .send({ message: 'x'.repeat(2001) });
    expect(res.status).toBe(400);
  });
});

describe('Chat API — session history', () => {
  it('returns 404 for non-existent session', async () => {
    const { apiKey } = seedApiKey(db, { apiKey: 'pk_live_' + 'g'.repeat(48) });
    const res = await request(app)
      .get('/api/v1/chat/history/ses_nonexistent')
      .set('X-API-Key', apiKey);
    expect(res.status).toBe(404);
  });

  it('enforces session ownership across different API keys', async () => {
    const { apiKey: keyA, id: idA } = seedApiKey(db, { apiKey: 'pk_live_' + 'h'.repeat(48), id: 'key_A' });
    const { apiKey: keyB } = seedApiKey(db, { apiKey: 'pk_live_' + 'i'.repeat(48), id: 'key_B' });

    // Create a session for key A
    db.prepare('INSERT INTO sessions (id, api_key_id) VALUES (?, ?)').run('ses_owned_by_A', idA);

    // Key B should not be able to access key A's session
    const res = await request(app)
      .get('/api/v1/chat/history/ses_owned_by_A')
      .set('X-API-Key', keyB);
    expect(res.status).toBe(404);

    // Key A should access it fine
    const res2 = await request(app)
      .get('/api/v1/chat/history/ses_owned_by_A')
      .set('X-API-Key', keyA);
    expect(res2.status).toBe(200);
  });

  it('returns messages after chat', async () => {
    const apiKey = 'pk_live_' + 'j'.repeat(48);
    const { id: keyId } = seedApiKey(db, { apiKey, id: 'key_hist' });

    // Send a message to create a session
    const chatRes = await request(app)
      .post('/api/v1/chat/message')
      .set('X-API-Key', apiKey)
      .send({ message: 'Hello history' });

    // Extract sessionId from SSE
    const match = chatRes.text.match(/"sessionId":"([^"]+)"/);
    expect(match).toBeTruthy();
    const sessionId = match[1];

    const histRes = await request(app)
      .get(`/api/v1/chat/history/${sessionId}`)
      .set('X-API-Key', apiKey);
    expect(histRes.status).toBe(200);
    expect(histRes.body.messages.length).toBeGreaterThan(0);
  });
});
