import OpenAI from 'openai';
import { getDb } from '../db/connection.js';
import { env } from '../config.js';
import logger from '../utils/logger.js';

const openai = new OpenAI({ apiKey: env.OPENAI_API_KEY });

// In-memory LRU embedding cache
const MAX_CACHE_SIZE = 50000;
const cache = new Map(); // chunkId -> Float32Array
const cacheOrder = []; // LRU tracking

function cacheGet(id) {
  const val = cache.get(id);
  if (val) {
    // Move to end (most recently used)
    const idx = cacheOrder.indexOf(id);
    if (idx > -1) cacheOrder.splice(idx, 1);
    cacheOrder.push(id);
  }
  return val;
}

function cacheSet(id, embedding) {
  if (cache.size >= MAX_CACHE_SIZE && !cache.has(id)) {
    const oldest = cacheOrder.shift();
    cache.delete(oldest);
  }
  cache.set(id, embedding);
  const idx = cacheOrder.indexOf(id);
  if (idx > -1) cacheOrder.splice(idx, 1);
  cacheOrder.push(id);
}

export function invalidateCache(documentId) {
  const db = getDb();
  const chunks = db.prepare('SELECT id FROM chunks WHERE document_id = ?').all(documentId);
  for (const { id } of chunks) {
    cache.delete(id);
    const idx = cacheOrder.indexOf(id);
    if (idx > -1) cacheOrder.splice(idx, 1);
  }
}

export function loadAllEmbeddings() {
  const db = getDb();
  const chunks = db.prepare('SELECT id, embedding FROM chunks WHERE embedding IS NOT NULL').all();
  for (const { id, embedding } of chunks) {
    if (embedding) {
      const arr = new Float32Array(embedding.buffer, embedding.byteOffset, embedding.byteLength / 4);
      cacheSet(id, arr);
    }
  }
  logger.info(`Loaded ${chunks.length} embeddings into cache`);
}

export async function embedTexts(texts) {
  const batches = [];
  for (let i = 0; i < texts.length; i += 100) {
    batches.push(texts.slice(i, i + 100));
  }
  
  const allEmbeddings = [];
  for (const batch of batches) {
    const response = await openai.embeddings.create({
      model: 'text-embedding-3-small',
      input: batch,
    });
    for (const item of response.data) {
      allEmbeddings.push(new Float32Array(item.embedding));
    }
  }
  return allEmbeddings;
}

function cosineSimilarity(a, b) {
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

export async function findSimilarChunks(query, threshold = 0.7, topK = 5, tokenBudget = 3000) {
  const db = getDb();
  const [queryEmbedding] = await embedTexts([query]);
  
  const chunks = db.prepare('SELECT id, document_id, content, metadata, token_count FROM chunks WHERE embedding IS NOT NULL').all();
  
  const scored = [];
  for (const chunk of chunks) {
    let embedding = cacheGet(chunk.id);
    if (!embedding) {
      const row = db.prepare('SELECT embedding FROM chunks WHERE id = ?').get(chunk.id);
      if (!row?.embedding) continue;
      embedding = new Float32Array(row.embedding.buffer, row.embedding.byteOffset, row.embedding.byteLength / 4);
      cacheSet(chunk.id, embedding);
    }
    const similarity = cosineSimilarity(queryEmbedding, embedding);
    if (similarity >= threshold) {
      scored.push({ ...chunk, similarity });
    }
  }
  
  scored.sort((a, b) => b.similarity - a.similarity);
  
  // Greedy fill within token budget
  const results = [];
  let usedTokens = 0;
  for (const chunk of scored.slice(0, topK * 3)) {
    const tokens = chunk.token_count || Math.ceil(chunk.content.length / 4);
    if (usedTokens + tokens > tokenBudget) continue;
    results.push(chunk);
    usedTokens += tokens;
    if (results.length >= topK) break;
  }
  
  return results;
}

export { cacheGet, cacheSet };
