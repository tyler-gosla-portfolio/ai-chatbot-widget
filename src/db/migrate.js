import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import logger from '../utils/logger.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const migrationsDir = path.join(__dirname, 'migrations');

export function runMigrations(db) {
  // Ensure migrations table exists
  db.exec(`
    CREATE TABLE IF NOT EXISTS _migrations (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      filename    TEXT UNIQUE NOT NULL,
      applied_at  TEXT DEFAULT (datetime('now'))
    )
  `);

  const applied = new Set(
    db.prepare('SELECT filename FROM _migrations').all().map(r => r.filename)
  );

  const files = fs.readdirSync(migrationsDir)
    .filter(f => f.endsWith('.sql'))
    .sort();

  const pending = files.filter(f => !applied.has(f));

  if (pending.length === 0) {
    logger.info('Database migrations: up to date');
    return;
  }

  for (const file of pending) {
    const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
    logger.info(`Applying migration: ${file}`);
    try {
      db.transaction(() => {
        db.exec(sql);
        db.prepare('INSERT OR IGNORE INTO _migrations (filename) VALUES (?)').run(file);
      })();
      logger.info(`Migration applied: ${file}`);
    } catch (err) {
      logger.error(`Migration failed: ${file}`, { error: err.message });
      throw err;
    }
  }
}
