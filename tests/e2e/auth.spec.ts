import { test, expect, login } from './fixtures';

test.describe('Authentication smoke', () => {
  test('ADMIN logs in and lands on /home with all 7 module cards', async ({ page }) => {
    await login(page, 'admin');
    await expect(page).toHaveURL(/\/home/);

    // 7 modules visible by title
    // 'CNS' (renamed from 'CRM' in the rebrand — Client Nexus System).
    const titles = ['Library', 'Internal Dashboard', 'HRMS', 'CNS', 'SMS', 'Inventory', 'Academy'];
    for (const t of titles) {
      await expect(page.getByText(t, { exact: true }).first()).toBeVisible();
    }

    // No "Locked" pill should be present for ADMIN
    await expect(page.getByText('Locked', { exact: false })).toHaveCount(0);
  });

  test('BRANCH_MANAGER (Ampang) logs in and sees HRMS and Inventory unlocked', async ({ page }) => {
    await login(page, 'ampang');
    await expect(page).toHaveURL(/\/home/);

    // HRMS and Inventory cards should not show the Locked pill
    const hrmsCard = page.locator('a, div').filter({ hasText: 'HRMS' }).first();
    await expect(hrmsCard).toBeVisible();

    // BMs can access HRMS, Inventory, CNS and SMS (4 of 7 tiles); the
    // remaining 3 (Library, Internal Dashboard, Academy) show a Locked pill.
    await expect(page.getByText('Locked', { exact: false })).toHaveCount(3);
  });
});
