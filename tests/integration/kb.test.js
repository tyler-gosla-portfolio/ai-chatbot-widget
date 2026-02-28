import '../setup/env.js';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import path from 'path';
import { fileURLToPath } from 'url';
import { createTestDb } from '../setup/testDb.js';
import { createTestApp, makeAdminToken } from '../setup/testServer.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = path.join(__dirname, '../fixtures');

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
vi.mock('../../src/services/embeddingService.js', () => ({
  findSimilarChunks: vi.fn(async () => []),
  loadAllEmbeddings: vi.fn(),
  embedTexts: vi.fn(async (texts) => texts.map(() => new Float32Array(1536).fill(0.1))),
  invalidateCache: vi.fn(),
}));
vi.mock('openai', () => ({ default: class { constructor() {} } }));

// Mock the job queue to avoid background processing
vi.mock('../../src/jobs/queue.js', () => ({
  enqueueJob: vi.fn(),
  startWorker: vi.fn(),
  stopWorker: vi.fn(),
  registerHandler: vi.fn(),
}));

beforeEach(() => {
  db = createTestDb();
  app = createTestApp(db);
  token = makeAdminToken();
});

describe('Knowledge Base — document upload', () => {
  it('uploads a .txt file', async () => {
    const res = await request(app)
      .post('/api/v1/admin/kb/documents')
      .set('Authorization', `Bearer ${token}`)
      .attach('file', path.join(FIXTURES_DIR, 'sample.txt'));
    expect(res.status).toBe(202);
    expect(res.body).toHaveProperty('id');
    expect(res.body.status).toBe('queued');
  });

  it('uploads a .md file', async () => {
    const res = await request(app)
      .post('/api/v1/admin/kb/documents')
      .set('Authorization', `Bearer ${token}`)
      .attach('file', path.join(FIXTURES_DIR, 'sample.md'));
    expect(res.status).toBe(202);
    expect(res.body).toHaveProperty('id');
  });

  it('rejects unsupported file types', async () => {
    const res = await request(app)
      .post('/api/v1/admin/kb/documents')
      .set('Authorization', `Bearer ${token}`)
      .attach('file', Buffer.from('<html>bad</html>'), {
        filename: 'malicious.html',
        contentType: 'text/html',
      });
    expect(res.status).toBe(400);
  });

  it('rejects request with no file', async () => {
    const res = await request(app)
      .post('/api/v1/admin/kb/documents')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(400);
  });

  it('requires auth', async () => {
    const res = await request(app)
      .post('/api/v1/admin/kb/documents')
      .attach('file', path.join(FIXTURES_DIR, 'sample.txt'));
    expect(res.status).toBe(401);
  });
});

describe('Knowledge Base — listing and deletion', () => {
  it('lists uploaded documents', async () => {
    // Seed a document directly
    db.prepare(`INSERT INTO documents (id, filename, mime_type, status) VALUES (?, ?, ?, ?)`)
      .run('doc_test1', 'test.txt', 'text/plain', 'processed');

    const res = await request(app)
      .get('/api/v1/admin/kb/documents')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('documents');
    expect(res.body.documents.length).toBe(1);
    expect(res.body.documents[0].filename).toBe('test.txt');
  });

  it('deletes a document', async () => {
    db.prepare(`INSERT INTO documents (id, filename, mime_type, status) VALUES (?, ?, ?, ?)`)
      .run('doc_del1', 'delete-me.txt', 'text/plain', 'processed');

    const res = await request(app)
      .delete('/api/v1/admin/kb/documents/doc_del1')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(204);

    // Verify deletion
    const doc = db.prepare('SELECT id FROM documents WHERE id = ?').get('doc_del1');
    expect(doc).toBeUndefined();
  });

  it('delete cascades to chunks', async () => {
    db.prepare(`INSERT INTO documents (id, filename, mime_type, status) VALUES (?, ?, ?, ?)`)
      .run('doc_cascade', 'cascade.txt', 'text/plain', 'processed');
    db.prepare(`INSERT INTO chunks (id, document_id, content, chunk_index) VALUES (?, ?, ?, ?)`)
      .run('chk_1', 'doc_cascade', 'Some chunk content here', 0);

    await request(app)
      .delete('/api/v1/admin/kb/documents/doc_cascade')
      .set('Authorization', `Bearer ${token}`);

    const chunk = db.prepare('SELECT id FROM chunks WHERE document_id = ?').get('doc_cascade');
    expect(chunk).toBeUndefined();
  });

  it('returns 404 for non-existent document', async () => {
    const res = await request(app)
      .delete('/api/v1/admin/kb/documents/doc_nonexistent')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(404);
  });
});
