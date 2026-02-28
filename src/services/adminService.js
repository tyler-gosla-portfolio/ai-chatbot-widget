import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { getDb } from '../db/connection.js';
import { env } from '../config.js';
import { newKeyId, newAdminId, generateApiKey } from '../utils/ids.js';
import logger from '../utils/logger.js';

export async function loginAdmin(email, password) {
  const db = getDb();
  const admin = db.prepare('SELECT * FROM admins WHERE email = ?').get(email);
  if (!admin) throw Object.assign(new Error('Invalid credentials'), { status: 401, code: 'unauthorized' });

  const valid = await bcrypt.compare(password, admin.password);
  if (!valid) throw Object.assign(new Error('Invalid credentials'), { status: 401, code: 'unauthorized' });

  const token = jwt.sign({ id: admin.id, email: admin.email }, env.JWT_SECRET, { expiresIn: '24h' });
  return { token, expiresIn: 86400 };
}

export function createApiKey(name, allowedOrigins = []) {
  if (allowedOrigins.length === 0) {
    logger.warn(`Creating API key "${name}" without allowedOrigins — for development only`);
  }
  const db = getDb();
  const id = newKeyId();
  const apiKey = generateApiKey();
  db.prepare(`
    INSERT INTO api_keys (id, api_key, name, allowed_origins) VALUES (?, ?, ?, ?)
  `).run(id, apiKey, name, JSON.stringify(allowedOrigins));
  return { id, apiKey, name, allowedOrigins, createdAt: new Date().toISOString() };
}

export function listApiKeys() {
  const db = getDb();
  return db.prepare('SELECT id, name, allowed_origins, is_active, created_at, last_used FROM api_keys ORDER BY created_at DESC').all()
    .map(k => ({ ...k, allowedOrigins: JSON.parse(k.allowed_origins || '[]') }));
}

export function deleteApiKey(id) {
  const db = getDb();
  const key = db.prepare('SELECT id FROM api_keys WHERE id = ?').get(id);
  if (!key) throw Object.assign(new Error('API key not found'), { status: 404, code: 'not_found' });
  db.prepare('UPDATE api_keys SET is_active = 0 WHERE id = ?').run(id);
}

export function rotateApiKey(id) {
  const db = getDb();
  const key = db.prepare('SELECT * FROM api_keys WHERE id = ?').get(id);
  if (!key) throw Object.assign(new Error('API key not found'), { status: 404, code: 'not_found' });
  const newKey = generateApiKey();
  db.prepare('UPDATE api_keys SET api_key = ? WHERE id = ?').run(newKey, id);
  return { id, apiKey: newKey, name: key.name };
}

export function getBotConfig() {
  const db = getDb();
  return db.prepare('SELECT * FROM bot_config WHERE id = ?').get('default');
}

const ALLOWED_CONFIG_COLUMNS = new Set(['bot_name', 'system_prompt', 'welcome_message', 'model', 'temperature', 'max_tokens', 'similarity_threshold']);

export function updateBotConfig(fields) {
  const db = getDb();
  const updates = Object.entries(fields).filter(([k]) => ALLOWED_CONFIG_COLUMNS.has(k));
  if (updates.length === 0) return getBotConfig();
  // Extra assertion: column names must be lowercase letters/underscores only
  for (const [k] of updates) {
    if (!/^[a-z_]+$/.test(k)) throw Object.assign(new Error(`Invalid column: ${k}`), { status: 400, code: 'bad_request' });
  }
  const setClauses = updates.map(([k]) => `${k} = ?`).join(', ');
  const values = updates.map(([, v]) => v);
  db.prepare(`UPDATE bot_config SET ${setClauses} WHERE id = 'default'`).run(...values);
  return getBotConfig();
}
