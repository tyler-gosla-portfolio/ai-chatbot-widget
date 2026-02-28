import { z } from 'zod';
import { config } from 'dotenv';

config();

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().default(3000),
  OPENAI_API_KEY: z.string().min(1, 'OPENAI_API_KEY is required'),
  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
  ADMIN_EMAIL: z.string().email('ADMIN_EMAIL must be a valid email'),
  ADMIN_PASSWORD: z.string().min(8, 'ADMIN_PASSWORD must be at least 8 characters'),
  DB_PATH: z.string().default('./data/chatbot.db'),
  LOG_LEVEL: z.enum(['error', 'warn', 'info', 'debug']).default('info'),
});

let env;
try {
  env = envSchema.parse(process.env);
} catch (err) {
  console.error('❌ Environment validation failed:');
  if (err.errors) {
    for (const e of err.errors) {
      console.error(`  ${e.path.join('.')}: ${e.message}`);
    }
  } else {
    console.error(err.message);
  }
  process.exit(1);
}

export { env };
export default env;
