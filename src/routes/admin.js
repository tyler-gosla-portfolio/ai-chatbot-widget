import { Router } from 'express';
import { z } from 'zod';
import { validate } from '../middleware/validate.js';
import { loginAdmin } from '../services/adminService.js';

const router = Router();

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

router.post('/login', validate(loginSchema), async (req, res, next) => {
  try {
    const { email, password } = req.validated;
    const result = await loginAdmin(email, password);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

export default router;
