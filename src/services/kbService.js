import { getDb } from '../db/connection.js';
import { enqueueJob } from '../jobs/queue.js';
import { invalidateCache, findSimilarChunks } from './embeddingService.js';
import { newDocId } from '../utils/ids.js';
import logger from '../utils/logger.js';

export function createDocument(file, metadata = {}) {
  const db = getDb();
  const id = newDocId();
  
  db.prepare(`
    INSERT INTO documents (id, filename, mime_type, metadata, status, file_size)
    VALUES (?, ?, ?, ?, 'queued', ?)
  `).run(id, file.originalname, file.mimetype, JSON.stringify(metadata), file.size);

  // Enqueue processing job
  enqueueJob('embed_document', {
    documentId: id,
    filePath: file.path,
    originalFilename: file.originalname,
  });

  return getDocument(id);
}

export function getDocument(id) {
  const db = getDb();
  const doc = db.prepare('SELECT * FROM documents WHERE id = ?').get(id);
  if (!doc) return null;
  return formatDoc(doc);
}

export function getDocumentStatus(id) {
  const db = getDb();
  const doc = db.prepare('SELECT id, status, chunk_count, chunks_processed, error_message FROM documents WHERE id = ?').get(id);
  if (!doc) return null;
  return {
    id: doc.id,
    status: doc.status,
    chunksTotal: doc.chunk_count,
    chunksProcessed: doc.chunks_processed,
    error: doc.error_message,
  };
}

export function listDocuments({ limit = 20, offset = 0 } = {}) {
  const db = getDb();
  const total = db.prepare('SELECT COUNT(*) as n FROM documents').get().n;
  const docs = db.prepare('SELECT * FROM documents ORDER BY created_at DESC LIMIT ? OFFSET ?').all(limit, offset);
  return { documents: docs.map(formatDoc), total, limit, offset };
}

export function deleteDocument(id) {
  const db = getDb();
  const doc = db.prepare('SELECT id FROM documents WHERE id = ?').get(id);
  if (!doc) return false;
  invalidateCache(id);
  db.prepare('DELETE FROM documents WHERE id = ?').run(id);
  return true;
}

export async function searchKb(query, topK = 5) {
  return findSimilarChunks(query, 0.0, topK, Infinity);
}

function formatDoc(doc) {
  return {
    id: doc.id,
    filename: doc.filename,
    mimeType: doc.mime_type,
    status: doc.status,
    chunkCount: doc.chunk_count,
    chunksProcessed: doc.chunks_processed,
    fileSize: doc.file_size,
    metadata: JSON.parse(doc.metadata || '{}'),
    errorMessage: doc.error_message,
    createdAt: doc.created_at,
  };
}
