import { Router } from 'express';
import { z } from 'zod';
import { adminAuth } from '../middleware/adminAuth.js';
import { validate } from '../middleware/validate.js';
import { createApiKey, listApiKeys, deleteApiKey, rotateApiKey } from '../services/adminService.js';

const router = Router();
router.use(adminAuth);

const createKeySchema = z.object({
  name: z.string().min(1),
  allowedOrigins: z.array(z.string()).default([]),
});

router.post('/', validate(createKeySchema), (req, res, next) => {
  try {
    const { name, allowedOrigins } = req.validated;
    const key = createApiKey(name, allowedOrigins);
    res.status(201).json(key);
  } catch (err) { next(err); }
});

router.get('/', (req, res, next) => {
  try {
    res.json(listApiKeys());
  } catch (err) { next(err); }
});

router.delete('/:id', (req, res, next) => {
  try {
    deleteApiKey(req.params.id);
    res.status(204).send();
  } catch (err) { next(err); }
});

router.post('/:id/rotate', (req, res, next) => {
  try {
    const result = rotateApiKey(req.params.id);
    res.json(result);
  } catch (err) { next(err); }
});

export default router;
