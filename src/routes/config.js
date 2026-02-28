import { Router } from 'express';
import { z } from 'zod';
import { adminAuth } from '../middleware/adminAuth.js';
import { validate } from '../middleware/validate.js';
import { getBotConfig, updateBotConfig } from '../services/adminService.js';

const router = Router();
router.use(adminAuth);

const patchConfigSchema = z.object({
  botName: z.string().optional(),
  systemPrompt: z.string().optional(),
  welcomeMessage: z.string().optional(),
  model: z.string().optional(),
  temperature: z.number().min(0).max(2).optional(),
  maxTokens: z.number().int().min(1).max(4096).optional(),
  similarityThreshold: z.number().min(0).max(1).optional(),
}).strict();

router.get('/', (req, res, next) => {
  try {
    const cfg = getBotConfig();
    res.json(cfg);
  } catch (err) { next(err); }
});

router.patch('/', validate(patchConfigSchema), (req, res, next) => {
  try {
    const body = req.validated;
    // Map camelCase to snake_case for DB
    const mapped = {};
    if (body.botName !== undefined) mapped.bot_name = body.botName;
    if (body.systemPrompt !== undefined) mapped.system_prompt = body.systemPrompt;
    if (body.welcomeMessage !== undefined) mapped.welcome_message = body.welcomeMessage;
    if (body.model !== undefined) mapped.model = body.model;
    if (body.temperature !== undefined) mapped.temperature = body.temperature;
    if (body.maxTokens !== undefined) mapped.max_tokens = body.maxTokens;
    if (body.similarityThreshold !== undefined) mapped.similarity_threshold = body.similarityThreshold;
    const cfg = updateBotConfig(mapped);
    res.json(cfg);
  } catch (err) { next(err); }
});

export default router;
