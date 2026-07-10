import { test, expect, login } from './fixtures';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

// Verifies that a password change in one browser session kicks every other
// active session for the same user to /login on next navigation. Middleware
// and lib/nextauth.ts implement this by comparing the JWT's iat against the
// crm.SessionRevocation row written by /api/auth/change-password.

const prisma = new PrismaClient();

const ADMIN_EMAIL    = 'test.admin@example.test';
const ORIGINAL_PASS  = 'pass1234';
const NEW_PASS       = 'newpass1234abc';

async function resetAdminPassword(): Promise<void> {
  const hash = await bcrypt.hash(ORIGINAL_PASS, 10);
  await prisma.user.update({
    where: { email: ADMIN_EMAIL },
    data:  { passwordHash: hash },
  });
  // Clear any prior revocation so a previous test run doesn't bleed in.
  await prisma.sessionRevocation.deleteMany({ where: { email: ADMIN_EMAIL } });
}

test.describe('Password change invalidates other sessions', () => {
  test.beforeEach(resetAdminPassword);
  test.afterAll(async () => {
    await resetAdminPassword();
    await prisma.$disconnect();
  });

  test('changing password in tab A kicks tab B to /login', async ({ browser }) => {
    // Two isolated browser contexts simulate two devices logged in as the
    // same user. (Same-context "tabs" would share a cookie jar, so this
    // tests the harder case where a remote device must be invalidated via
    // passwordChangedAt rather than via cookie clear.)
    const ctxA = await browser.newContext();
    const ctxB = await browser.newContext();
    const pageA = await ctxA.newPage();
    const pageB = await ctxB.newPage();

    try {
      await login(pageA, 'admin');
      await login(pageB, 'admin');

      // Sanity: B can reach a protected page.
      await pageB.goto('/profile');
      await expect(pageB).toHaveURL(/\/profile/);

      // Tab A: open profile and submit the change-password form.
      await pageA.goto('/profile');
      const currentInput = pageA.locator('input[autocomplete="current-password"]');
      const newInputs    = pageA.locator('input[autocomplete="new-password"]');
      await currentInput.fill(ORIGINAL_PASS);
      await newInputs.nth(0).fill(NEW_PASS);
      await newInputs.nth(1).fill(NEW_PASS);
      await pageA.getByRole('button', { name: /update password/i }).click();

      // The frontend success handler waits 1.5s then signOut()s — so A
      // lands on /login.
      await pageA.waitForURL(/\/login/, { timeout: 10_000 });

      // Tab B: a fresh navigation. Middleware should see token.iat <
      // SessionRevocation.revokedAfter, clear the cookie, and redirect to
      // /login.
      await pageB.goto('/home');
      await expect(pageB).toHaveURL(/\/login/, { timeout: 10_000 });
    } finally {
      await ctxA.close();
      await ctxB.close();
    }
  });

  test('wrong current password returns 401 and does NOT change anything', async ({ page }) => {
    await login(page, 'admin');
    await page.goto('/profile');

    await page.locator('input[autocomplete="current-password"]').fill('wrong-password');
    await page.locator('input[autocomplete="new-password"]').nth(0).fill(NEW_PASS);
    await page.locator('input[autocomplete="new-password"]').nth(1).fill(NEW_PASS);
    await page.getByRole('button', { name: /update password/i }).click();

    // UserProfile surfaces the API error text inline.
    await expect(
      page.getByText(/current password is incorrect/i),
    ).toBeVisible({ timeout: 5_000 });

    // Still on /profile, still signed in.
    await expect(page).toHaveURL(/\/profile/);

    // The original password should still authenticate against the DB.
    const user = await prisma.user.findUnique({ where: { email: ADMIN_EMAIL } });
    expect(user).not.toBeNull();
    const stillOriginal = await bcrypt.compare(ORIGINAL_PASS, user!.passwordHash);
    expect(stillOriginal).toBe(true);
    // No revocation row should have been written.
    const revocation = await prisma.sessionRevocation.findUnique({
      where: { email: ADMIN_EMAIL },
    });
    expect(revocation).toBeNull();
  });
});
