# Design Review — AI Chatbot Widget Architecture

**Reviewer:** Jarvis (Design Reviewer Sub-Agent)
**Date:** 2026-02-28
**Phase:** 1b
**Verdict:** Solid foundation with several gaps that will bite you in production. See Critical items before building.

---

## 1. Architecture Gaps

### 1.1 No multi-tenancy model defined (Critical for a Fiverr product)
The schema has `api_keys` and a single `bot_config` table with `id='default'`. There's no concept of multiple bots/tenants per deployment. If this is sold as a SaaS widget service, every customer shares one config, one knowledge base, and one prompt. The entire value prop breaks.

**Fix:** Add a `bots` table. Link `api_keys`, `bot_config`, `documents`, `chunks`, and `sessions` to a `bot_id`. Decide now: is this a single-tenant self-hosted tool (one customer, one deploy) or multi-tenant? The architecture must answer this — it currently doesn't.

### 1.2 Document processing is synchronous and blocking (Critical)
The pipeline (upload → extract → chunk → embed → store) happens inline in the HTTP request handler. Embedding 100 chunks via OpenAI takes 3–10 seconds. For a large PDF this will time out the HTTP request and leave the document in `status: 'processing'` forever with no recovery path.

**Fix:** The document record should be created immediately (202 Accepted), and processing deferred to a worker. At minimum, use `setImmediate`/`queueMicrotask` to push the work off the request. A proper fix is a job queue (BullMQ or even a simple SQLite-backed queue). Add a `GET /api/v1/admin/kb/documents/:id/status` polling endpoint or SSE progress stream. Currently there's no way for the admin panel to know when processing is done.

### 1.3 No webhook/callback for document processing completion
Related to above — the admin panel has no way to react to processing completion other than polling `GET /documents`. This isn't specified in the API design.

### 1.4 Session ownership not enforced
`GET /api/v1/chat/history/:sessionId` requires only `X-API-Key`. There's no check that the session was created by *that* API key. Any key holder can enumerate session IDs and read other sessions' history.

**Fix:** In the query, join `sessions` to `api_keys` and verify `api_key_id` matches the authenticated key.

### 1.5 No conversation context window management
The architecture says "conversation history" is passed to OpenAI, but there's no strategy for truncating it. GPT-4o-mini has a 128K context window, but you're paying per token. With `max_tokens: 500` for output and a growing history, a long session will eventually exceed the model's window or run up a huge bill.

**Fix:** Specify a windowing strategy. The standard approach: keep the system prompt + KB context fixed, then include the last N message pairs (e.g., 10) or up to a token budget (e.g., 4K tokens for history).

### 1.6 No health check endpoint
No `GET /health` or `GET /api/v1/status` endpoint specified. Docker Compose `healthcheck` needs this.

---

## 2. Security Concerns

### 2.1 API key in `data-*` attribute is publicly visible (Important)
`data-api-key="pk_live_xxx"` is in the HTML source of the host website. Anyone can view-source, grab the key, and make unlimited API calls. Origin validation partially mitigates this, but only if the integrator configures `allowedOrigins`. The default is allow-all.

**Reality check:** This is the standard pattern for embeddable widgets (Intercom, Crisp, etc.). The key is effectively public. But the architecture must be explicit that:
- `allowedOrigins` is *not optional* in production
- The key only allows chat, not admin operations
- Rate limiting is the primary abuse protection

**Fix:** Change default `allowedOrigins` from `[]` (allow all) to requiring explicit configuration. Log a server-side warning when empty. Document the security model clearly.

### 2.2 JWT signing algorithm HS256 with shared secret
HS256 is fine for this use case, but the architecture doesn't specify minimum `JWT_SECRET` entropy requirements. A weak secret (e.g., `"secret"`) makes the admin panel trivially compromisable via offline brute force.

**Fix:** In config validation, enforce `JWT_SECRET.length >= 32`. Better: generate it with `crypto.randomBytes(32).toString('hex')` in the seed script and document it.

### 2.3 No refresh token mechanism
24h JWT expiry with no refresh. Admin session just dies mid-work. Either: (a) add refresh tokens, or (b) extend to 7 days and accept the risk (fine for a portfolio tool). Currently unspecified.

### 2.4 Rate limiting stored in SQLite with custom store
The architecture mentions a "custom SQLite store" for `express-rate-limit`. Rolling window rate limiting in SQLite is tricky to get right — the `rate_limits` table uses `window_start` as a fixed bucket, which means requests can double (end of window + start of next) or get miscounted under concurrent load. `better-sqlite3` is synchronous but the rate limit check is still susceptible to race conditions under bursty load.

**Fix:** Use `express-rate-limit`'s built-in memory store for v1 (simpler, correct). Add a note that Redis is needed for multi-process deployments.

### 2.5 File upload temp directory not isolated
Multer saves to `uploads/`. The architecture doesn't specify:
- Whether `uploads/` is inside the container or a mounted volume
- Whether files are deleted on processing error (not just success)
- Whether filenames are sanitized before saving to disk (multer uses the original filename by default — path traversal risk)

**Fix:**
```js
// Use multer memStorage or save to a UUID-named temp file:
const storage = multer.diskStorage({
  filename: (req, file, cb) => cb(null, `${uuidv4()}${path.extname(file.originalname)}`)
});
// Always delete in finally block, not just on success
```

### 2.6 No audit log for admin actions
Key creation, document deletion, config changes — none of these are logged in the schema. For a multi-admin scenario or security audit, this is a problem.

### 2.7 `pdf-parse` known vulnerability
`pdf-parse@1.1.1` has a known issue where processing maliciously crafted PDFs can cause excessive memory consumption or hangs. Consider `pdf2json` or `pdfjs-dist` (Mozilla's maintained library) as alternatives.

---

## 3. Scalability Issues

### 3.1 In-memory embedding cache is the single biggest scalability problem (Critical)
> "On server start, load all embeddings into an in-memory Map keyed by chunk ID"

A 1536-dim float32 embedding = 6KB. 10,000 chunks = 60MB. 100,000 chunks = 600MB. The architecture notes "For deployments with >100K chunks, switch to batch loading with pagination" but doesn't define this threshold or provide the fallback design.

More critically: **this approach breaks with multiple server processes.** If you run 2 Node instances behind a load balancer, each has its own cache, and invalidation (`document add/delete`) only hits one process.

**Fix for v1:** Keep in-memory cache but add a maximum size limit (e.g., 50K chunks, ~300MB) with LRU eviction. For multi-process, either use a single process + cluster or accept eventual consistency and reload on miss.

**Fix for v2:** Add `sqlite-vss` (SQLite vector similarity search extension) or migrate to `pgvector` — eliminate the in-memory problem entirely.

### 3.2 Synchronous SQLite blocks the event loop
`better-sqlite3` is synchronous by design. Every database call blocks the Node.js event loop. For a single-process server handling concurrent SSE streams (each potentially taking 2-5 seconds), this is a real bottleneck.

**Fix:** This is an acceptable trade-off for v1, but it must be documented. For production scale, migrate to `libsql` (async SQLite) or PostgreSQL.

### 3.3 SSE connections not limited per API key
An attacker (or buggy client) can open hundreds of SSE connections simultaneously, each holding the event loop with an active OpenAI stream. No per-key connection limit is specified.

**Fix:** Track active SSE connections per API key. Reject new connections above a limit (e.g., 5 concurrent per key).

### 3.4 No streaming backpressure
The widget SSE client is described but there's no handling of slow consumers. If the widget goes offline mid-stream, the server may continue streaming to a dead connection. SSE doesn't have built-in backpressure.

**Fix:** Listen to `req.on('close')` and abort the OpenAI stream on client disconnect:
```js
req.on('close', () => {
  openaiStream.controller.abort();
});
```

---

## 4. Technology Choices

### 4.1 `pdf-parse` is unmaintained
Last published 2018. For a production tool, use `pdfjs-dist` (Mozilla, actively maintained) or `pdf2json`. The difference matters for complex PDFs — tables, multi-column layouts, images with embedded text.

### 4.2 No vector DB for production is risky but defensible
SQLite + in-memory cosine similarity is a clever lightweight approach. It works for <50K chunks. The architecture should document this limit and the migration path (sqlite-vss → pgvector → Pinecone/Weaviate) more explicitly in the README.

### 4.3 `text-embedding-3-small` vs alternatives
Good choice for cost. But for a knowledge base where retrieval quality matters (the whole value prop), consider a hybrid approach: BM25 sparse retrieval + dense embedding reranking. Pure cosine similarity misses keyword-exact matches that users expect. Not for v1, but should be in the roadmap.

### 4.4 Express v4 vs Fastify/Hono
Fine choice. Express is stable and familiar. Hono would be lighter and type-safe with better OpenAPI support, but not worth switching for this scope.

### 4.5 React 19 + Tailwind 4 are both very new
React 19 was released late 2024; Tailwind 4 in early 2025. Ecosystem tooling (especially Tailwind 4's new CSS-first config) may have rough edges. For a 2-week build, pinning to React 18 + Tailwind 3 reduces friction. Not critical but worth noting.

---

## 5. API Design Issues

### 5.1 Chat endpoint returns SSE but fails with JSON error — inconsistent content types
If `POST /api/v1/chat/message` returns SSE on success but JSON on error (auth failure, validation failure), the client must handle two content types on the same endpoint. The architecture doesn't address this.

**Fix:** For errors detected before the stream starts, return JSON (correct). For errors that occur mid-stream, send an SSE error event:
```
data: {"type":"error","code":"openai_error","message":"Service unavailable"}
```
Document both cases explicitly.

### 5.2 Session ID is optional but returned in the SSE start event — awkward flow
The client sends a message without a `sessionId`, gets one back in the `{"type":"start"}` SSE event. This means the client must parse the SSE stream to get the session ID before it can make the history request. The session ID should also be available in a response header:
```
X-Session-Id: ses_abc123
```

### 5.3 Missing endpoints that builders will need
- `PATCH /api/v1/admin/kb/documents/:id` — update metadata/category
- `GET /api/v1/admin/kb/documents/:id` — get single document with chunk count
- `POST /api/v1/admin/keys/:id/rotate` — rotate an API key without deleting it
- `GET /api/v1/admin/config` — GET counterpart to PUT (must be able to read current config)
- `DELETE /api/v1/chat/sessions/:sessionId` — let users clear their own history
- `POST /api/v1/admin/kb/search` — test retrieval quality without sending a chat message

### 5.4 `PUT /api/v1/admin/config` should be PATCH
Full replacement of config with PUT is fragile — a client that only wants to change `temperature` must send all other fields or risk overwriting them with defaults. Use PATCH with partial updates.

### 5.5 No pagination on list endpoints
`GET /api/v1/admin/kb/documents` returns all documents. No `limit`/`offset` or cursor. Will become slow with many documents.

### 5.6 Error response schema inconsistent
The architecture shows error responses as `{ "error": "code", "message": "..." }` but doesn't define this as a formal contract. Add a consistent error schema definition and list all possible error codes. Builders will need this.

---

## 6. Knowledge Base Pipeline

### 6.1 Fixed chunk size (500 tokens) ignores document structure
The chunking strategy splits at character boundaries, not semantic boundaries. A 500-token chunk might split a table in half, orphan a list item from its heading, or break a code block. Result: retrieved chunks lack the context needed to answer correctly.

**Fix:** Add document-type-aware chunking:
- **Markdown:** Split at `##`/`###` heading boundaries
- **PDF:** Preserve page boundaries as chunk separators
- **General:** Use sentence-level splits within the overlap window

### 6.2 No chunk metadata beyond `chunk_index`
Retrieved chunks have `content` and `chunk_index` but no `page_number`, `section_title`, or `source_url`. The model can't cite sources accurately ("see page 3 of the FAQ"). This reduces answer quality.

**Fix:** Add `metadata JSONB` to chunks at storage time, capturing page number (from pdf-parse), section heading (from nearest preceding `##` in markdown), etc. Pass this to the LLM in the context:
```
[Source: FAQ.pdf, Page 3, Section: "Password Reset"]
How do I reset my password? ...
```

### 6.3 Similarity threshold of 0.3 is too low
Cosine similarity of 0.3 between `text-embedding-3-small` vectors represents a very loose match. With a large knowledge base, you'll retrieve irrelevant chunks that add noise to the context. The architecture doesn't explain how this threshold was chosen.

**Fix:** Start with 0.7 for strict retrieval. Make it configurable in `bot_config`. Log similarity scores during development to calibrate.

### 6.4 Top-K=5 chunks injected without token budget
5 chunks at 500 tokens each = 2500 tokens of context, plus system prompt, plus history, plus the user's message. This can easily push the total to 5-6K tokens per request. At scale, this is expensive and may cause issues if the history is also long.

**Fix:** Define a total context token budget (e.g., 3K tokens for KB context). Fill greedily by similarity score until budget is exhausted.

### 6.5 No reprocessing / update flow for documents
A user uploads v1 of their FAQ. Later they update it. The only option is delete + re-upload. There's no `PATCH` to replace a document's content and trigger reprocessing.

### 6.6 `pdf-parse` loses formatting information
Tables, columns, and lists in PDFs become undifferentiated text. For many real-world knowledge bases (product manuals, FAQs), this is a significant quality degradation. Not a blocker for v1, but should be in the known limitations.

---

## 7. Widget Design

### 7.1 `mode: 'closed'` Shadow DOM breaks the public API
```js
const shadow = element.attachShadow({ mode: 'closed' });
```
Closed shadow roots prevent external JavaScript from accessing `element.shadowRoot`. This means `window.ChatbotWidget` must be set up *before* the shadow root is closed, and any third-party accessibility tools, browser extensions, or host page scripts that need to interact with the widget (e.g., pre-fill a message) are blocked.

**Fix:** Use `mode: 'open'` unless there's a specific anti-tampering requirement. Style isolation works with open mode too — external CSS still can't penetrate a shadow root. Closed mode is for DRM, not style isolation.

### 7.2 `<40KB gzipped` target may be tight
The widget renders a full chat UI with SSE streaming, event emitter, local storage management, and CSS-in-JS. esbuild will minify well, but 40KB gzipped is aggressive. Budget breakdown isn't provided.

**Sanity check:** A minimal chat widget with no dependencies typically runs 15-25KB gzipped. This target is achievable but leaves no room for:
- Markdown rendering (even a simple one adds 5-10KB)
- Animation polish
- Accessibility features (ARIA live regions, focus management)
- Error retry logic

Document the 40KB constraint so the builder doesn't discover it late.

### 7.3 No offline / network error handling specified
The widget architecture doesn't describe what happens when:
- The API server is unreachable
- An SSE connection drops mid-response
- OpenAI times out

The widget should: show a user-friendly error message, offer a retry button, and not lose the user's typed message.

### 7.4 No focus management / accessibility (WCAG)
Shadow DOM and focus management are tricky. When the chat window opens, focus should move to the input field. When closed, focus should return to the trigger element. Tab order must be contained within the open widget (focus trap). None of this is specified.

ARIA attributes needed:
- `role="dialog"` on the chat window
- `aria-live="polite"` on the message list for screen readers
- `aria-label` on the close button

Without this, the widget fails basic accessibility audits.

### 7.5 CSP `script-src` for inline styles in Shadow DOM
Styles injected via JavaScript into Shadow DOM (`styles.js`) may still be blocked by strict `style-src 'none'` CSP policies. The architecture correctly identifies `connect-src` and `script-src` requirements but misses `style-src`. Some hosts use `style-src 'self'` without `'unsafe-inline'`, which breaks injected `<style>` elements even inside Shadow DOM.

**Fix:** Use a `<link rel="stylesheet">` to an external CSS file instead of injecting `<style>` tags, or document that `style-src 'unsafe-inline'` is required.

### 7.6 `localStorage` key collision
The widget stores session data in `localStorage` without a namespaced key prefix. If a host page already uses `sessionId` or similar keys, there will be collisions.

**Fix:** Namespace all keys: `chatbot_widget_${apiKey}_session`, etc.

---

## 8. Testing Gaps

### 8.1 No test for the embedding cache invalidation path
The in-memory cache is a core part of the architecture. Tests must cover:
- Cache is populated on first query
- Cache is invalidated when a document is added
- Cache is invalidated when a document is deleted
- Cache correctly reflects the new state after invalidation

### 8.2 No adversarial input tests
- Chat message that is exactly 2001 characters (boundary condition)
- Chat message containing SQL injection patterns (verify parameterized queries hold)
- Upload a file with `.pdf` extension but MIME type `application/javascript` (MIME spoofing)
- Upload a valid PDF that is actually a zip bomb or causes `pdf-parse` to hang
- `sessionId` belonging to a different API key (session hijacking attempt)
- Malformed SSE client that disconnects immediately

### 8.3 No test for SSE streaming correctness
The integration tests check that the endpoint returns a response, but do they verify the SSE format? Specifically:
- Each `data:` line is valid JSON
- `type: "start"` comes first, `type: "done"` comes last
- No events after `type: "done"`
- Stream closes cleanly after done

### 8.4 No load/performance tests
The success criteria include "responses in <2s" and "widget loads in <500ms" but there are no performance tests to verify these. At minimum:
- Measure p95 response latency with a realistic knowledge base (100 chunks)
- Test that the in-memory cache doesn't spike memory on startup with 10K chunks

### 8.5 No test for document processing failure recovery
What happens if OpenAI embedding fails halfway through processing a 500-chunk document? The document stays `status: 'processing'` forever. Test:
- Partial embedding failure → document marked `status: 'error'` with error message
- Retry mechanism (if any)

### 8.6 Widget E2E tests require a live API
`widget.spec.js` tests streaming responses — but with a mocked OpenAI? Or against a real server? The architecture says "requires `npm run dev` or Docker" but doesn't specify whether OpenAI is mocked at the E2E level. If not mocked, E2E tests are flaky and expensive.

**Fix:** Use a stub server (e.g., MSW or a simple Express mock) that returns pre-canned SSE responses for E2E widget tests.

---

## 9. Deployment Concerns

### 9.1 Dockerfile not specified
The architecture mentions a `Dockerfile` and `docker-compose.yml` but never describes their contents. Critical questions for the builder:
- Multi-stage build? (Builder stage for `npm install` + esbuild, runtime stage for lean image)
- Base image? (`node:20-alpine` is standard)
- Does the admin panel build happen in Docker or separately?
- How is `widget/dist/chatbot.js` served — from the `public/` directory of Express?
- Where is the SQLite `data/` directory mounted? (Must be a volume or data is lost on restart)

**Fix:** Add a `Dockerfile` spec:
```dockerfile
# Stage 1: Build widget + admin
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build:widget && npm run build:admin

# Stage 2: Runtime
FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --production
COPY --from=builder /app/dist ./dist
COPY src ./src
VOLUME ["/app/data", "/app/uploads"]
EXPOSE 3000
CMD ["node", "src/index.js"]
```

### 9.2 No migration strategy for schema changes
The architecture has `src/db/migrations/001_initial.sql` and a "migrations runner." But:
- How does the runner track which migrations have been applied? (No `schema_migrations` table defined)
- What happens if a migration fails mid-run on a production DB?
- Is there a rollback mechanism?

For SQLite, even simple `ALTER TABLE ADD COLUMN` is safe. But the migration runner needs to be specified — at minimum, it should track applied migrations in a `_migrations` table.

### 9.3 Environment variable validation is underspecified
The architecture says "config loading" is in `config.js` but doesn't specify what happens if required env vars are missing at startup. The server should fail fast with a clear error, not start and crash on first request.

**Fix:** Use Zod to validate env at startup:
```js
const envSchema = z.object({
  OPENAI_API_KEY: z.string().min(1),
  JWT_SECRET: z.string().min(32),
  NODE_ENV: z.enum(['development', 'production', 'test']),
  PORT: z.coerce.number().default(3000),
});
const env = envSchema.parse(process.env); // throws on startup if invalid
```

### 9.4 No production vs development configuration separation
The architecture uses a single `.env` file. In production:
- `NODE_ENV=production` should disable verbose error responses
- Helmet defaults are different
- CORS should be stricter
- Log format should be JSON (not colorized)

`config.js` should explicitly branch on `NODE_ENV`.

### 9.5 Admin panel serving from Express needs clarification
Phase 6 says "Build + serve from Express (static files)." This means the React admin panel is served as static assets from the Express server. The Vite `base` path must be configured correctly, and Express needs to handle client-side routing (`/*` → `index.html`). This is commonly gotten wrong.

### 9.6 No backup/restore strategy for SQLite
The SQLite file at `data/chatbot.db` is the entire data store. No backup strategy is mentioned. For a production deploy, at minimum document how to back up and restore, and consider WAL checkpointing behavior.

---

## 10. Recommendations

### 🔴 Critical (Fix Before Building)

| # | Issue | Why Critical |
|---|-------|-------------|
| C1 | Decide single-tenant vs multi-tenant now | Changes the entire schema and API surface |
| C2 | Make document processing async (job queue or deferred) | Synchronous pipeline will timeout on any real document |
| C3 | Add session ownership enforcement on history endpoint | Privacy/security hole |
| C4 | Specify Dockerfile contents | Builder cannot deploy without this |
| C5 | Fix in-memory cache multi-process problem | Cache breaks silently under load balancing |

### 🟡 Important (Fix Before Ship)

| # | Issue | Specific Fix |
|---|-------|-------------|
| I1 | Add conversation token window management | Cap history at N turns or T tokens |
| I2 | Change `mode: 'closed'` to `mode: 'open'` on Shadow DOM | Closed breaks accessibility and the public widget API |
| I3 | Add missing API endpoints (GET config, PATCH config, POST kb/search) | Admins need them; builders will add them anyway |
| I4 | Raise similarity threshold from 0.3 to 0.7 | 0.3 causes noisy RAG retrieval |
| I5 | Add SSE error events and `req.on('close')` abort | Stream leaks on disconnect |
| I6 | Namespace localStorage keys | Collision risk on any real website |
| I7 | Add ARIA attributes and focus management spec to widget | Accessibility is a legal requirement in many jurisdictions |
| I8 | Replace `pdf-parse` with `pdfjs-dist` | Unmaintained; security risk with user-uploaded files |
| I9 | Add environment validation on startup (Zod) | Silent misconfiguration in production |
| I10 | Define migration tracking table | Can't run migrations safely without it |

### 🟢 Nice-to-Have (Future Iterations)

| # | Issue | Notes |
|---|-------|-------|
| N1 | Hybrid BM25 + dense retrieval | Better KB search quality |
| N2 | Chunk metadata (page number, section) | Better answer attribution |
| N3 | Configurable similarity threshold per bot | Power-user feature |
| N4 | Document update/replace endpoint | Quality of life for admins |
| N5 | Per-key SSE connection limits | DoS hardening |
| N6 | Rate limit using memory store (not SQLite) | Simpler, more correct |
| N7 | Refresh token for admin JWT | Better UX for long sessions |
| N8 | Audit log for admin actions | Compliance/debugging |
| N9 | Performance/load tests | Validate <2s p95 claim |
| N10 | Structured chunk metadata in LLM context | Enables source citations |

---

## Summary

The architecture is well-thought-out for a portfolio project — good tech choices, solid security foundations, sensible phasing. The main risk areas are:

1. **The async processing gap** is a day-1 build blocker if not addressed — HTTP timeouts on large documents will be immediately visible.
2. **The multi-tenancy question** needs an answer in writing before the schema is implemented. Adding it later is a painful migration.
3. **The in-memory cache design** is clever but fragile — it needs explicit documented limits and a migration path.
4. **Widget accessibility** is often scoped out but in 2026 it's increasingly a legal requirement, not a nice-to-have.

The phase plan is realistic. Phase 3 (Knowledge Base) is the riskiest — the async processing issue will surface there. Recommend adding a simple job queue (even a `processing_jobs` SQLite table with a polling loop) to Phase 3 before embedding code is written.
