import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { v4 as uuidv4 } from 'uuid';
import { z } from 'zod';
import { adminAuth } from '../middleware/adminAuth.js';
import { uploadRateLimit } from '../middleware/rateLimiter.js';
import { validate } from '../middleware/validate.js';
import {
  createDocument,
  getDocument,
  getDocumentStatus,
  listDocuments,
  deleteDocument,
  searchKb,
} from '../services/kbService.js';

const router = Router();
router.use(adminAuth);

const uploadsDir = path.join(process.cwd(), 'uploads');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

const storage = multer.diskStorage({
  destination: uploadsDir,
  filename: (req, file, cb) => cb(null, `${uuidv4()}${path.extname(file.originalname)}`),
});

const ALLOWED_MIME_TYPES = ['application/pdf', 'text/plain', 'text/markdown', 'application/octet-stream'];
const ALLOWED_EXTENSIONS = ['.pdf', '.txt', '.md'];

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (ALLOWED_EXTENSIONS.includes(ext)) {
      cb(null, true);
    } else {
      cb(Object.assign(new Error('Only PDF, TXT, and MD files are allowed'), { status: 400, code: 'validation_error' }));
    }
  },
});

router.post('/documents', uploadRateLimit, upload.single('file'), async (req, res, next) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'validation_error', message: 'No file uploaded' });
    }
    let metadata = {};
    if (req.body.metadata) {
      try { metadata = JSON.parse(req.body.metadata); } catch {}
    }
    const doc = createDocument(req.file, metadata);
    res.status(202).json(doc);
  } catch (err) { next(err); }
});

router.get('/documents', (req, res, next) => {
  try {
    const limit = parseInt(req.query.limit) || 20;
    const offset = parseInt(req.query.offset) || 0;
    res.json(listDocuments({ limit, offset }));
  } catch (err) { next(err); }
});

router.get('/documents/:id', (req, res, next) => {
  try {
    const doc = getDocument(req.params.id);
    if (!doc) return res.status(404).json({ error: 'not_found', message: 'Document not found' });
    res.json(doc);
  } catch (err) { next(err); }
});

router.get('/documents/:id/status', (req, res, next) => {
  try {
    const status = getDocumentStatus(req.params.id);
    if (!status) return res.status(404).json({ error: 'not_found', message: 'Document not found' });
    res.json(status);
  } catch (err) { next(err); }
});

router.delete('/documents/:id', (req, res, next) => {
  try {
    const deleted = deleteDocument(req.params.id);
    if (!deleted) return res.status(404).json({ error: 'not_found', message: 'Document not found' });
    res.status(204).send();
  } catch (err) { next(err); }
});

const searchSchema = z.object({
  query: z.string().min(1),
  topK: z.number().int().min(1).max(20).default(5),
});

router.post('/search', validate(searchSchema), async (req, res, next) => {
  try {
    const { query, topK } = req.validated;
    const results = await searchKb(query, topK);
    res.json({ results: results.map(r => ({
      id: r.id,
      documentId: r.document_id,
      content: r.content,
      similarity: r.similarity,
      metadata: JSON.parse(r.metadata || '{}'),
    }))});
  } catch (err) { next(err); }
});

export default router;
