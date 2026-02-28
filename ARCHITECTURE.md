# AI Chatbot Widget — Technical Architecture

## 1. System Architecture

### Tenancy Decision: Single-Tenant Self-Hosted

**Decision (C1):** This is a **single-tenant, self-hosted** product. Each customer deploys their own instance. This simplifies the schema, eliminates tenant isolation complexity, and matches the Fiverr delivery model (one deployment per customer).

- One deployment = one bot = one knowledge base = one set of API keys
- No `bot_id` foreign keys needed
- Multi-tenancy is a future SaaS migration path (documented in Roadmap)

```
┌─────────────────────────────────────────────────────────┐
│                    Client Website                        │
│  <script src="https://host/widget/chatbot.js"            │
│          data-api-key="pk_xxx"                           │
│          data-theme-color="#4F46E5">                      │
│                                                          │
│  ┌──────────────────────┐                                │
│  │   Shadow DOM Widget  │  (mode: 'open')                │
│  │  ┌────────────────┐  │                                │
│  │  │  Chat Bubble   │  │                                │
│  │  │  Chat Window   │  │  role="dialog"                 │
│  │  │  Message List  │  │  aria-live="polite"            │
│  │  │  Input Bar     │  │                                │
│  │  └────────────────┘  │                                │
│  └──────────┬───────────┘                                │
└─────────────┼───────────────────────────────────────────┘
              │ HTTPS REST + SSE
              ▼
┌─────────────────────────────────────────────────────────┐
│                   API Server (Express)                   │
│                                                          │
│  ┌──────────┐  ┌──────────┐  ┌───────────┐              │
│  │ Chat     │  │ Knowledge│  │ Admin     │              │
│  │ Router   │  │ Base API │  │ Router    │              │
│  └────┬─────┘  └────┬─────┘  └─────┬─────┘              │
│       │              │              │                    │
│  ┌────▼──────────────▼──────────────▼─────┐              │
│  │          Service Layer                  │              │
│  │  ChatService  KBService  AdminService   │              │
│  └────┬──────────┬──────────────┬──────────┘              │
│       │          │              │                         │
│  ┌────▼────┐ ┌───▼────┐  ┌─────▼─────┐                  │
│  │ OpenAI  │ │  Job   │  │  SQLite   │                  │
│  │ Client  │ │ Queue  │  │ (better-  │                  │
│  │         │ │        │  │  sqlite3) │                  │
│  └─────────┘ └────────┘  └───────────┘                  │
└─────────────────────────────────────────────────────────┘
```

### Data Flow — Chat Message

1. User types message in widget
2. Widget POSTs to `/api/v1/chat/message` with API key header
3. Server validates API key
4. ChatService retrieves relevant KB chunks via cosine similarity search (threshold ≥ 0.7)
5. ChatService builds prompt: system prompt + KB context (≤3K tokens) + conversation history (last 10 turns, ≤4K tokens) + user message
6. Streamed response returned to widget via SSE (Server-Sent Events)
7. Server listens for `req.on('close')` — aborts OpenAI stream on client disconnect
8. Widget renders tokens as they arrive
9. Conversation stored in `sessions` table server-side, mirrored to namespaced `localStorage` client-side

### API Boundaries

| Boundary | Auth | Protocol |
|----------|------|----------|
| Widget → API | API key (`X-API-Key` header) | HTTPS REST + SSE |
| Admin Panel → API | Bearer JWT | HTTPS REST |
| API → OpenAI | OpenAI API key (server-side) | HTTPS |
| API → SQLite | Local file | N/A |

---

## 2. Technology Stack

### Backend

| Package | Version | Rationale |
|---------|---------|-----------|
| `node` | 20 LTS | Stable, long-term support |
| `express` | ^4.21 | Industry standard, lightweight |
| `better-sqlite3` | ^11.7 | Synchronous SQLite — fast, no async overhead, WAL mode. **Constraint: single-process only** (see §6 Embedding Cache) |
| `openai` | ^4.77 | Official SDK, streaming support |
| `multer` | ^1.4.5 | File upload handling (with UUID filename storage) |
| `pdfjs-dist` | ^4.9 | PDF text extraction (maintained by Mozilla, replaces unmaintained `pdf-parse`) |
| `uuid` | ^11.0 | API key and session ID generation |
| `helmet` | ^8.0 | Security headers |
| `cors` | ^2.8 | CORS configuration |
| `express-rate-limit` | ^7.5 | Rate limiting (in-memory store for v1) |
| `jsonwebtoken` | ^9.0 | Admin JWT auth |
| `bcrypt` | ^5.1 | Admin password hashing |
| `zod` | ^3.24 | Request validation + **environment validation on startup** |
| `dotenv` | ^16.4 | Environment config |
| `winston` | ^3.17 | Structured logging |

**Note on pdf-parse:** The original architecture specified `pdf-parse@1.1.1` which is unmaintained (last published 2018) and has known issues with malicious PDFs causing memory exhaustion. Replaced with `pdfjs-dist` (Mozilla's actively maintained PDF.js library). If `pdfjs-dist` proves too heavy, an alternative is `pdf2json`, but `pdfjs-dist` has the best maintenance track record.

### Frontend Widget

| Technology | Rationale |
|------------|-----------|
| Vanilla JS (ES2020) | Zero dependencies — must work on any site |
| Shadow DOM (`mode: 'open'`) | Style isolation + accessibility tool compatibility |
| CSS custom properties | Theming without rebuild |

### Admin Panel

| Package | Version | Rationale |
|---------|---------|-----------|
| `react` | ^19.0 | Admin-only, not embedded — framework is fine |
| `vite` | ^6.0 | Fast dev/build |
| `tailwindcss` | ^4.0 | Rapid UI styling |

### DevOps

| Tool | Version | Rationale |
|------|---------|-----------|
| `docker` | Compose v2 | Single-command deployment |
| `vitest` | ^3.0 | Fast, ESM-native testing |
| `playwright` | ^1.49 | E2E browser testing |
| `supertest` | ^7.0 | HTTP integration tests |
| `esbuild` | ^0.24 | Widget bundling (<50KB target) |

### Embedding Model

**OpenAI `text-embedding-3-small`** — 1536 dimensions, $0.02/1M tokens. Stored as raw float arrays in SQLite BLOB columns. Cosine similarity computed in JS (no external vector DB dependency).

**Scalability limit:** This approach works well for <50K chunks. Beyond that, migrate to `sqlite-vss` or `pgvector`. See Roadmap section.

---

## 3. API Design

Base URL: `/api/v1`

### 3.1 Chat

#### `POST /api/v1/chat/message`

Send a message and receive a streamed AI response.

**Headers:**
```
X-API-Key: pk_xxxxxxxxxxxxxxxx
Content-Type: application/json
```

**Request:**
```json
{
  "message": "How do I reset my password?",
  "sessionId": "ses_abc123"  // optional, creates new if omitted
}
```

**Response Headers:**
```
Content-Type: text/event-stream
X-Session-Id: ses_abc123
```

**Response Body:** SSE stream
```
data: {"type":"start","sessionId":"ses_abc123"}

data: {"type":"token","content":"To"}

data: {"type":"token","content":" reset"}

data: {"type":"token","content":" your password..."}

data: {"type":"done","messageId":"msg_xyz"}

```

**Error before stream starts:** JSON response with appropriate HTTP status:
```json
{ "error": "invalid_api_key", "message": "Invalid or revoked API key" }
```

**Error during stream:** SSE error event, then stream closes:
```
data: {"type":"error","code":"openai_error","message":"Service temporarily unavailable"}

```

**SSE Abort Handling:** Server listens for `req.on('close')` and aborts the OpenAI stream immediately to prevent resource leaks:
```js
req.on('close', () => {
  if (openaiStream?.controller) {
    openaiStream.controller.abort();
  }
});
```

#### `GET /api/v1/chat/history/:sessionId`

**Headers:** `X-API-Key`

**Authorization:** Server verifies the session's `api_key_id` matches the authenticated API key. Returns 404 if the session doesn't belong to this key (not 403, to prevent enumeration).

**Response:**
```json
{
  "sessionId": "ses_abc123",
  "messages": [
    { "id": "msg_1", "role": "user", "content": "Hello", "createdAt": "2026-02-28T21:00:00Z" },
    { "id": "msg_2", "role": "assistant", "content": "Hi! How can I help?", "createdAt": "2026-02-28T21:00:01Z" }
  ]
}
```

#### `DELETE /api/v1/chat/sessions/:sessionId`

Allows end-users to clear their own session history. Same ownership check as above.

**Response:** `204 No Content`

### 3.2 Knowledge Base (Admin)

#### `POST /api/v1/admin/kb/documents`

Upload a document to the knowledge base. Returns immediately with `202 Accepted` — processing happens asynchronously via the job queue.

**Headers:** `Authorization: Bearer <jwt>`

**Body:** `multipart/form-data`
- `file` — PDF, MD, or TXT (max 10MB)
- `metadata` — JSON string `{"title": "FAQ", "category": "support"}`

**Response (202 Accepted):**
```json
{
  "id": "doc_abc",
  "filename": "faq.pdf",
  "status": "queued",
  "createdAt": "2026-02-28T21:00:00Z"
}
```

#### `GET /api/v1/admin/kb/documents`

**Query params:** `?limit=20&offset=0` (paginated)

**Response:**
```json
{
  "documents": [
    { "id": "doc_abc", "filename": "faq.pdf", "chunks": 42, "status": "processed", "createdAt": "..." }
  ],
  "total": 1,
  "limit": 20,
  "offset": 0
}
```

#### `GET /api/v1/admin/kb/documents/:id`

Single document with chunk count and processing status.

#### `GET /api/v1/admin/kb/documents/:id/status`

Lightweight polling endpoint for processing progress:
```json
{
  "id": "doc_abc",
  "status": "processing",
  "chunksProcessed": 20,
  "chunksTotal": 42,
  "error": null
}
```

#### `DELETE /api/v1/admin/kb/documents/:id`

**Response:** `204 No Content`

#### `POST /api/v1/admin/kb/search`

Test retrieval quality without sending a chat message:
```json
{ "query": "password reset", "topK": 5 }
```
Returns matching chunks with similarity scores.

### 3.3 API Keys (Admin)

#### `POST /api/v1/admin/keys`

**Request:**
```json
{ "name": "Production Website", "allowedOrigins": ["https://example.com"] }
```

**Note:** `allowedOrigins` should always be set for production. Server logs a warning if empty.

**Response:**
```json
{
  "id": "key_abc",
  "apiKey": "pk_live_xxxxxxxxxxxxxxxxxxxxxxxxxxxx",
  "name": "Production Website",
  "createdAt": "2026-02-28T21:00:00Z"
}
```

#### `GET /api/v1/admin/keys`
#### `DELETE /api/v1/admin/keys/:id`
#### `POST /api/v1/admin/keys/:id/rotate`

Rotate an API key without deleting sessions/history tied to it.

### 3.4 Bot Config (Admin)

#### `GET /api/v1/admin/config`

Returns current bot configuration.

#### `PATCH /api/v1/admin/config`

Partial update — only fields included in the body are updated.

**Request:**
```json
{
  "botName": "Support Bot",
  "systemPrompt": "You are a helpful support agent for Acme Corp...",
  "welcomeMessage": "Hi! How can I help you today?",
  "model": "gpt-4o-mini",
  "temperature": 0.7,
  "maxTokens": 500,
  "similarityThreshold": 0.7
}
```

### 3.5 Admin Auth

#### `POST /api/v1/admin/login`

**Request:**
```json
{ "email": "admin@example.com", "password": "..." }
```

**Response:**
```json
{ "token": "eyJhbG...", "expiresIn": 86400 }
```

### 3.6 Health Check

#### `GET /health`

Returns server health for Docker healthcheck and monitoring:
```json
{ "status": "ok", "uptime": 3600, "dbStatus": "connected" }
```

### 3.7 Widget Assets

#### `GET /widget/chatbot.js` — Bundled widget JS
#### `GET /widget/chatbot.css` — Widget styles (inlined in JS, but available standalone)

### Error Response Schema

All error responses follow this contract:
```json
{
  "error": "error_code",
  "message": "Human-readable description"
}
```

Error codes: `invalid_api_key`, `unauthorized`, `forbidden`, `not_found`, `validation_error`, `rate_limited`, `processing_error`, `openai_error`, `internal_error`

---

## 4. Database Schema (SQLite)

```sql
-- Migration tracking
CREATE TABLE _migrations (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  filename    TEXT UNIQUE NOT NULL,          -- e.g., '001_initial.sql'
  applied_at  TEXT DEFAULT (datetime('now'))
);

-- API keys for widget authentication
CREATE TABLE api_keys (
  id          TEXT PRIMARY KEY,           -- 'key_' prefix + uuid
  api_key     TEXT UNIQUE NOT NULL,       -- 'pk_live_' + 32 random chars
  name        TEXT NOT NULL,
  allowed_origins TEXT DEFAULT '[]',      -- JSON array of allowed origins
  is_active   INTEGER DEFAULT 1,
  created_at  TEXT DEFAULT (datetime('now')),
  last_used   TEXT
);
CREATE INDEX idx_api_keys_key ON api_keys(api_key);

-- Admin users
CREATE TABLE admins (
  id          TEXT PRIMARY KEY,
  email       TEXT UNIQUE NOT NULL,
  password    TEXT NOT NULL,              -- bcrypt hash
  created_at  TEXT DEFAULT (datetime('now'))
);

-- Bot configuration (single row, keyed by id='default')
CREATE TABLE bot_config (
  id                  TEXT PRIMARY KEY DEFAULT 'default',
  bot_name            TEXT DEFAULT 'AI Assistant',
  system_prompt       TEXT DEFAULT 'You are a helpful assistant.',
  welcome_message     TEXT DEFAULT 'Hi! How can I help you today?',
  model               TEXT DEFAULT 'gpt-4o-mini',
  temperature         REAL DEFAULT 0.7,
  max_tokens          INTEGER DEFAULT 500,
  similarity_threshold REAL DEFAULT 0.7
);

-- Uploaded documents
CREATE TABLE documents (
  id          TEXT PRIMARY KEY,           -- 'doc_' prefix + uuid
  filename    TEXT NOT NULL,
  mime_type   TEXT NOT NULL,
  raw_text    TEXT,                       -- extracted full text
  metadata    TEXT DEFAULT '{}',          -- JSON
  status      TEXT DEFAULT 'queued',      -- queued | processing | processed | error
  error_message TEXT,                     -- error details if status='error'
  chunk_count INTEGER DEFAULT 0,
  chunks_processed INTEGER DEFAULT 0,     -- progress tracking
  file_size   INTEGER,
  created_at  TEXT DEFAULT (datetime('now'))
);

-- Document chunks with embeddings
CREATE TABLE chunks (
  id          TEXT PRIMARY KEY,           -- 'chk_' prefix + uuid
  document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  content     TEXT NOT NULL,              -- chunk text
  chunk_index INTEGER NOT NULL,           -- position in document
  embedding   BLOB,                      -- Float32Array (1536 × 4 = 6144 bytes)
  token_count INTEGER,
  metadata    TEXT DEFAULT '{}',          -- JSON: page_number, section_title, etc.
  created_at  TEXT DEFAULT (datetime('now'))
);
CREATE INDEX idx_chunks_doc ON chunks(document_id);

-- Chat sessions
CREATE TABLE sessions (
  id          TEXT PRIMARY KEY,           -- 'ses_' prefix + uuid
  api_key_id  TEXT NOT NULL REFERENCES api_keys(id),
  origin      TEXT,                       -- request origin domain
  metadata    TEXT DEFAULT '{}',          -- JSON (user agent, etc.)
  created_at  TEXT DEFAULT (datetime('now')),
  last_active TEXT DEFAULT (datetime('now'))
);
CREATE INDEX idx_sessions_key ON sessions(api_key_id);

-- Chat messages
CREATE TABLE messages (
  id          TEXT PRIMARY KEY,           -- 'msg_' prefix + uuid
  session_id  TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  role        TEXT NOT NULL CHECK(role IN ('user', 'assistant', 'system')),
  content     TEXT NOT NULL,
  token_count INTEGER,
  created_at  TEXT DEFAULT (datetime('now'))
);
CREATE INDEX idx_messages_session ON messages(session_id);

-- Job queue for async document processing
CREATE TABLE jobs (
  id          TEXT PRIMARY KEY,           -- 'job_' prefix + uuid
  type        TEXT NOT NULL,              -- 'embed_document'
  payload     TEXT NOT NULL,              -- JSON: { documentId: "doc_xxx" }
  status      TEXT DEFAULT 'pending',     -- pending | running | completed | failed
  attempts    INTEGER DEFAULT 0,
  max_attempts INTEGER DEFAULT 3,
  error       TEXT,
  created_at  TEXT DEFAULT (datetime('now')),
  started_at  TEXT,
  completed_at TEXT
);
CREATE INDEX idx_jobs_status ON jobs(status);
```

---

## 5. Widget Architecture

### Approach: Shadow DOM (`mode: 'open'`)

**Why Shadow DOM:** CSS isolation from host page — external CSS cannot penetrate, widget CSS cannot leak out. DOM encapsulation prevents ID/class collisions.

**Why `mode: 'open'` (not `closed`):**
- Closed mode blocks accessibility tools, browser extensions, and screen readers from accessing widget internals
- The public `ChatbotWidget` API works regardless of mode
- Style isolation is identical between open and closed — CSS still can't cross the shadow boundary
- Closed mode is designed for DRM, not style isolation

### Accessibility (WCAG 2.1 AA)

The widget implements these accessibility features:

- **Chat window:** `role="dialog"`, `aria-label="Chat with AI Assistant"`
- **Message list:** `aria-live="polite"` for screen reader announcements of new messages
- **Close button:** `aria-label="Close chat"`, visible focus ring
- **Focus management:** Opening the chat moves focus to the input field; closing returns focus to the chat bubble trigger
- **Focus trap:** Tab key cycles within the open chat window (input → send button → close button → input)
- **Keyboard:** Escape closes the window; Enter sends message

### Widget Initialization

```html
<script
  src="https://chatbot.example.com/widget/chatbot.js"
  data-api-key="pk_live_xxxxx"
  data-theme-color="#4F46E5"
  data-position="bottom-right"
  data-welcome="Hi! Ask me anything."
  defer
></script>
```

The script:
1. Reads `data-*` attributes from its own `<script>` tag
2. Creates a `<div id="chatbot-widget-root">` at document body end
3. Attaches Shadow DOM (`mode: 'open'`)
4. Injects all CSS inline within the shadow root
5. Renders the chat bubble + collapsible chat window with ARIA attributes
6. Initializes connection to API server

### localStorage Namespacing

All localStorage keys are namespaced to prevent collisions with host page storage:

```
chatbot_widget_{apiKeyPrefix}_session    → session ID
chatbot_widget_{apiKeyPrefix}_messages   → cached message history
chatbot_widget_{apiKeyPrefix}_state      → open/closed state
```

Where `{apiKeyPrefix}` is the first 8 characters of the API key.

### Network Error Handling

- **API unreachable:** Show inline error "Unable to connect. Please try again." with retry button. User's typed message is preserved.
- **SSE drops mid-response:** Show partial response with "(response interrupted)" suffix and retry button.
- **OpenAI timeout:** SSE error event rendered as "Taking longer than expected. Please try again."

### Event System

The widget exposes a global `ChatbotWidget` object:

```js
window.ChatbotWidget = {
  open()           // Open chat window
  close()          // Close chat window
  toggle()         // Toggle open/close
  sendMessage(msg) // Programmatically send a message
  destroy()        // Remove widget from page
  on(event, fn)    // Subscribe to events
  off(event, fn)   // Unsubscribe
}
```

**Events emitted:**
- `open` / `close` — window state change
- `message:sent` — user sent a message `{ message }`
- `message:received` — assistant responded `{ message }`
- `error` — something went wrong `{ error }`

### CSP Considerations

The widget needs:
- `connect-src` must allow the API server origin
- `script-src` must allow the widget script origin
- `style-src 'unsafe-inline'` is required for Shadow DOM injected styles (or use an external stylesheet via `<link>`)
- Documentation must include CSP guidance for integrators

### Bundle Target

- Single JS file, no external dependencies
- Target size: **<40KB gzipped**
- ES2020 syntax (covers 96%+ browsers)
- Built with esbuild, self-contained

---

## 6. Knowledge Base Pipeline

### Async Processing Architecture (C2)

Document processing is **asynchronous**. Upload returns immediately with `202 Accepted`; actual processing runs via a lightweight SQLite-backed job queue.

```
┌──────────┐     ┌──────────┐     ┌──────────────────────────────────────┐
│  Upload  │────▶│ Create   │────▶│           Job Queue Worker           │
│  (HTTP)  │     │ Job      │     │                                      │
│          │     │ (202)    │     │  ┌────────┐ ┌──────┐ ┌─────┐ ┌─────┐│
└──────────┘     └──────────┘     │  │Extract │→│Chunk │→│Embed│→│Store││
                                  │  └────────┘ └──────┘ └─────┘ └─────┘│
                                  └──────────────────────────────────────┘
```

**Job Queue Design:**
- Jobs stored in `jobs` table (see schema)
- Single in-process worker polls every 2 seconds for `status='pending'` jobs
- Worker picks one job at a time, sets `status='running'`
- On success: `status='completed'`, document `status='processed'`
- On failure: increment `attempts`, retry up to `max_attempts=3`, then `status='failed'` with error message
- Document `chunks_processed` updated incrementally for progress tracking
- **Single-process constraint:** The job worker runs in the same Node.js process as the API server. This is acceptable for v1 given the single-process SQLite constraint.

### Step 1: Upload
- Multer accepts file (PDF/MD/TXT, max 10MB)
- **Files saved with UUID filenames** to prevent path traversal: `multer.diskStorage({ filename: (req, file, cb) => cb(null, \`${uuidv4()}${path.extname(file.originalname)}\`) })`
- Document record created with `status: 'queued'`
- Job created in `jobs` table
- HTTP response returned immediately (202)

### Step 2: Extract Text (async, in worker)
- **PDF:** `pdfjs-dist` extracts text page by page (with page number metadata)
- **Markdown:** Read as-is, strip frontmatter, preserve heading structure
- **TXT:** Read as-is

### Step 3: Chunk
- **Strategy:** Document-type-aware recursive splitting
- **Chunk size:** 500 tokens (~2000 chars)
- **Overlap:** 50 tokens (~200 chars)
- **Markdown:** Split at `##`/`###` heading boundaries first, then within sections
- **PDF:** Preserve page boundaries as natural chunk separators
- **General fallback:** Prefer splitting at `\n\n` > `\n` > `. ` > ` `
- **Metadata captured per chunk:** `{ "page_number": N, "section_title": "...", "source_file": "..." }`

### Step 4: Embed
- Call OpenAI `text-embedding-3-small` in batches of 100 chunks
- Returns 1536-dimension float vectors
- Convert to `Float32Array` → `Buffer` for BLOB storage
- Update `chunks_processed` after each batch for progress reporting

### Step 5: Store
- Insert chunk text + embedding BLOB + metadata into `chunks` table
- Update document `status: 'processed'`, `chunk_count`
- Delete temp file from `uploads/` in a **finally block** (cleanup on both success and failure)
- Invalidate embedding cache

### Retrieval (at query time)

1. Embed the user's query → 1536-dim vector
2. Load all chunk embeddings from cache (see Embedding Cache below)
3. Compute cosine similarity: `dot(a,b) / (||a|| × ||b||)`
4. Return top-K chunks (K=5) with similarity ≥ **0.7** threshold (configurable via `bot_config.similarity_threshold`)
5. Fill greedily by similarity score until **3K token budget** for KB context is exhausted
6. Inject into system prompt with source attribution:

```
Use the following context to answer. If the context doesn't contain the answer, say so.
Cite sources when possible.

---
[Source: FAQ.pdf, Page 3, Section: "Password Reset"]
How do I reset my password? ...
---
[Source: Setup Guide.md, Section: "Getting Started"]
To get started, first install...
---
```

### Embedding Cache

**Constraint: Single-process deployment only.**

On server start, load all embeddings into an in-memory `Map<chunkId, Float32Array>`. This avoids repeated SQLite BLOB reads during similarity search.

- **Maximum cache size:** 50K chunks (~300MB). Beyond this, use LRU eviction or migrate to `sqlite-vss`.
- **Invalidation:** On document add/delete, clear and reload affected entries. Since this is a single-process server, there are no cross-process invalidation issues.
- **Multi-process note:** If you need multiple Node.js processes (e.g., behind PM2 cluster), you **must** migrate to `sqlite-vss` or `pgvector` — the in-memory cache cannot be shared across processes. This is a documented single-process constraint for v1.

---

## 7. Conversation Token Windowing

To prevent unbounded token growth and cost, conversation history is windowed before being sent to OpenAI:

**Token Budget Allocation:**
| Component | Max Tokens |
|-----------|-----------|
| System prompt | ~200 |
| KB context (retrieved chunks) | 3,000 |
| Conversation history | 4,000 |
| User's current message | ~500 |
| Model output (`max_tokens`) | 500 |
| **Total per request** | **~8,200** |

**Windowing Strategy:**
1. Always include the system prompt and KB context
2. Include conversation history from most recent to oldest
3. Stop adding history when the 4K token budget is exhausted
4. As a fallback cap: maximum 10 message pairs (20 messages) regardless of token count
5. Token counting uses a lightweight approximation: `Math.ceil(text.length / 4)` (accurate enough for English, avoids tiktoken dependency)

---

## 8. Security

### API Key Authentication

- Keys prefixed `pk_live_` + 32 cryptographically random hex chars
- Stored in `api_keys` table, looked up on every request
- Keys checked via constant-time comparison (`crypto.timingSafeEqual`)
- Revocation: set `is_active = 0`

### Session Ownership Enforcement (C3)

All session-scoped endpoints (`GET /chat/history/:sessionId`, `DELETE /chat/sessions/:sessionId`) verify that the session's `api_key_id` matches the authenticated API key:

```sql
SELECT * FROM sessions WHERE id = ? AND api_key_id = ?
```

Returns 404 (not 403) on mismatch to prevent session ID enumeration.

### Origin Validation

- Each API key has an `allowed_origins` JSON array
- Server checks `Origin` header against allowed list
- Empty array = **development mode only** — server logs a warning on every request
- Documentation emphasizes that `allowedOrigins` must be configured for production

### Rate Limiting

- **Per API key:** 60 requests/minute for chat, 10 requests/minute for uploads
- **v1 implementation:** `express-rate-limit` with built-in **memory store** (simpler and more correct than custom SQLite store)
- Returns `429 Too Many Requests` with `Retry-After` header
- **Multi-process note:** Memory store is per-process. For multi-process deployments, migrate to Redis store.

### SSE Connection Limits

- Maximum 5 concurrent SSE connections per API key
- Server tracks active connections in memory; rejects new connections with 429 when limit reached

### CORS

- Dynamic CORS based on API key's allowed origins
- Preflight cached for 1 hour
- Only `GET`, `POST`, `PATCH`, `DELETE` methods allowed
- Allowed headers: `X-API-Key`, `Content-Type`, `Authorization`

### Input Sanitization

- All request bodies validated with Zod schemas — reject on failure
- Chat messages: max 2000 characters, stripped of HTML tags
- File uploads: validated MIME type, max 10MB, **filename sanitized via UUID rename**
- SQL injection: not applicable (parameterized queries via better-sqlite3)

### XSS Prevention

- Widget renders message content as `textContent`, never `innerHTML`
- Markdown rendering (if added later) must use a sanitizer
- `helmet` sets security headers on all responses
- Admin panel uses React's built-in XSS protection (JSX auto-escapes)

### Admin Auth

- JWT with 24h expiry, HS256 signing
- **JWT_SECRET minimum entropy:** 32 characters enforced at startup via Zod validation
- Passwords hashed with bcrypt (12 rounds)
- Admin routes behind `requireAuth` middleware
- Initial admin created via CLI seed command

### Secrets Management

- All secrets in `.env` file (not committed)
- Required: `OPENAI_API_KEY`, `JWT_SECRET`, `ADMIN_EMAIL`, `ADMIN_PASSWORD`
- `.env.example` provided with placeholder values

---

## 9. Environment Validation (Startup)

The server validates all required environment variables on startup using Zod. If validation fails, the process exits immediately with a clear error message — no silent misconfiguration.

```js
// src/config.js
import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().default(3000),
  OPENAI_API_KEY: z.string().min(1, 'OPENAI_API_KEY is required'),
  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
  ADMIN_EMAIL: z.string().email('ADMIN_EMAIL must be a valid email'),
  ADMIN_PASSWORD: z.string().min(8, 'ADMIN_PASSWORD must be at least 8 characters'),
  DB_PATH: z.string().default('./data/chatbot.db'),
  LOG_LEVEL: z.enum(['error', 'warn', 'info', 'debug']).default('info'),
});

export const env = envSchema.parse(process.env);
```

**Production vs Development branching:**
- `production`: JSON log format, strict CORS, verbose errors disabled, Helmet strict defaults
- `development`: Colorized logs, permissive CORS, detailed error responses

---

## 10. Deployment

### Dockerfile

```dockerfile
# Stage 1: Build widget + admin panel
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build:widget && npm run build:admin

# Stage 2: Production runtime
FROM node:20-alpine
RUN apk add --no-cache tini
WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

# Copy built assets
COPY --from=builder /app/widget/dist ./widget/dist
COPY --from=builder /app/admin/dist ./admin/dist

# Copy server source
COPY src ./src
COPY .env.example ./.env.example

# Create directories for data and uploads
RUN mkdir -p /app/data /app/uploads

VOLUME ["/app/data"]
EXPOSE 3000

# Use tini for proper signal handling
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "src/index.js"]
```

### docker-compose.yml

```yaml
version: '3.8'

services:
  chatbot:
    build: .
    ports:
      - "${PORT:-3000}:3000"
    volumes:
      - chatbot-data:/app/data
      - chatbot-uploads:/app/uploads
    env_file:
      - .env
    environment:
      - NODE_ENV=production
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "wget", "--no-verbose", "--tries=1", "--spider", "http://localhost:3000/health"]
      interval: 30s
      timeout: 5s
      retries: 3
      start_period: 10s

volumes:
  chatbot-data:
    driver: local
  chatbot-uploads:
    driver: local
```

### Migration Runner

Migrations are tracked in the `_migrations` table:

1. On startup, the migration runner scans `src/db/migrations/` for `.sql` files
2. Compares filenames against `_migrations` table
3. Runs unapplied migrations in order, wrapped in a transaction
4. On failure: transaction rolls back, server exits with error
5. Records applied migrations in `_migrations`

```js
// Pseudocode
const applied = db.prepare('SELECT filename FROM _migrations').all().map(r => r.filename);
const pending = migrationFiles.filter(f => !applied.includes(f));
for (const file of pending) {
  const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
  db.transaction(() => {
    db.exec(sql);
    db.prepare('INSERT INTO _migrations (filename) VALUES (?)').run(file);
  })();
}
```

### Admin Panel Serving

The built admin panel (Vite output) is served as static files from Express:

```js
app.use('/admin', express.static(path.join(__dirname, '../admin/dist')));
// SPA fallback — all /admin/* routes serve index.html
app.get('/admin/*', (req, res) => {
  res.sendFile(path.join(__dirname, '../admin/dist/index.html'));
});
```

Vite config must set `base: '/admin/'` for correct asset paths.

---

## 11. File Structure

```
ai-chatbot-widget/
├── docker-compose.yml
├── Dockerfile
├── .env.example
├── .gitignore
├── package.json
├── README.md
├── API.md                         # API documentation
├── INTEGRATION.md                 # Widget integration guide
│
├── src/
│   ├── index.js                   # Express app entry point
│   ├── config.js                  # Env loading + Zod validation (fail-fast)
│   │
│   ├── db/
│   │   ├── connection.js          # SQLite connection (singleton)
│   │   ├── migrate.js             # Schema migrations runner (tracks _migrations table)
│   │   └── migrations/
│   │       └── 001_initial.sql    # Initial schema
│   │
│   ├── jobs/
│   │   ├── queue.js               # SQLite-backed job queue (poll every 2s)
│   │   └── embedDocument.js       # Document processing worker
│   │
│   ├── middleware/
│   │   ├── apiKeyAuth.js          # X-API-Key validation
│   │   ├── adminAuth.js           # JWT Bearer validation
│   │   ├── rateLimiter.js         # Rate limiting (memory store)
│   │   ├── cors.js                # Dynamic CORS
│   │   ├── errorHandler.js        # Global error handler
│   │   └── validate.js            # Zod schema validation wrapper
│   │
│   ├── routes/
│   │   ├── chat.js                # POST /chat/message, GET /chat/history/:id, DELETE /chat/sessions/:id
│   │   ├── admin.js               # Admin auth routes
│   │   ├── kb.js                  # Knowledge base CRUD + search
│   │   ├── keys.js                # API key management + rotate
│   │   ├── config.js              # Bot config (GET + PATCH)
│   │   └── health.js              # GET /health
│   │
│   ├── services/
│   │   ├── chatService.js         # Orchestrates chat: retrieval + OpenAI call + token windowing
│   │   ├── kbService.js           # Document processing pipeline
│   │   ├── embeddingService.js    # OpenAI embedding calls + cosine similarity + cache
│   │   ├── chunkService.js        # Document-type-aware text splitting
│   │   └── adminService.js        # Auth, key management
│   │
│   ├── utils/
│   │   ├── logger.js              # Winston logger config (JSON in prod, colorized in dev)
│   │   ├── ids.js                 # Prefixed UUID generation
│   │   └── textExtractor.js       # PDF (pdfjs-dist) / MD / TXT text extraction
│   │
│   └── seed.js                    # Create initial admin user + default config
│
├── widget/
│   ├── src/
│   │   ├── chatbot.js             # Main widget entry point
│   │   ├── ui.js                  # DOM rendering (Shadow DOM, open mode, ARIA)
│   │   ├── api.js                 # API client (fetch + SSE + abort handling)
│   │   ├── storage.js             # Namespaced localStorage wrapper
│   │   ├── styles.js              # CSS-in-JS (template literal)
│   │   ├── events.js              # Event emitter
│   │   └── config.js              # data-attribute parser
│   ├── build.js                   # esbuild script
│   └── dist/
│       └── chatbot.js             # Built bundle (gitignored, built in Docker)
│
├── admin/
│   ├── package.json
│   ├── vite.config.js             # base: '/admin/'
│   ├── index.html
│   └── src/
│       ├── main.jsx
│       ├── App.jsx
│       ├── api.js                 # Admin API client
│       ├── pages/
│       │   ├── Login.jsx
│       │   ├── Dashboard.jsx
│       │   ├── KnowledgeBase.jsx  # Includes processing status polling
│       │   ├── ApiKeys.jsx
│       │   └── Settings.jsx
│       └── components/
│           ├── Layout.jsx
│           ├── FileUpload.jsx
│           └── DocumentList.jsx
│
├── tests/
│   ├── unit/
│   │   ├── chunkService.test.js
│   │   ├── embeddingService.test.js
│   │   ├── chatService.test.js
│   │   ├── jobQueue.test.js
│   │   └── ids.test.js
│   ├── integration/
│   │   ├── chat.test.js           # Includes session ownership tests
│   │   ├── kb.test.js             # Includes async processing tests
│   │   ├── keys.test.js
│   │   └── auth.test.js
│   ├── e2e/
│   │   ├── widget.spec.js
│   │   └── admin.spec.js
│   └── fixtures/
│       ├── sample.pdf
│       ├── sample.md
│       └── sample.txt
│
├── uploads/                       # Temp upload dir (gitignored, UUID filenames)
└── data/                          # SQLite DB files (gitignored)
    └── chatbot.db
```

---

## 12. Development Phases

### Phase 1: Foundation (Days 1–2)
- Project scaffolding, package.json, Docker setup
- SQLite connection + migration system with `_migrations` tracking table
- **Zod env validation** in config.js (fail-fast on missing/invalid vars)
- Logger setup (JSON in prod, colorized in dev)
- Seed script (admin user + default config)
- Health check endpoint

### Phase 2: Core API (Days 3–4)
- API key auth middleware with **session ownership checks**
- Admin JWT auth (login endpoint)
- API key CRUD endpoints + **key rotation**
- Bot config endpoints (**GET + PATCH**, not PUT)
- Rate limiting (memory store) + CORS middleware
- Global error handler with consistent error schema
- Zod request validation

### Phase 3: Knowledge Base (Days 5–6)
- File upload endpoint (multer with UUID filenames)
- **Async job queue** (SQLite-backed, in-process worker)
- Text extraction (pdfjs-dist / MD / TXT)
- Document-type-aware chunking with metadata capture
- Embedding service (OpenAI) with progress tracking
- Document CRUD + **status polling** + **search** endpoints
- Embedding cache (in-memory, max 50K chunks)

### Phase 4: Chat Engine (Days 7–8)
- Chat message endpoint with SSE streaming
- RAG retrieval (cosine similarity, **threshold 0.7**, **3K token budget**)
- **Conversation token windowing** (4K history budget, 10-turn cap)
- System prompt construction with KB context + source attribution
- **SSE abort on client disconnect** (`req.on('close')`)
- **SSE error events** for mid-stream failures
- Session management with ownership enforcement
- Conversation history endpoint

### Phase 5: Widget (Days 9–10)
- Shadow DOM widget (`mode: 'open'`)
- Chat UI with **ARIA attributes, focus management, focus trap**
- SSE client with **abort handling and error recovery**
- **Namespaced localStorage** session persistence
- Theming via data-attributes + CSS variables
- esbuild bundling
- Event system (open/close/message hooks)

### Phase 6: Admin Panel (Days 11–12)
- React + Vite + Tailwind setup (base: '/admin/')
- Login page
- Knowledge base management with **processing status polling**
- API key management (create, list, revoke, **rotate**)
- Bot settings page (PATCH-based)
- Build + serve from Express (static files + SPA fallback)

### Phase 7: Testing & Polish (Days 13–14)
- Unit tests (chunk, embed, chat services, **job queue**)
- Integration tests (all API endpoints, **session ownership**, **async processing**)
- E2E tests (widget on test page, admin panel flows)
- Documentation (README, API.md, INTEGRATION.md)
- Docker Compose finalization + healthcheck verification
- Performance tuning (widget bundle size, response times)

---

## 13. Testing Strategy

### Unit Tests (Vitest)

| Test File | What It Tests | Key Cases |
|-----------|---------------|-----------|
| `chunkService.test.js` | Text splitting | Splits at paragraph boundaries; respects overlap; handles empty input; markdown heading-aware splits; PDF page boundary splits |
| `embeddingService.test.js` | Embedding + similarity + cache | Cosine similarity correctness; cache population on first query; cache invalidation on doc add/delete; LRU eviction at max size |
| `chatService.test.js` | Chat orchestration | Builds correct prompt with KB context; token windowing caps history; handles empty KB; streams tokens; respects similarity threshold |
| `jobQueue.test.js` | Async job queue | Job created on upload; worker picks pending jobs; retries on failure; marks failed after max_attempts; progress tracking |
| `ids.test.js` | ID generation | Correct prefix; unique across calls; valid format |

### Integration Tests (Vitest + Supertest)

| Test File | What It Tests | Key Cases |
|-----------|---------------|-----------|
| `auth.test.js` | Admin auth | Login valid → JWT; invalid → 401; expired JWT → 401; JWT_SECRET < 32 chars → startup fails |
| `keys.test.js` | API key CRUD | Create → pk_live_ prefix; list; delete; rotate; deleted key rejects chat |
| `kb.test.js` | Knowledge base | Upload → 202 + queued status; poll status → processing → processed; delete cascades chunks; reject >10MB; reject .exe; processing failure → error status with message |
| `chat.test.js` | Chat endpoint | Valid key → streams SSE; invalid key → 401; session ownership enforced (other key → 404); SSE format correctness (start/tokens/done); mid-stream error → SSE error event |

### E2E Tests (Playwright)

| Test File | What It Tests | Key Cases |
|-----------|---------------|-----------|
| `widget.spec.js` | Embedded widget | Renders chat bubble; click opens window with focus on input; send message → streamed response; close/reopen preserves history; custom theme applied; mobile viewport; ARIA attributes present |
| `admin.spec.js` | Admin panel | Login flow; upload document → status polling → processed; delete document; create + rotate API key; update bot settings via PATCH |

### Test Infrastructure

- **Test DB:** Each test suite uses an in-memory SQLite database (`:memory:`)
- **OpenAI mocks:** Mock at service level — canned embeddings and chat completions. E2E uses a stub SSE server (not live OpenAI).
- **Fixtures:** Sample PDF/MD/TXT files in `tests/fixtures/`
- **CI:** `npm test` runs unit + integration; `npm run test:e2e` runs Playwright
- **Coverage target:** 80%+ line coverage on `src/services/`

---

## 14. Roadmap (Future Iterations)

- **Multi-tenancy SaaS mode:** Add `bots` table, link all resources to `bot_id`, per-tenant billing
- **Hybrid retrieval:** BM25 sparse + dense embedding reranking for better KB search
- **Vector DB migration:** `sqlite-vss` → `pgvector` → Pinecone/Weaviate for >50K chunks
- **Refresh tokens:** For longer admin sessions
- **Audit log:** Track admin actions (key creation, doc deletion, config changes)
- **Per-key SSE connection limits:** Already specified in v1, but extend to configurable per plan
- **Document update/replace:** PATCH endpoint to replace content and re-embed
- **Performance tests:** Validate <2s p95 latency, <500ms widget load

---

## Revision History

| Date | Change | Reason (Review Item) |
|------|--------|---------------------|
| 2026-02-28 | **Decided single-tenant model** — removed ambiguous multi-tenant references, simplified schema | C1: Multi-tenancy undefined |
| 2026-02-28 | **Added async document processing** — SQLite-backed job queue, 202 Accepted response, progress polling endpoint, retry logic | C2: Synchronous pipeline will timeout |
| 2026-02-28 | **Added session ownership enforcement** — all session endpoints verify `api_key_id` match, return 404 on mismatch | C3: Privacy/security hole |
| 2026-02-28 | **Added Dockerfile + docker-compose.yml** — multi-stage build, tini, volumes, healthcheck | C4: Deployment unspecified |
| 2026-02-28 | **Documented single-process constraint for embedding cache** — max 50K chunks, LRU eviction, explicit multi-process migration path | C5: Cache breaks under load balancing |
| 2026-02-28 | **Added conversation token windowing** — 4K history budget, 10-turn cap, token budget allocation table | I1: Unbounded token growth |
| 2026-02-28 | **Changed Shadow DOM to `mode: 'open'`** — added ARIA attributes, focus management, focus trap spec | I2: Closed mode breaks accessibility |
| 2026-02-28 | **Raised similarity threshold to 0.7** (configurable via `bot_config.similarity_threshold`) | I4: 0.3 causes noisy retrieval |
| 2026-02-28 | **Added SSE abort/disconnect handling** — `req.on('close')` aborts OpenAI stream, SSE error events for mid-stream failures | I5: Stream leaks on disconnect |
| 2026-02-28 | **Added localStorage key namespacing** — `chatbot_widget_{apiKeyPrefix}_*` pattern | I6: Collision risk |
| 2026-02-28 | **Replaced `pdf-parse` with `pdfjs-dist`** — actively maintained by Mozilla | I8: Unmaintained dependency |
| 2026-02-28 | **Added Zod env validation on startup** — fail-fast with clear errors, JWT_SECRET ≥ 32 chars enforced | I9: Silent misconfiguration |
| 2026-02-28 | **Added `_migrations` tracking table** — migration runner tracks applied migrations, rolls back on failure | I10: No migration tracking |
| 2026-02-28 | **Added missing API endpoints** — GET config, PATCH config (not PUT), POST kb/search, DELETE sessions, POST keys/:id/rotate, GET documents/:id, GET documents/:id/status, pagination on list endpoints | I3: Missing endpoints |
| 2026-02-28 | **Added health check endpoint** — `GET /health` for Docker healthcheck | Review §1.6 |
| 2026-02-28 | **Added error response schema contract** — consistent error codes across all endpoints | Review §5.6 |
| 2026-02-28 | **Added X-Session-Id response header** on chat endpoint | Review §5.2 |
| 2026-02-28 | **Added network error handling spec** for widget | Review §7.3 |
| 2026-02-28 | **Added CSP `style-src` guidance** | Review §7.5 |
| 2026-02-28 | **Added chunk metadata** (page_number, section_title) and source attribution in prompts | Review §6.2 |
| 2026-02-28 | **Added 3K token budget for KB context** — greedy fill by similarity score | Review §6.4 |
| 2026-02-28 | **UUID filename storage for uploads** — prevents path traversal | Review §2.5 |
| 2026-02-28 | **Rate limiting uses memory store** (not custom SQLite store) for v1 | Review §2.4 |
| 2026-02-28 | **Added SSE connection limits** — max 5 concurrent per API key | Review §3.3 |
| 2026-02-28 | **Added production vs development config branching** | Review §9.4 |
