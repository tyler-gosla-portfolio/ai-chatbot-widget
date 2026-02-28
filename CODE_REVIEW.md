# Code Review — AI Chatbot Widget

**Reviewer:** Jarvis (Code Review Agent)  
**Date:** 2026-02-28  
**Scope:** Full codebase review against ARCHITECTURE_FINAL.md  

---

## Summary

The implementation is solid and closely follows the architecture spec. The codebase is well-organized, readable, and demonstrates good engineering practices (constant-time API key comparison, Shadow DOM isolation, proper SSE handling, job queue with retry logic). Below are the issues found, ordered by severity.

**Totals:** 🔴 3 Critical | 🟡 9 Important | 🟢 6 Nice-to-have

---

## 🔴 Critical Issues

### 1. `generateApiKey` uses browser API in Node.js context
**File:** `src/utils/ids.js` (lines 10-14)  
**What's wrong:** `crypto.getRandomValues()` is a Web Crypto API. In Node.js, `crypto` must be imported, but the file doesn't import it. Additionally, `crypto.getRandomValues` may not exist in all Node.js versions without `globalThis.crypto`.

**Fix:**
```js
import crypto from 'crypto';

export const generateApiKey = () => {
  const hex = crypto.randomBytes(24).toString('hex');
  return `pk_live_${hex}`;
};
```

### 2. CORS bypasses API key validation for widget routes
**File:** `src/middleware/cors.js` (lines 22-45)  
**What's wrong:** The dynamic CORS middleware queries ALL active API keys' allowed origins and merges them. If any key has `allowedOrigins: ["*"]` or `[]`, then ALL origins are allowed for ALL keys. CORS should validate origins against the *specific* API key from the request, not the union of all keys.

**Fix:** Move origin validation to after `apiKeyAuth` middleware, or look up only the specific API key's origins:
```js
const row = db.prepare('SELECT allowed_origins FROM api_keys WHERE api_key = ? AND is_active = 1').get(apiKey);
if (row) {
  const origins = JSON.parse(row.allowed_origins || '[]');
  const originAllowed = origins.length === 0 || origins.includes(origin) || origins.includes('*');
  // ...
}
```

### 3. Admin login has no brute-force protection
**File:** `src/routes/admin.js`  
**What's wrong:** The `/admin/login` endpoint has no rate limiting. An attacker can brute-force admin credentials indefinitely. The upload rate limiter exists but isn't applied to login.

**Fix:** Add a strict rate limiter to the login route:
```js
import { rateLimit } from 'express-rate-limit';

const loginRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // 10 attempts per window
  keyGenerator: (req) => req.ip,
});

router.post('/login', loginRateLimit, validate(loginSchema), async (req, res, next) => {
```

---

## 🟡 Important Issues

### 4. LRU cache `indexOf` is O(n) — performance degrades at scale
**File:** `src/services/embeddingService.js` (lines 17-27)  
**What's wrong:** `cacheOrder` is an array; `indexOf` + `splice` is O(n). With MAX_CACHE_SIZE=50,000, every cache hit does a linear scan. This will cause noticeable latency at scale.

**Fix:** Use a proper doubly-linked list or a `Map` (which preserves insertion order and supports O(1) delete/re-insert):
```js
// Map already preserves insertion order — just delete and re-set
function cacheGet(id) {
  if (!cache.has(id)) return undefined;
  const val = cache.get(id);
  cache.delete(id);
  cache.set(id, val);  // moves to end
  return val;
}

function cacheSet(id, embedding) {
  if (cache.has(id)) cache.delete(id);
  if (cache.size >= MAX_CACHE_SIZE) {
    const oldest = cache.keys().next().value;
    cache.delete(oldest);
  }
  cache.set(id, embedding);
}
```
This eliminates the `cacheOrder` array entirely.

### 5. `findSimilarChunks` loads ALL chunks from DB on every query
**File:** `src/services/embeddingService.js` (line 68)  
**What's wrong:** `SELECT id, document_id, content, metadata, token_count FROM chunks WHERE embedding IS NOT NULL` fetches all chunk text+metadata on every search query, even though the cache already holds embeddings. The `content` column could be large. Only chunks passing the threshold need their content.

**Fix:** Two-phase approach — first compute similarities from cache, then fetch content only for top-K:
```js
// Phase 1: score from cache only
const allChunkIds = db.prepare('SELECT id FROM chunks WHERE embedding IS NOT NULL').all();
const scored = [];
for (const { id } of allChunkIds) {
  const embedding = cacheGet(id);
  if (!embedding) continue;
  const similarity = cosineSimilarity(queryEmbedding, embedding);
  if (similarity >= threshold) scored.push({ id, similarity });
}
scored.sort((a, b) => b.similarity - a.similarity);

// Phase 2: fetch content for top candidates only
const topIds = scored.slice(0, topK * 3).map(s => s.id);
const placeholders = topIds.map(() => '?').join(',');
const chunks = db.prepare(`SELECT * FROM chunks WHERE id IN (${placeholders})`).all(...topIds);
```

### 6. Widget `_trapFocus` checks `document.activeElement` instead of shadow root
**File:** `widget/src/ui.js` (lines 97-105)  
**What's wrong:** Inside Shadow DOM, `document.activeElement` returns the shadow host, not the focused element within the shadow. Should use `this.shadowRoot.activeElement` instead.

**Fix:**
```js
_trapFocus(e) {
  const focusable = Array.from(this.window.querySelectorAll('button, textarea, [tabindex]:not([tabindex="-1"])'))
    .filter(el => !el.disabled);
  if (focusable.length === 0) return;
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  const active = this.shadowRoot.activeElement;
  if (e.shiftKey && active === first) {
    e.preventDefault();
    last.focus();
  } else if (!e.shiftKey && active === last) {
    e.preventDefault();
    first.focus();
  }
}
```

### 7. No message history size limit in localStorage
**File:** `widget/src/chatbot.js` (lines 68-73)  
**What's wrong:** Messages are appended to the `messages` array in localStorage indefinitely. Long conversations will grow until localStorage quota is exceeded (typically 5MB), causing silent failures.

**Fix:** Add a max history size:
```js
const MAX_CACHED_MESSAGES = 100;
history.push(userMsg);
if (history.length > MAX_CACHED_MESSAGES) {
  history.splice(0, history.length - MAX_CACHED_MESSAGES);
}
```

### 8. SSE stream interrupted state not shown to user
**File:** `widget/src/chatbot.js` + `widget/src/api.js`  
**What's wrong:** The architecture spec says "Show partial response with '(response interrupted)' suffix and retry button" when SSE drops mid-response. The implementation doesn't handle this — if the stream ends without a `done` event, the partial response just sits there with no indication.

**Fix:** In `api.js`, after the read loop exits without a `done` event, call `onError` with appropriate messaging, or add an `onInterrupted` callback.

### 9. `updateBotConfig` is vulnerable to SQL injection via dynamic column names
**File:** `src/services/adminService.js` (lines 57-62)  
**What's wrong:** Column names are interpolated directly into SQL: `` `${k} = ?` ``. While the `allowed` array whitelist mitigates this, the pattern is fragile — if the whitelist is ever extended with user input, it becomes exploitable.

**Fix:** Use a stricter validation pattern:
```js
const ALLOWED_COLUMNS = new Set(['bot_name', 'system_prompt', 'welcome_message', 'model', 'temperature', 'max_tokens', 'similarity_threshold']);
const updates = Object.entries(fields).filter(([k]) => ALLOWED_COLUMNS.has(k));
// Existing code is safe as long as ALLOWED_COLUMNS stays hardcoded,
// but add an explicit assertion:
for (const [k] of updates) {
  if (!/^[a-z_]+$/.test(k)) throw new Error(`Invalid column: ${k}`);
}
```

### 10. Admin panel stores JWT in localStorage (XSS-vulnerable)
**File:** `admin/src/api.js`, `admin/src/pages/Login.jsx`  
**What's wrong:** JWT stored in `localStorage` is accessible to any JS running on the page. If there's an XSS vulnerability in the admin panel, the token is trivially stolen. HttpOnly cookies are safer.

**Fix (pragmatic):** For v1 self-hosted with single admin, this is acceptable but should be documented as a known limitation. For hardening, switch to HttpOnly cookie-based auth:
```js
// Server-side: set cookie on login
res.cookie('admin_token', token, { httpOnly: true, secure: true, sameSite: 'strict', maxAge: 86400000 });
```

### 11. Widget doesn't handle SSE error mid-stream before `onStart` fires
**File:** `widget/src/chatbot.js` (lines 57-82)  
**What's wrong:** If the fetch succeeds (200) but the first SSE event is an error, `onStart` is never called, so `removeTyping` never fires inside `onStart`. The typing indicator stays visible. The `onError` callback does call `removeTyping`, but this path is only hit for non-200 responses or network errors, not SSE `error` events.

**Fix:** Ensure the `error` SSE event type in `api.js` also triggers typing removal — either always call `removeTyping()` before `onError`, or handle it in the main chatbot flow:
```js
onError: (errMsg) => {
  this._ui.removeTyping();  // Already there — this is actually fine
  // But also finalize stream bubble if one was started
  this._ui.setInputDisabled(false);
  ...
}
```
Actually on re-reading, this is handled. Downgrading — but the SSE `error` event from server during streaming (after `onStart`) doesn't disable input or clean up the stream bubble. Add cleanup in the `onToken`/`onDone`/`onError` flow for the mid-stream case.

### 12. No graceful shutdown of job queue worker
**File:** `src/index.js`  
**What's wrong:** The SIGTERM handler closes the HTTP server but doesn't stop the job queue worker. A job could be mid-processing when the process exits.

**Fix:**
```js
import { stopWorker } from './jobs/queue.js';

process.on('SIGTERM', () => {
  logger.info('SIGTERM received, shutting down gracefully');
  stopWorker();
  server.close(() => {
    closeDb();
    logger.info('Server closed');
    process.exit(0);
  });
});
```

---

## 🟢 Nice-to-have

### 13. `api_key` column should be hashed, not stored plaintext
**File:** `src/db/migrations/001_initial.sql`  
**What's wrong:** API keys are stored in plaintext. If the database file is ever leaked, all keys are compromised. Best practice is to store a hash (SHA-256) and compare against that.

**Current approach works** because constant-time comparison is used, but hashing would add defense-in-depth.

### 14. Admin panel doesn't handle 401 during upload
**File:** `admin/src/api.js` (line 44-49)  
**What's wrong:** `uploadDocument` uses raw `fetch` instead of the `request` helper, so the 401 → redirect logic doesn't apply. An expired token during upload silently fails.

**Fix:** Use the same pattern or check response status:
```js
uploadDocument: async (formData) => {
  const res = await fetch(`${BASE_URL}/admin/kb/documents`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${getToken()}` },
    body: formData,
  });
  if (res.status === 401) { localStorage.removeItem('admin_token'); window.location.href = '/admin/'; return; }
  if (!res.ok) { const err = await res.json().catch(() => ({})); throw new Error(err.message || 'Upload failed'); }
  return res.json();
},
```

### 15. Tests don't actually test job processing end-to-end
**File:** `tests/unit/jobQueue.test.js`  
**What's wrong:** The "processes jobs via registered handler" test registers a handler and enqueues jobs, but never actually invokes `processNextJob` — it just verifies jobs exist in the DB. The test doesn't validate that the handler is called.

### 16. Missing integration and E2E tests
**Files:** `tests/` directory  
**What's wrong:** Only 3 unit test files exist. No integration tests (supertest) for API routes, no E2E tests (playwright). The architecture spec calls for both.

### 17. Dockerfile uses `node:20-alpine` but `package.json` has no engines field
**File:** `package.json`, `Dockerfile`  
**What's wrong:** No `"engines": { "node": ">=20" }` in package.json to enforce the Node version requirement.

### 18. Widget `config.js` may fail when loaded as deferred/async
**File:** `widget/src/config.js`  
**What's wrong:** `document.currentScript` is `null` when the script is `defer`red or `async` (it's only available during synchronous execution). The fallback `document.querySelector('script[data-api-key]')` handles this, but if multiple chatbot scripts are on the page, it'll pick the first one.

**Fix:** Consider using a more robust detection:
```js
const scripts = document.querySelectorAll('script[data-api-key]');
script = scripts[scripts.length - 1]; // last one is most likely ours
```

---

## Architecture Compliance Summary

| Spec Requirement | Status | Notes |
|---|---|---|
| Single-tenant self-hosted | ✅ | |
| SQLite + WAL mode | ✅ | |
| Shadow DOM widget (open mode) | ✅ | |
| SSE streaming chat | ✅ | |
| Constant-time API key comparison | ✅ | Implemented correctly |
| Job queue with retry | ✅ | |
| Embedding cache with LRU eviction | ⚠️ | Works but O(n) performance (#4) |
| Token windowing (4K history, 3K KB) | ✅ | |
| Chunk strategy (500 tokens, 50 overlap) | ✅ | |
| Admin JWT auth | ✅ | |
| CORS per API key | ⚠️ | Checks union of all keys (#2) |
| Rate limiting (60/min chat, 10/min upload) | ✅ | |
| SSE connection limit (5 per key) | ✅ | |
| Focus trap + ARIA | ⚠️ | Shadow DOM activeElement bug (#6) |
| Docker + healthcheck | ✅ | |
| Widget <40KB gzipped | ✅ | Bundle built with esbuild |
| Login brute-force protection | ❌ | Missing (#3) |

---

## Overall Assessment

**Grade: B+**

The implementation is well-structured and follows the architecture spec closely. The critical issues (#1-3) need immediate fixes before deployment. The important issues should be addressed before production use with real customers. The codebase demonstrates good security awareness (constant-time comparison, input sanitization, XSS prevention via textContent) and solid engineering patterns (service layer separation, job queue, graceful degradation).
