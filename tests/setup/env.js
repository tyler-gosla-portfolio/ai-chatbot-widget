/**
 * Set environment variables before any modules are imported.
 * Import this at the top of test files that need the app modules.
 */
process.env.NODE_ENV = 'test';
process.env.OPENAI_API_KEY = 'sk-test-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx';
process.env.JWT_SECRET = 'test-jwt-secret-that-is-at-least-32-chars-long!!';
process.env.ADMIN_EMAIL = 'admin@test.com';
process.env.ADMIN_PASSWORD = 'testpassword123';
process.env.DB_PATH = ':memory:';
process.env.PORT = '0';
process.env.LOG_LEVEL = 'error';
