import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { env } from '../config.js';
import logger from '../utils/logger.js';

let db;

export function getDb() {
  if (!db) {
    const dbPath = env.DB_PATH;
    const dir = path.dirname(dbPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    db = new Database(dbPath);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
    db.pragma('synchronous = NORMAL');
    logger.info(`SQLite connected: ${dbPath}`);
  }
  return db;
}

export function closeDb() {
  if (db) {
    db.close();
    db = null;
  }
}

export default getDb;
