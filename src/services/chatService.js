import OpenAI from 'openai';
import { getDb } from '../db/connection.js';
import { findSimilarChunks } from './embeddingService.js';
import { getBotConfig } from './adminService.js';
import { newSessionId, newMessageId } from '../utils/ids.js';
import { env } from '../config.js';
import logger from '../utils/logger.js';

const openai = new OpenAI({ apiKey: env.OPENAI_API_KEY });

const CHARS_PER_TOKEN = 4;
const HISTORY_TOKEN_BUDGET = 4000;
const MAX_TURNS = 10;

function estimateTokens(text) {
  return Math.ceil(text.length / CHARS_PER_TOKEN);
}

function buildKbContext(chunks) {
  if (!chunks || chunks.length === 0) return '';
  
  const sections = chunks.map(chunk => {
    const meta = JSON.parse(chunk.metadata || '{}');
    const parts = ['[Source:'];
    if (meta.source_file) parts.push(meta.source_file);
    if (meta.page_number) parts.push(`, Page ${meta.page_number}`);
    if (meta.section_title) parts.push(`, Section: "${meta.section_title}"`);
    parts.push(']');
    return `${parts.join('')}\n${chunk.content}`;
  });
  
  return `Use the following context to answer. If the context doesn't contain the answer, say so. Cite sources when possible.\n\n---\n${sections.join('\n---\n')}\n---`;
}

function windowHistory(messages) {
  // Take from most recent, up to 10 turns (20 messages), within 4K token budget
  const recent = messages.slice(-MAX_TURNS * 2);
  const windowed = [];
  let tokenCount = 0;
  
  for (let i = recent.length - 1; i >= 0; i--) {
    const tokens = estimateTokens(recent[i].content);
    if (tokenCount + tokens > HISTORY_TOKEN_BUDGET) break;
    windowed.unshift(recent[i]);
    tokenCount += tokens;
  }
  
  return windowed;
}

export async function getOrCreateSession(sessionId, apiKeyId, origin) {
  const db = getDb();
  if (sessionId) {
    const session = db.prepare('SELECT * FROM sessions WHERE id = ? AND api_key_id = ?').get(sessionId, apiKeyId);
    if (session) {
      db.prepare(`UPDATE sessions SET last_active = datetime('now') WHERE id = ?`).run(sessionId);
      return session;
    }
  }
  // Create new session
  const id = newSessionId();
  db.prepare(`INSERT INTO sessions (id, api_key_id, origin) VALUES (?, ?, ?)`).run(id, apiKeyId, origin || null);
  return { id, api_key_id: apiKeyId };
}

export async function streamChatMessage({ session, message, res, req }) {
  const db = getDb();
  const config = getBotConfig();
  
  // Strip HTML from user message
  const sanitizedMessage = message.replace(/<[^>]+>/g, '').slice(0, 2000);
  
  // Get conversation history
  const historyRows = db.prepare(`
    SELECT role, content FROM messages WHERE session_id = ? ORDER BY created_at ASC
  `).all(session.id);
  
  const history = windowHistory(historyRows.map(r => ({ role: r.role, content: r.content })));
  
  // RAG retrieval
  let kbContext = '';
  let kbChunks = [];
  try {
    kbChunks = await findSimilarChunks(
      sanitizedMessage,
      config.similarity_threshold || 0.7,
      5,
      3000
    );
    kbContext = buildKbContext(kbChunks);
  } catch (err) {
    logger.warn('KB retrieval failed, continuing without context:', err.message);
  }
  
  // Build system prompt
  const systemContent = [config.system_prompt, kbContext].filter(Boolean).join('\n\n');
  
  const messages = [
    { role: 'system', content: systemContent },
    ...history,
    { role: 'user', content: sanitizedMessage },
  ];
  
  // Store user message
  const userMsgId = newMessageId();
  db.prepare(`INSERT INTO messages (id, session_id, role, content, token_count) VALUES (?, ?, 'user', ?, ?)`).run(
    userMsgId, session.id, sanitizedMessage, estimateTokens(sanitizedMessage)
  );
  
  // Setup SSE headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Session-Id', session.id);
  
  const sendEvent = (data) => {
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };
  
  sendEvent({ type: 'start', sessionId: session.id });
  
  let fullResponse = '';
  let streamController = null;
  
  // Abort on client disconnect
  if (req) {
    req.on('close', () => {
      if (streamController) {
        streamController.abort();
        logger.info(`SSE stream aborted for session ${session.id}`);
      }
    });
  }
  
  try {
    const stream = await openai.chat.completions.create({
      model: config.model || 'gpt-4o-mini',
      messages,
      temperature: config.temperature ?? 0.7,
      max_tokens: config.max_tokens || 500,
      stream: true,
    });
    
    streamController = stream.controller;
    
    for await (const chunk of stream) {
      const token = chunk.choices[0]?.delta?.content || '';
      if (token) {
        fullResponse += token;
        sendEvent({ type: 'token', content: token });
      }
    }
    
    // Store assistant message
    const assistantMsgId = newMessageId();
    db.prepare(`INSERT INTO messages (id, session_id, role, content, token_count) VALUES (?, ?, 'assistant', ?, ?)`).run(
      assistantMsgId, session.id, fullResponse, estimateTokens(fullResponse)
    );
    
    sendEvent({ type: 'done', messageId: assistantMsgId });
    res.end();
    
  } catch (err) {
    if (err.name === 'AbortError' || err.message?.includes('abort')) {
      logger.info(`Stream aborted for session ${session.id}`);
      res.end();
      return;
    }
    logger.error('OpenAI stream error:', err.message);
    sendEvent({ type: 'error', code: 'openai_error', message: 'Service temporarily unavailable' });
    res.end();
  }
}

export function getSessionHistory(sessionId, apiKeyId) {
  const db = getDb();
  const session = db.prepare('SELECT * FROM sessions WHERE id = ? AND api_key_id = ?').get(sessionId, apiKeyId);
  if (!session) return null;
  
  const messages = db.prepare(`
    SELECT id, role, content, created_at FROM messages WHERE session_id = ? ORDER BY created_at ASC
  `).all(sessionId);
  
  return {
    sessionId,
    messages: messages.map(m => ({
      id: m.id,
      role: m.role,
      content: m.content,
      createdAt: m.created_at,
    })),
  };
}

export function deleteSession(sessionId, apiKeyId) {
  const db = getDb();
  const session = db.prepare('SELECT id FROM sessions WHERE id = ? AND api_key_id = ?').get(sessionId, apiKeyId);
  if (!session) return false;
  db.prepare('DELETE FROM sessions WHERE id = ?').run(sessionId);
  return true;
}
