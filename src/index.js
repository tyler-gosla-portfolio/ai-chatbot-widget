import express from 'express';
import helmet from 'helmet';
import path from 'path';
import { fileURLToPath } from 'url';
import { env } from './config.js';
import { getDb } from './db/connection.js';
import { runMigrations } from './db/migrate.js';
import { loadAllEmbeddings } from './services/embeddingService.js';
import { startWorker, stopWorker, registerHandler } from './jobs/queue.js';
import { embedDocumentHandler } from './jobs/embedDocument.js';
import { dynamicCors } from './middleware/cors.js';
import { errorHandler } from './middleware/errorHandler.js';
import logger from './utils/logger.js';

import healthRouter from './routes/health.js';
import chatRouter from './routes/chat.js';
import adminRouter from './routes/admin.js';
import keysRouter from './routes/keys.js';
import kbRouter from './routes/kb.js';
import configRouter from './routes/config.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Initialize database
const db = getDb();
runMigrations(db);

// Load embedding cache
loadAllEmbeddings();

// Register job handlers
registerHandler('embed_document', embedDocumentHandler);

// Start job queue worker
startWorker();

const app = express();

// Security headers
app.use(helmet({
  contentSecurityPolicy: env.NODE_ENV === 'production',
}));

// CORS
app.use(dynamicCors);

// Body parsing
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));

// Routes
app.use('/health', healthRouter);
app.use('/api/v1/chat', chatRouter);
app.use('/api/v1/admin', adminRouter);
app.use('/api/v1/admin/keys', keysRouter);
app.use('/api/v1/admin/kb', kbRouter);
app.use('/api/v1/admin/config', configRouter);

// Widget static files
const widgetDist = path.join(__dirname, '../widget/dist');
app.use('/widget', express.static(widgetDist));

// Admin panel static files
const adminDist = path.join(__dirname, '../admin/dist');
app.use('/admin', express.static(adminDist));
app.get('/admin/*', (req, res) => {
  res.sendFile(path.join(adminDist, 'index.html'));
});

// Global error handler
app.use(errorHandler);

const PORT = env.PORT;
const server = app.listen(PORT, () => {
  logger.info(`AI Chatbot API running on port ${PORT} [${env.NODE_ENV}]`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  logger.info('SIGTERM received, shutting down gracefully');
  stopWorker();
  server.close(() => {
    logger.info('Server closed');
    process.exit(0);
  });
});

export { app };
