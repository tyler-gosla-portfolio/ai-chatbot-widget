/**
 * E2E test server — starts the full app on port 4567 with mocked OpenAI.
 * Used by Playwright's webServer config.
 */
import express from 'express';
import helmet from 'helmet';
import path from 'path';
import { fileURLToPath } from 'url';
import Database from 'better-sqlite3';
import fs from 'fs';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '../..');

const JWT_SECRET = 'test-jwt-secret-that-is-at-least-32-chars-long!!';

// ── In-memory DB ─────────────────────────────────────────────────────────────
const db = new Database(':memory:');
db.pragma('foreign_keys = ON');
const sql = fs.readFileSync(path.join(ROOT, 'src/db/migrations/001_initial.sql'), 'utf8');
db.exec(sql);
db.prepare(`INSERT OR IGNORE INTO bot_config (id) VALUES ('default')`).run();

// Seed admin
const adminHash = await bcrypt.hash('testpassword123', 10);
db.prepare(`INSERT INTO admins (id, email, password) VALUES (?, ?, ?)`)
  .run('adm_e2e', 'admin@test.com', adminHash);

// Seed API key
const E2E_API_KEY = 'pk_live_' + 'e'.repeat(48);
db.prepare(`INSERT INTO api_keys (id, api_key, name, allowed_origins, is_active) VALUES (?, ?, ?, ?, 1)`)
  .run('key_e2e', E2E_API_KEY, 'E2E Test Key', '[]');

// Store for external access
globalThis.__e2eDb = db;
globalThis.__e2eApiKey = E2E_API_KEY;

// ── Mock OpenAI ────────────────────────────────────────────────────────────
// Patch the openai module by replacing it before routes load
const mockOpenAIModule = {
  default: class MockOpenAI {
    constructor() {
      this.embeddings = {
        create: async ({ input }) => ({
          data: (Array.isArray(input) ? input : [input]).map(() => ({
            embedding: new Array(1536).fill(0.1),
          })),
        }),
      };
      this.chat = {
        completions: {
          create: async () => {
            async function* gen() {
              yield { choices: [{ delta: { content: 'Hello! ' } }] };
              yield { choices: [{ delta: { content: 'This is a mocked E2E response.' } }] };
              yield { choices: [{ delta: {} }] };
            }
            const g = gen();
            g.controller = { abort: () => {} };
            return g;
          },
        },
      };
    }
  },
};

// ── Minimal app ────────────────────────────────────────────────────────────
const app = express();
app.use(helmet({ contentSecurityPolicy: false }));
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));

// Serve widget static files
const widgetDist = path.join(ROOT, 'widget/dist');
app.use('/widget', express.static(widgetDist));

// Serve admin panel
const adminDist = path.join(ROOT, 'admin/dist');
app.use('/admin', express.static(adminDist));
app.get('/admin/*', (req, res) => {
  res.sendFile(path.join(adminDist, 'index.html'));
});

// Expose test config for widget demo page
app.get('/e2e-config', (req, res) => {
  res.json({ apiKey: E2E_API_KEY });
});

// Serve a test HTML page that embeds the widget
app.get('/test-widget', (req, res) => {
  const attrs = req.query.attrs || '';
  res.setHeader('Content-Type', 'text/html');
  res.send(`<!DOCTYPE html>
<html>
<head><title>Widget E2E Test</title></head>
<body>
  <h1>Widget Test Page</h1>
  <script
    src="/widget/chatbot.js"
    data-api-key="${E2E_API_KEY}"
    data-api-url="http://localhost:4567"
    data-bot-name="Test Bot"
    data-welcome-message="Hello! How can I help?"
    ${attrs}
  ></script>
</body>
</html>`);
});

// Health
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Admin login
app.post('/api/v1/admin/login', express.json(), async (req, res) => {
  const { email, password } = req.body || {};
  const admin = db.prepare('SELECT * FROM admins WHERE email = ?').get(email);
  if (!admin || !(await bcrypt.compare(password, admin.password))) {
    return res.status(401).json({ error: 'unauthorized' });
  }
  const token = jwt.sign({ id: admin.id, email: admin.email }, JWT_SECRET, { expiresIn: '1h' });
  res.json({ token, expiresIn: 3600 });
});

// Admin auth middleware
function adminAuth(req, res, next) {
  const auth = req.headers.authorization;
  if (!auth?.startsWith('Bearer ')) return res.status(401).json({ error: 'unauthorized' });
  try {
    req.admin = jwt.verify(auth.slice(7), JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: 'unauthorized' });
  }
}

// API key auth
function apiKeyAuth(req, res, next) {
  const key = req.headers['x-api-key'];
  if (!key) return res.status(401).json({ error: 'invalid_api_key' });
  const row = db.prepare('SELECT * FROM api_keys WHERE api_key = ? AND is_active = 1').get(key);
  if (!row) return res.status(401).json({ error: 'invalid_api_key' });
  req.apiKey = row;
  next();
}

// Keys routes
app.get('/api/v1/admin/keys', adminAuth, (req, res) => {
  const keys = db.prepare('SELECT id, name, allowed_origins, is_active, created_at FROM api_keys ORDER BY created_at DESC').all();
  res.json(keys.map(k => ({ ...k, allowedOrigins: JSON.parse(k.allowed_origins || '[]') })));
});

app.post('/api/v1/admin/keys', adminAuth, (req, res) => {
  const { name, allowedOrigins = [] } = req.body;
  if (!name) return res.status(400).json({ error: 'validation_error' });
  const id = `key_${Date.now()}`;
  const apiKey = `pk_live_${crypto.randomBytes(24).toString('hex')}`;
  db.prepare('INSERT INTO api_keys (id, api_key, name, allowed_origins) VALUES (?, ?, ?, ?)').run(id, apiKey, name, JSON.stringify(allowedOrigins));
  res.status(201).json({ id, apiKey, name, allowedOrigins });
});

app.delete('/api/v1/admin/keys/:id', adminAuth, (req, res) => {
  const row = db.prepare('SELECT id FROM api_keys WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'not_found' });
  db.prepare('UPDATE api_keys SET is_active = 0 WHERE id = ?').run(req.params.id);
  res.status(204).send();
});

// Config routes
app.get('/api/v1/admin/config', adminAuth, (req, res) => {
  res.json(db.prepare('SELECT * FROM bot_config WHERE id = ?').get('default'));
});

app.patch('/api/v1/admin/config', adminAuth, (req, res) => {
  const { botName, systemPrompt, welcomeMessage, model, temperature, maxTokens } = req.body;
  const map = {};
  if (botName !== undefined) map.bot_name = botName;
  if (systemPrompt !== undefined) map.system_prompt = systemPrompt;
  if (welcomeMessage !== undefined) map.welcome_message = welcomeMessage;
  if (model !== undefined) map.model = model;
  if (temperature !== undefined) map.temperature = temperature;
  if (maxTokens !== undefined) map.max_tokens = maxTokens;
  if (Object.keys(map).length > 0) {
    const sets = Object.keys(map).map(k => `${k} = ?`).join(', ');
    db.prepare(`UPDATE bot_config SET ${sets} WHERE id = 'default'`).run(...Object.values(map));
  }
  res.json(db.prepare('SELECT * FROM bot_config WHERE id = ?').get('default'));
});

// KB routes
app.get('/api/v1/admin/kb/documents', adminAuth, (req, res) => {
  const docs = db.prepare('SELECT * FROM documents ORDER BY created_at DESC').all();
  res.json({ documents: docs, total: docs.length });
});

// Chat route (SSE)
app.post('/api/v1/chat/message', apiKeyAuth, express.json(), async (req, res) => {
  const { message, sessionId } = req.body || {};
  if (!message) return res.status(400).json({ error: 'validation_error' });

  // Get or create session
  let session = sessionId
    ? db.prepare('SELECT * FROM sessions WHERE id = ? AND api_key_id = ?').get(sessionId, req.apiKey.id)
    : null;

  if (!session) {
    const sesId = `ses_${Date.now()}`;
    db.prepare('INSERT INTO sessions (id, api_key_id) VALUES (?, ?)').run(sesId, req.apiKey.id);
    session = { id: sesId };
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('X-Session-Id', session.id);

  const send = (data) => res.write(`data: ${JSON.stringify(data)}\n\n`);

  send({ type: 'start', sessionId: session.id });

  // Store user message
  db.prepare('INSERT INTO messages (id, session_id, role, content) VALUES (?, ?, ?, ?)').run(
    `msg_${Date.now()}u`, session.id, 'user', message
  );

  // Stream mock response
  const response = 'Hello! This is a mocked E2E response.';
  for (const word of response.split(' ')) {
    send({ type: 'token', content: word + ' ' });
    await new Promise(r => setTimeout(r, 10));
  }

  // Store assistant message
  db.prepare('INSERT INTO messages (id, session_id, role, content) VALUES (?, ?, ?, ?)').run(
    `msg_${Date.now()}a`, session.id, 'assistant', response
  );

  send({ type: 'done', messageId: `msg_${Date.now()}` });
  res.end();
});

app.get('/api/v1/chat/history/:sessionId', apiKeyAuth, (req, res) => {
  const session = db.prepare('SELECT * FROM sessions WHERE id = ? AND api_key_id = ?')
    .get(req.params.sessionId, req.apiKey.id);
  if (!session) return res.status(404).json({ error: 'not_found' });
  const messages = db.prepare('SELECT * FROM messages WHERE session_id = ? ORDER BY created_at').all(req.params.sessionId);
  res.json({ sessionId: req.params.sessionId, messages });
});

const PORT = process.env.PORT || 4567;
app.listen(PORT, () => {
  console.log(`E2E test server listening on port ${PORT}`);
});
