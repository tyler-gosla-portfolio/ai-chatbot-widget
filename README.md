# AI Chatbot Widget

A self-hosted AI chatbot widget with RAG (Retrieval-Augmented Generation) knowledge base. Drop a `<script>` tag on any website and get a fully functional AI chatbot powered by your documents.

## Features

- 🤖 **RAG Knowledge Base** — Upload PDF, Markdown, or TXT files; the bot answers based on your content
- 💬 **Streaming responses** — SSE-based real-time token streaming
- 🔒 **API key auth** — Per-key origin restrictions, key rotation
- 🎨 **Themeable widget** — Shadow DOM isolation, CSS variable theming
- ♿ **Accessible** — WCAG 2.1 AA, ARIA attributes, focus management, focus trap
- 🗄️ **SQLite** — Zero-dependency database, WAL mode, async job queue
- 🐳 **Docker-ready** — Multi-stage build, healthcheck, volumes

## Quick Start

### 1. Configure environment

```bash
cp .env.example .env
# Edit .env with your OPENAI_API_KEY, JWT_SECRET, ADMIN_EMAIL, ADMIN_PASSWORD
```

### 2. Install and seed

```bash
npm install
npm run seed
```

### 3. Start server

```bash
npm start
```

### 4. Embed the widget

```html
<script
  src="http://localhost:3000/widget/chatbot.js"
  data-api-key="pk_live_xxxx"
  data-theme-color="#4F46E5"
  data-bot-name="Support Bot"
  defer
></script>
```

## Docker Deployment

```bash
cp .env.example .env
# Edit .env
docker-compose up -d
docker-compose exec chatbot node src/seed.js
```

## Admin Panel

Visit `http://localhost:3000/admin/` and log in with your admin credentials.

From the admin panel you can:
- Upload documents to the knowledge base
- Create and manage API keys
- Configure bot name, system prompt, model settings
- Test knowledge base retrieval

## Widget Data Attributes

| Attribute | Default | Description |
|-----------|---------|-------------|
| `data-api-key` | *(required)* | Your API key |
| `data-api-url` | `window.location.origin` | API server URL |
| `data-theme-color` | `#4F46E5` | Primary color |
| `data-position` | `bottom-right` | Widget position |
| `data-welcome` | `Hi! How can I help you today?` | Welcome message |
| `data-bot-name` | `AI Assistant` | Bot display name |

## Widget JavaScript API

```js
window.ChatbotWidget.open()           // Open chat window
window.ChatbotWidget.close()          // Close chat window
window.ChatbotWidget.toggle()         // Toggle open/close
window.ChatbotWidget.sendMessage(msg) // Send a message programmatically
window.ChatbotWidget.destroy()        // Remove widget from page
window.ChatbotWidget.on('open', fn)   // Subscribe to events
window.ChatbotWidget.on('close', fn)
window.ChatbotWidget.on('message:sent', fn)
window.ChatbotWidget.on('message:received', fn)
window.ChatbotWidget.on('error', fn)
```

## Architecture

See [ARCHITECTURE_FINAL.md](./ARCHITECTURE_FINAL.md) for the full technical architecture.

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `OPENAI_API_KEY` | ✅ | OpenAI API key |
| `JWT_SECRET` | ✅ | JWT signing secret (min 32 chars) |
| `ADMIN_EMAIL` | ✅ | Initial admin email |
| `ADMIN_PASSWORD` | ✅ | Initial admin password (min 8 chars) |
| `PORT` | No | Server port (default: 3000) |
| `DB_PATH` | No | SQLite database path (default: ./data/chatbot.db) |
| `LOG_LEVEL` | No | Log level: error/warn/info/debug (default: info) |
| `NODE_ENV` | No | development/production/test (default: development) |

## Security Notes

- All API keys use constant-time comparison to prevent timing attacks
- Session ownership is enforced — users can only access their own sessions
- File uploads use UUID filenames to prevent path traversal
- JWT tokens expire after 24 hours
- Passwords are hashed with bcrypt (12 rounds)
- Set `allowedOrigins` on API keys for production — empty = development mode only

## License

MIT
