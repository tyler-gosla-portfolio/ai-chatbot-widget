# AI Chatbot Widget — Portfolio Project

**Source:** Fiverr gig reference "I will create ai chatbot for your website" ($100 basic)
**Goal:** Build a production-ready, embeddable AI chatbot widget that any website can integrate.

## Product Requirements

### Core Features
1. **Embeddable Widget** — Single `<script>` tag drops a chat bubble onto any website
2. **AI-Powered Responses** — Uses OpenAI API (GPT-4o-mini) for intelligent conversation
3. **Custom Knowledge Base** — Upload documents (PDF, MD, TXT) to train the chatbot on specific content
4. **Conversation History** — Persists chat sessions in browser storage
5. **Customizable Appearance** — Colors, position, avatar, welcome message configurable via data attributes
6. **Responsive Design** — Works on mobile and desktop

### Technical Requirements
- **Frontend Widget:** Vanilla JS + CSS (no framework dependency for embed)
- **Backend API:** Node.js + Express
- **Vector Store:** Local file-based (SQLite + embeddings) for knowledge base
- **Auth:** API key-based for widget authentication
- **Deployment:** Dockerized, deployable anywhere

### Architecture
```
[Website] → <script src="chatbot.js"> → [Widget UI]
                                            ↕
                                     [REST API Server]
                                       ↕           ↕
                                 [OpenAI API]  [Vector DB]
                                                   ↕
                                            [Knowledge Base]
```

### Deliverables
1. Embeddable widget (`chatbot.js` + `chatbot.css`)
2. Backend API server
3. Admin panel for knowledge base management
4. Docker Compose setup
5. Documentation (README, API docs, integration guide)
6. Test suite (unit + integration + E2E)

### Success Criteria
- Widget loads in <500ms on any page
- Chat responses in <2s
- Knowledge base queries return relevant results
- All tests pass
- Clean, documented, deployable code
