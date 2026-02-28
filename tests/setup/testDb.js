/**
 * Test database setup — creates an in-memory SQLite DB, runs migrations,
 * seeds minimal data, and returns helpers for use in tests.
 */
import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const migrationSql = fs.readFileSync(
  path.join(__dirname, '../../src/db/migrations/001_initial.sql'),
  'utf8'
);

// Module-level singleton so multiple imports share the same DB in a test file
let _db = null;

export function createTestDb() {
  const db = new Database(':memory:');
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  // Run all migrations
  db.exec(migrationSql);

  // Seed bot_config default row
  db.prepare(`
    INSERT OR IGNORE INTO bot_config (id) VALUES ('default')
  `).run();

  return db;
}

export function getOrCreateTestDb() {
  if (!_db) _db = createTestDb();
  return _db;
}

export function resetTestDb() {
  _db = createTestDb();
  return _db;
}
