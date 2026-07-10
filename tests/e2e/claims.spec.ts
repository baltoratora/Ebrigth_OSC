import { test, expect, login } from './fixtures';

test.describe('Claims smoke', () => {
  test('ADMIN can open the claims page', async ({ page }) => {
    await login(page, 'admin');
    await page.goto('/claim');
    await expect(page).toHaveURL(/\/claim/);

    // Default view is "status" (a dashboard of pending/approved/etc. claims).
    // The h1 reads "Claims Status" — assert that to prove auth + render.
    await expect(
      page.getByRole('heading', { name: /claims\s+status/i })
    ).toBeVisible({ timeout: 10_000 });
  });
});
