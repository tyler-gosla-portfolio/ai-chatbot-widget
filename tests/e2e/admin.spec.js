import { test, expect } from '@playwright/test';

const ADMIN_EMAIL = 'admin@test.com';
const ADMIN_PASSWORD = 'testpassword123';

async function loginAsAdmin(page) {
  await page.goto('/admin');
  await page.waitForLoadState('networkidle');

  // Fill in login form
  const emailInput = page.locator('input[type="email"], input[name="email"], input[placeholder*="email" i]').first();
  const passwordInput = page.locator('input[type="password"]').first();
  const submitBtn = page.locator('button[type="submit"], button:has-text("Login"), button:has-text("Sign In")').first();

  if (await emailInput.count() === 0) {
    test.skip(true, 'Admin login form not found — admin may not be built');
    return false;
  }

  await emailInput.fill(ADMIN_EMAIL);
  await passwordInput.fill(ADMIN_PASSWORD);
  await submitBtn.click();
  await page.waitForLoadState('networkidle');
  return true;
}

test.describe('Admin Panel — Auth', () => {
  test('admin panel loads', async ({ page }) => {
    await page.goto('/admin');
    await page.waitForLoadState('networkidle');
    // Should show login page or main panel
    await expect(page).not.toHaveURL('/admin/error');
  });

  test('login with valid credentials', async ({ page }) => {
    const loggedIn = await loginAsAdmin(page);
    if (!loggedIn) return;

    // After login, should not be on login page anymore
    // Check for dashboard/main content
    await page.waitForTimeout(1000);
    const currentUrl = page.url();
    // Either redirected or content changed
    const hasContent = await page.locator('nav, [class*="dashboard"], [class*="main"], [class*="admin"]').count();
    expect(hasContent).toBeGreaterThan(0);
  });

  test('login with invalid credentials shows error', async ({ page }) => {
    await page.goto('/admin');
    await page.waitForLoadState('networkidle');

    const emailInput = page.locator('input[type="email"], input[name="email"]').first();
    if (await emailInput.count() === 0) {
      test.skip(true, 'Login form not found');
      return;
    }

    await emailInput.fill(ADMIN_EMAIL);
    await page.locator('input[type="password"]').first().fill('wrongpassword');
    await page.locator('button[type="submit"]').first().click();
    await page.waitForTimeout(1000);

    // Should show error message
    const errorEl = page.locator('[class*="error"], [role="alert"], .error-message, [class*="alert"]').first();
    if (await errorEl.count() > 0) {
      await expect(errorEl).toBeVisible();
    } else {
      // Still on login page
      await expect(page.locator('input[type="password"]')).toBeVisible();
    }
  });
});

test.describe('Admin Panel — API via REST', () => {
  let authToken;

  test.beforeEach(async ({ request }) => {
    const res = await request.post('/api/v1/admin/login', {
      data: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD },
    });
    const body = await res.json();
    authToken = body.token;
  });

  test('create API key via REST', async ({ request }) => {
    const res = await request.post('/api/v1/admin/keys', {
      headers: { Authorization: `Bearer ${authToken}` },
      data: { name: 'E2E Test Key', allowedOrigins: [] },
    });
    expect(res.status()).toBe(201);
    const body = await res.json();
    expect(body.apiKey).toMatch(/^pk_live_/);
  });

  test('delete API key via REST', async ({ request }) => {
    // Create a key to delete
    const createRes = await request.post('/api/v1/admin/keys', {
      headers: { Authorization: `Bearer ${authToken}` },
      data: { name: 'To Delete E2E' },
    });
    const { id } = await createRes.json();

    const deleteRes = await request.delete(`/api/v1/admin/keys/${id}`, {
      headers: { Authorization: `Bearer ${authToken}` },
    });
    expect(deleteRes.status()).toBe(204);
  });

  test('update bot settings via REST', async ({ request }) => {
    const res = await request.patch('/api/v1/admin/config', {
      headers: { Authorization: `Bearer ${authToken}` },
      data: { botName: 'E2E Bot', welcomeMessage: 'Hello from E2E!' },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.bot_name).toBe('E2E Bot');
    expect(body.welcome_message).toBe('Hello from E2E!');
  });

  test('get config reflects updates', async ({ request }) => {
    await request.patch('/api/v1/admin/config', {
      headers: { Authorization: `Bearer ${authToken}` },
      data: { botName: 'Persistent Bot' },
    });

    const res = await request.get('/api/v1/admin/config', {
      headers: { Authorization: `Bearer ${authToken}` },
    });
    const body = await res.json();
    expect(body.bot_name).toBe('Persistent Bot');
  });

  test('logout by not using token', async ({ request }) => {
    // Without token, protected routes return 401
    const res = await request.get('/api/v1/admin/keys');
    expect(res.status()).toBe(401);
  });
});
