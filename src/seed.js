import bcrypt from 'bcrypt';
import { getDb } from './db/connection.js';
import { runMigrations } from './db/migrate.js';
import { newAdminId } from './utils/ids.js';
import { env } from './config.js';
import logger from './utils/logger.js';

async function seed() {
  const db = getDb();
  runMigrations(db);

  // Create default bot config
  const existingConfig = db.prepare('SELECT id FROM bot_config WHERE id = ?').get('default');
  if (!existingConfig) {
    db.prepare(`
      INSERT INTO bot_config (id, bot_name, system_prompt, welcome_message, model, temperature, max_tokens, similarity_threshold)
      VALUES ('default', 'AI Assistant', 'You are a helpful assistant.', 'Hi! How can I help you today?', 'gpt-4o-mini', 0.7, 500, 0.7)
    `).run();
    logger.info('Default bot config created');
  } else {
    logger.info('Bot config already exists, skipping');
  }

  // Create admin user
  const existingAdmin = db.prepare('SELECT id FROM admins WHERE email = ?').get(env.ADMIN_EMAIL);
  if (!existingAdmin) {
    const hash = await bcrypt.hash(env.ADMIN_PASSWORD, 12);
    db.prepare('INSERT INTO admins (id, email, password) VALUES (?, ?, ?)').run(
      newAdminId(), env.ADMIN_EMAIL, hash
    );
    logger.info(`Admin user created: ${env.ADMIN_EMAIL}`);
  } else {
    logger.info(`Admin already exists: ${env.ADMIN_EMAIL}`);
  }

  logger.info('Seed complete');
  process.exit(0);
}

seed().catch(err => {
  console.error('Seed failed:', err);
  process.exit(1);
});
