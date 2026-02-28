import fs from 'fs';
import path from 'path';
import { getDb } from '../db/connection.js';
import { extractText } from '../utils/textExtractor.js';
import { chunkDocument } from '../services/chunkService.js';
import { embedTexts, invalidateCache, cacheSet } from '../services/embeddingService.js';
import { newChunkId } from '../utils/ids.js';
import logger from '../utils/logger.js';

export async function embedDocumentHandler({ documentId, filePath, originalFilename }) {
  const db = getDb();
  
  const doc = db.prepare('SELECT * FROM documents WHERE id = ?').get(documentId);
  if (!doc) throw new Error(`Document not found: ${documentId}`);

  db.prepare(`UPDATE documents SET status = 'processing' WHERE id = ?`).run(documentId);

  try {
    // Extract text
    logger.info(`Extracting text from ${originalFilename}`);
    const extracted = await extractText(filePath, doc.mime_type, originalFilename);
    
    // Store raw text
    db.prepare('UPDATE documents SET raw_text = ? WHERE id = ?').run(extracted.text, documentId);

    // Chunk
    const metadata = { filename: originalFilename, document_id: documentId };
    const chunks = chunkDocument(extracted, metadata);
    logger.info(`Created ${chunks.length} chunks for ${originalFilename}`);

    // Update total chunk count
    db.prepare('UPDATE documents SET chunk_count = ? WHERE id = ?').run(chunks.length, documentId);

    // Embed in batches
    const BATCH_SIZE = 100;
    let processed = 0;
    for (let i = 0; i < chunks.length; i += BATCH_SIZE) {
      const batch = chunks.slice(i, i + BATCH_SIZE);
      const embeddings = await embedTexts(batch.map(c => c.content));
      
      const insertChunk = db.prepare(`
        INSERT INTO chunks (id, document_id, content, chunk_index, embedding, token_count, metadata)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `);
      
      db.transaction(() => {
        for (let j = 0; j < batch.length; j++) {
          const chunk = batch[j];
          const id = newChunkId();
          const embeddingBuf = Buffer.from(embeddings[j].buffer);
          insertChunk.run(id, documentId, chunk.content, chunk.chunk_index, embeddingBuf, chunk.token_count, chunk.metadata);
          // Update cache
          cacheSet(id, embeddings[j]);
        }
      })();
      
      processed += batch.length;
      db.prepare('UPDATE documents SET chunks_processed = ? WHERE id = ?').run(processed, documentId);
      logger.info(`Embedded ${processed}/${chunks.length} chunks`);
    }

    db.prepare(`UPDATE documents SET status = 'processed', chunk_count = ? WHERE id = ?`).run(chunks.length, documentId);
    logger.info(`Document processed: ${documentId}`);

  } catch (err) {
    db.prepare(`UPDATE documents SET status = 'error', error_message = ? WHERE id = ?`).run(err.message, documentId);
    throw err;
  } finally {
    // Always clean up temp file
    try {
      if (filePath && fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
        logger.info(`Cleaned up temp file: ${filePath}`);
      }
    } catch (cleanupErr) {
      logger.warn(`Failed to clean up temp file: ${cleanupErr.message}`);
    }
  }
}
