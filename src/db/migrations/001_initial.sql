-- Migration tracking
CREATE TABLE IF NOT EXISTS _migrations (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  filename    TEXT UNIQUE NOT NULL,
  applied_at  TEXT DEFAULT (datetime('now'))
);

-- API keys for widget authentication
CREATE TABLE IF NOT EXISTS api_keys (
  id              TEXT PRIMARY KEY,
  api_key         TEXT UNIQUE NOT NULL,
  name            TEXT NOT NULL,
  allowed_origins TEXT DEFAULT '[]',
  is_active       INTEGER DEFAULT 1,
  created_at      TEXT DEFAULT (datetime('now')),
  last_used       TEXT
);
CREATE INDEX IF NOT EXISTS idx_api_keys_key ON api_keys(api_key);

-- Admin users
CREATE TABLE IF NOT EXISTS admins (
  id          TEXT PRIMARY KEY,
  email       TEXT UNIQUE NOT NULL,
  password    TEXT NOT NULL,
  created_at  TEXT DEFAULT (datetime('now'))
);

-- Bot configuration (single row)
CREATE TABLE IF NOT EXISTS bot_config (
  id                   TEXT PRIMARY KEY DEFAULT 'default',
  bot_name             TEXT DEFAULT 'AI Assistant',
  system_prompt        TEXT DEFAULT 'You are a helpful assistant.',
  welcome_message      TEXT DEFAULT 'Hi! How can I help you today?',
  model                TEXT DEFAULT 'gpt-4o-mini',
  temperature          REAL DEFAULT 0.7,
  max_tokens           INTEGER DEFAULT 500,
  similarity_threshold REAL DEFAULT 0.7
);

-- Uploaded documents
CREATE TABLE IF NOT EXISTS documents (
  id               TEXT PRIMARY KEY,
  filename         TEXT NOT NULL,
  mime_type        TEXT NOT NULL,
  raw_text         TEXT,
  metadata         TEXT DEFAULT '{}',
  status           TEXT DEFAULT 'queued',
  error_message    TEXT,
  chunk_count      INTEGER DEFAULT 0,
  chunks_processed INTEGER DEFAULT 0,
  file_size        INTEGER,
  created_at       TEXT DEFAULT (datetime('now'))
);

-- Document chunks with embeddings
CREATE TABLE IF NOT EXISTS chunks (
  id          TEXT PRIMARY KEY,
  document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  content     TEXT NOT NULL,
  chunk_index INTEGER NOT NULL,
  embedding   BLOB,
  token_count INTEGER,
  metadata    TEXT DEFAULT '{}',
  created_at  TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_chunks_doc ON chunks(document_id);

-- Chat sessions
CREATE TABLE IF NOT EXISTS sessions (
  id          TEXT PRIMARY KEY,
  api_key_id  TEXT NOT NULL REFERENCES api_keys(id),
  origin      TEXT,
  metadata    TEXT DEFAULT '{}',
  created_at  TEXT DEFAULT (datetime('now')),
  last_active TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_sessions_key ON sessions(api_key_id);

-- Chat messages
CREATE TABLE IF NOT EXISTS messages (
  id          TEXT PRIMARY KEY,
  session_id  TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  role        TEXT NOT NULL CHECK(role IN ('user', 'assistant', 'system')),
  content     TEXT NOT NULL,
  token_count INTEGER,
  created_at  TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_messages_session ON messages(session_id);

-- Job queue for async document processing
CREATE TABLE IF NOT EXISTS jobs (
  id           TEXT PRIMARY KEY,
  type         TEXT NOT NULL,
  payload      TEXT NOT NULL,
  status       TEXT DEFAULT 'pending',
  attempts     INTEGER DEFAULT 0,
  max_attempts INTEGER DEFAULT 3,
  error        TEXT,
  created_at   TEXT DEFAULT (datetime('now')),
  started_at   TEXT,
  completed_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs(status);
