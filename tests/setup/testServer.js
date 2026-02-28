/**
 * Test server that starts express app with an in-memory SQLite DB.
 * Patches DB and config before importing app routes.
 */
import express from 'express';
import helmet from 'helmet';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';
import { createTestDb } from './testDb.js';
import { dynamicCors } from '../../src/middleware/cors.js';
import { errorHandler } from '../../src/middleware/errorHandler.js';

// Import routes directly (they will use the patched getDb)
import healthRouter from '../../src/routes/health.js';
import adminRouter from '../../src/routes/admin.js';
import keysRouter from '../../src/routes/keys.js';
import kbRouter from '../../src/routes/kb.js';
import configRouter from '../../src/routes/config.js';
import chatRouter from '../../src/routes/chat.js';

export const JWT_SECRET = 'test-jwt-secret-that-is-at-least-32-chars-long!!';

export function createTestApp(db) {
  const app = express();
  app.use(helmet({ contentSecurityPolicy: false }));
  app.use(dynamicCors);
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: true }));

  app.use('/health', healthRouter);
  app.use('/api/v1/chat', chatRouter);
  app.use('/api/v1/admin', adminRouter);
  app.use('/api/v1/admin/keys', keysRouter);
  app.use('/api/v1/admin/kb', kbRouter);
  app.use('/api/v1/admin/config', configRouter);

  app.use(errorHandler);
  return app;
}

export function makeAdminToken(payload = { id: 'adm_test', email: 'admin@test.com' }) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '1h' });
}

export function makeExpiredToken() {
  return jwt.sign({ id: 'adm_test', email: 'admin@test.com' }, JWT_SECRET, { expiresIn: -1 });
}

export async function seedAdmin(db, email = 'admin@test.com', password = 'password123') {
  const hash = await bcrypt.hash(password, 10);
  const id = 'adm_test';
  db.prepare('INSERT OR REPLACE INTO admins (id, email, password) VALUES (?, ?, ?)').run(id, email, hash);
  return { id, email, password };
}

export function seedApiKey(db, opts = {}) {
  const id = opts.id || `key_${Math.random().toString(36).slice(2)}`;
  const apiKey = opts.apiKey || `pk_live_${'a'.repeat(48)}`;
  const name = opts.name || 'Test Key';
  const origins = JSON.stringify(opts.allowedOrigins || []);
  const isActive = opts.isActive !== undefined ? opts.isActive : 1;
  db.prepare(`INSERT INTO api_keys (id, api_key, name, allowed_origins, is_active) VALUES (?, ?, ?, ?, ?)`)
    .run(id, apiKey, name, origins, isActive);
  return { id, apiKey, name };
}
