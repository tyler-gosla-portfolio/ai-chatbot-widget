# API Reference

Base URL: `/api/v1`

## Authentication

### Widget Endpoints
Pass API key in the `X-API-Key` header:
```
X-API-Key: pk_live_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

### Admin Endpoints
Pass JWT token in the `Authorization` header:
```
Authorization: Bearer eyJhbG...
```

---

## Admin Auth

### POST /api/v1/admin/login
Authenticate and receive a JWT token.

**Request:**
```json
{ "email": "admin@example.com", "password": "yourpassword" }
```

**Response:**
```json
{ "token": "eyJhbG...", "expiresIn": 86400 }
```

---

## Chat

### POST /api/v1/chat/message
Send a message and receive a streamed AI response via SSE.

**Headers:** `X-API-Key`

**Request:**
```json
{ "message": "How do I reset my password?", "sessionId": "ses_abc123" }
```

**Response:** `text/event-stream`
```
data: {"type":"start","sessionId":"ses_abc123"}
data: {"type":"token","content":"To reset your password..."}
data: {"type":"done","messageId":"msg_xyz"}
```

**Error before stream:** JSON with HTTP status code
**Error during stream:** SSE event `{"type":"error","code":"openai_error","message":"..."}`

### GET /api/v1/chat/history/:sessionId
Get message history for a session. Only accessible by the API key that created it.

**Headers:** `X-API-Key`

**Response:**
```json
{
  "sessionId": "ses_abc123",
  "messages": [
    { "id": "msg_1", "role": "user", "content": "Hello", "createdAt": "..." },
    { "id": "msg_2", "role": "assistant", "content": "Hi!", "createdAt": "..." }
  ]
}
```

### DELETE /api/v1/chat/sessions/:sessionId
Clear a session. Returns 404 if session not found or belongs to different API key.

**Headers:** `X-API-Key`

**Response:** `204 No Content`

---

## Knowledge Base (Admin)

### POST /api/v1/admin/kb/documents
Upload a document. Returns immediately (202 Accepted) — processing is async.

**Headers:** `Authorization: Bearer <jwt>`

**Body:** `multipart/form-data`
- `file` — PDF, MD, or TXT (max 10MB)
- `metadata` — JSON string (optional)

**Response (202):**
```json
{ "id": "doc_abc", "filename": "faq.pdf", "status": "queued", "createdAt": "..." }
```

### GET /api/v1/admin/kb/documents
List all documents. Supports `?limit=20&offset=0`.

### GET /api/v1/admin/kb/documents/:id
Get a single document.

### GET /api/v1/admin/kb/documents/:id/status
Poll processing status:
```json
{ "id": "doc_abc", "status": "processing", "chunksProcessed": 20, "chunksTotal": 42, "error": null }
```

### DELETE /api/v1/admin/kb/documents/:id
Delete a document and all its chunks.

### POST /api/v1/admin/kb/search
Test retrieval quality.

**Request:**
```json
{ "query": "password reset", "topK": 5 }
```

**Response:**
```json
{
  "results": [
    { "id": "chk_xxx", "documentId": "doc_abc", "content": "...", "similarity": 0.85, "metadata": {} }
  ]
}
```

---

## API Keys (Admin)

### POST /api/v1/admin/keys
Create an API key.

**Request:**
```json
{ "name": "Production Website", "allowedOrigins": ["https://example.com"] }
```

**Response:**
```json
{ "id": "key_abc", "apiKey": "pk_live_...", "name": "Production Website", "createdAt": "..." }
```

### GET /api/v1/admin/keys
List all API keys (keys are not returned — only metadata).

### DELETE /api/v1/admin/keys/:id
Revoke an API key.

### POST /api/v1/admin/keys/:id/rotate
Rotate an API key (generates new key, preserves sessions/history).

**Response:**
```json
{ "id": "key_abc", "apiKey": "pk_live_newkey...", "name": "Production Website" }
```

---

## Bot Config (Admin)

### GET /api/v1/admin/config
Get current bot configuration.

### PATCH /api/v1/admin/config
Partial update — only included fields are changed.

**Request:**
```json
{
  "botName": "Support Bot",
  "systemPrompt": "You are a helpful support agent...",
  "welcomeMessage": "Hi! How can I help?",
  "model": "gpt-4o-mini",
  "temperature": 0.7,
  "maxTokens": 500,
  "similarityThreshold": 0.7
}
```

---

## Health

### GET /health
```json
{ "status": "ok", "uptime": 3600, "dbStatus": "connected" }
```

---

## Error Response Format

All errors follow this schema:
```json
{
  "error": "error_code",
  "message": "Human-readable description"
}
```

Error codes: `invalid_api_key`, `unauthorized`, `forbidden`, `not_found`, `validation_error`, `rate_limited`, `processing_error`, `openai_error`, `internal_error`

## Rate Limits

- Chat: 60 requests/minute per API key
- Uploads: 10 requests/minute per admin
- Max 5 concurrent SSE connections per API key
