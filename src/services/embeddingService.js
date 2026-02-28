import OpenAI from 'openai';
import { getDb } from '../db/connection.js';
import { env } from '../config.js';
import logger from '../utils/logger.js';

const openai = new OpenAI({ apiKey: env.OPENAI_API_KEY });

// In-memory LRU embedding cache
// Uses Map insertion order for O(1) LRU — no cacheOrder array needed
const MAX_CACHE_SIZE = 50000;
const cache = new Map(); // chunkId -> Float32Array (insertion order = LRU order)

function cacheGet(id) {
  if (!cache.has(id)) return undefined;
  const val = cache.get(id);
  // Move to end (most recently used) by delete + re-set
  cache.delete(id);
  cache.set(id, val);
  return val;
}

function cacheSet(id, embedding) {
  if (cache.has(id)) cache.delete(id);
  if (cache.size >= MAX_CACHE_SIZE) {
    // Evict least recently used (first entry in Map)
    const oldest = cache.keys().next().value;
    cache.delete(oldest);
  }
  cache.set(id, embedding);
}

export function invalidateCache(documentId) {
  const db = getDb();
  const chunks = db.prepare('SELECT id FROM chunks WHERE document_id = ?').all(documentId);
  for (const { id } of chunks) {
    cache.delete(id);
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

  // Phase 1: score from cache only — avoid loading content for all chunks
  const allChunkIds = db.prepare('SELECT id FROM chunks WHERE embedding IS NOT NULL').all();
  const scored = [];
  for (const { id } of allChunkIds) {
    let embedding = cacheGet(id);
    if (!embedding) {
      const row = db.prepare('SELECT embedding FROM chunks WHERE id = ?').get(id);
      if (!row?.embedding) continue;
      embedding = new Float32Array(row.embedding.buffer, row.embedding.byteOffset, row.embedding.byteLength / 4);
      cacheSet(id, embedding);
    }
    const similarity = cosineSimilarity(queryEmbedding, embedding);
    if (similarity >= threshold) scored.push({ id, similarity });
  }

  scored.sort((a, b) => b.similarity - a.similarity);

  // Phase 2: fetch content only for top candidates
  const topIds = scored.slice(0, topK * 3).map(s => s.id);
  if (topIds.length === 0) return [];

  const placeholders = topIds.map(() => '?').join(',');
  const chunks = db.prepare(
    `SELECT id, document_id, content, metadata, token_count FROM chunks WHERE id IN (${placeholders})`
  ).all(...topIds);

  // Build a similarity lookup map
  const simMap = new Map(scored.map(s => [s.id, s.similarity]));
  chunks.sort((a, b) => (simMap.get(b.id) || 0) - (simMap.get(a.id) || 0));

  // Greedy fill within token budget
  const results = [];
  let usedTokens = 0;
  for (const chunk of chunks) {
    const tokens = chunk.token_count || Math.ceil(chunk.content.length / 4);
    if (usedTokens + tokens > tokenBudget) continue;
    results.push({ ...chunk, similarity: simMap.get(chunk.id) });
    usedTokens += tokens;
    if (results.length >= topK) break;
  }

  return results;
}

export { cacheGet, cacheSet };
