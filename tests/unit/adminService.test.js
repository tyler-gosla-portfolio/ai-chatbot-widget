import '../setup/env.js';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';
import { createTestDb } from '../setup/testDb.js';

// We'll test adminService functions in isolation using a real in-memory DB
// Mock DB connection to return our test DB
let testDb;

vi.mock('../../src/db/connection.js', () => ({
  getDb: vi.fn(() => testDb),
}));

vi.mock('../../src/config.js', () => ({
  env: {
    JWT_SECRET: 'test-jwt-secret-that-is-at-least-32-chars-long!!',
    OPENAI_API_KEY: 'sk-test',
    NODE_ENV: 'test',
  },
}));

vi.mock('../../src/utils/logger.js', () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

const {
  loginAdmin,
  createApiKey,
  listApiKeys,
  deleteApiKey,
  rotateApiKey,
  getBotConfig,
  updateBotConfig,
} = await import('../../src/services/adminService.js');

const { generateApiKey, newAdminId } = await import('../../src/utils/ids.js');

const JWT_SECRET = 'test-jwt-secret-that-is-at-least-32-chars-long!!';

async function seedAdmin(email = 'admin@test.com', password = 'password123') {
  const hash = await bcrypt.hash(password, 10);
  const id = newAdminId();
  testDb.prepare('INSERT INTO admins (id, email, password) VALUES (?, ?, ?)').run(id, email, hash);
  return { id, email, password };
}

beforeEach(() => {
  testDb = createTestDb();
});

describe('adminService — loginAdmin', () => {
  it('returns JWT token on successful login', async () => {
    const { email, password } = await seedAdmin();
    const result = await loginAdmin(email, password);
    expect(result).toHaveProperty('token');
    expect(result).toHaveProperty('expiresIn', 86400);
    // Verify the token is valid
    const payload = jwt.verify(result.token, JWT_SECRET);
    expect(payload.email).toBe(email);
  });

  it('throws 401 for non-existent email', async () => {
    await expect(loginAdmin('nobody@test.com', 'password')).rejects.toMatchObject({
      status: 401,
      code: 'unauthorized',
    });
  });

  it('throws 401 for wrong password', async () => {
    const { email } = await seedAdmin();
    await expect(loginAdmin(email, 'wrongpassword')).rejects.toMatchObject({
      status: 401,
      code: 'unauthorized',
    });
  });

  it('generated token has 24h expiry', async () => {
    const { email, password } = await seedAdmin();
    const { token } = await loginAdmin(email, password);
    const payload = jwt.verify(token, JWT_SECRET);
    const expiresIn = payload.exp - payload.iat;
    expect(expiresIn).toBe(86400);
  });

  it('expired token fails verification', () => {
    const expiredToken = jwt.sign(
      { id: 'adm_test', email: 'admin@test.com' },
      JWT_SECRET,
      { expiresIn: -1 } // immediately expired
    );
    expect(() => jwt.verify(expiredToken, JWT_SECRET)).toThrow(/expired/);
  });

  it('tampered token fails verification', async () => {
    const { email, password } = await seedAdmin();
    const { token } = await loginAdmin(email, password);
    const tampered = token.slice(0, -5) + 'XXXXX';
    expect(() => jwt.verify(tampered, JWT_SECRET)).toThrow();
  });
});

describe('adminService — API key management', () => {
  it('creates an API key with correct format', () => {
    const result = createApiKey('Test Key');
    expect(result.apiKey).toMatch(/^pk_live_[a-f0-9]{48}$/);
    expect(result.name).toBe('Test Key');
    expect(result.allowedOrigins).toEqual([]);
    expect(result.id).toMatch(/^key_/);
  });

  it('creates key with allowed origins', () => {
    const origins = ['https://example.com', 'https://app.example.com'];
    const result = createApiKey('Widget', origins);
    expect(result.allowedOrigins).toEqual(origins);
    // Verify persisted in DB
    const row = testDb.prepare('SELECT allowed_origins FROM api_keys WHERE id = ?').get(result.id);
    expect(JSON.parse(row.allowed_origins)).toEqual(origins);
  });

  it('lists all API keys', () => {
    createApiKey('Key One');
    createApiKey('Key Two');
    const keys = listApiKeys();
    expect(keys.length).toBe(2);
    expect(keys[0]).toHaveProperty('name');
    expect(keys[0]).toHaveProperty('allowedOrigins');
    expect(keys[0]).not.toHaveProperty('api_key'); // raw key not in list
  });

  it('generated keys are unique', () => {
    const keys = Array.from({ length: 20 }, () => generateApiKey());
    expect(new Set(keys).size).toBe(20);
  });

  it('deleteApiKey deactivates the key (soft delete)', () => {
    const { id } = createApiKey('To Delete');
    deleteApiKey(id);
    const row = testDb.prepare('SELECT is_active FROM api_keys WHERE id = ?').get(id);
    expect(row.is_active).toBe(0);
  });

  it('deleteApiKey throws 404 for non-existent key', () => {
    expect(() => deleteApiKey('key_nonexistent')).toThrow();
    try {
      deleteApiKey('key_nonexistent');
    } catch (e) {
      expect(e.status).toBe(404);
    }
  });

  it('rotateApiKey generates a new key value', () => {
    const { id, apiKey: oldKey } = createApiKey('Rotating Key');
    const result = rotateApiKey(id);
    expect(result.apiKey).toMatch(/^pk_live_/);
    expect(result.apiKey).not.toBe(oldKey);
    // Verify in DB
    const row = testDb.prepare('SELECT api_key FROM api_keys WHERE id = ?').get(id);
    expect(row.api_key).toBe(result.apiKey);
  });
});

describe('adminService — bot config', () => {
  it('getBotConfig returns default row', () => {
    const cfg = getBotConfig();
    expect(cfg).not.toBeNull();
    expect(cfg.id).toBe('default');
    expect(cfg.bot_name).toBe('AI Assistant');
    expect(cfg.system_prompt).toBe('You are a helpful assistant.');
  });

  it('updateBotConfig updates allowed fields', () => {
    updateBotConfig({ bot_name: 'MyBot', temperature: 0.5 });
    const cfg = getBotConfig();
    expect(cfg.bot_name).toBe('MyBot');
    expect(cfg.temperature).toBe(0.5);
  });

  it('updateBotConfig ignores unknown fields', () => {
    updateBotConfig({ bot_name: 'SafeBot', evil_field: 'DROP TABLE admins' });
    const cfg = getBotConfig();
    expect(cfg.bot_name).toBe('SafeBot');
  });

  it('updateBotConfig returns no-op if no valid fields', () => {
    const before = getBotConfig();
    updateBotConfig({ unknown1: 'x', unknown2: 'y' });
    const after = getBotConfig();
    expect(after.bot_name).toBe(before.bot_name);
  });
});

describe('password hashing', () => {
  it('bcrypt hash is not plaintext', async () => {
    const password = 'mysecretpassword';
    const hash = await bcrypt.hash(password, 10);
    expect(hash).not.toBe(password);
    expect(hash.startsWith('$2b$')).toBe(true);
  });

  it('bcrypt compare works', async () => {
    const password = 'correcthorsebatterystaple';
    const hash = await bcrypt.hash(password, 10);
    expect(await bcrypt.compare(password, hash)).toBe(true);
    expect(await bcrypt.compare('wrongpassword', hash)).toBe(false);
  });
});
