import { test, expect } from '@playwright/test';

// The small tools of the security and business courses.

test('hash lab: one changed letter flips about half of the bits', async ({ page }) => {
  await page.goto('./#/drills/hash');
  await expect(page.getByRole('heading', { name: 'Hash playground' })).toBeVisible();
  await expect(page.getByTestId('hash-a')).toHaveText(/^[0-9a-f]{64}$/);
  await expect(page.getByText(/differ in \d+ of 256 bits/)).toBeVisible();
  await page.getByLabel('Text B (change one letter)').fill('Courseify');
  await expect(page.getByText('The texts are the same, so the hashes are the same.')).toBeVisible();
});

test('password lab: a common password is very weak, a long phrase is strong', async ({ page }) => {
  await page.goto('./#/drills/password');
  await page.locator('.pw-row input').fill('password');
  await expect(page.getByTestId('pw-label')).toContainText('very weak');
  await page.locator('.pw-row input').fill('correct horse battery staple ocean');
  await expect(page.getByTestId('pw-label')).toContainText(/strong|very strong/);
});

test('network plan builder: the example is solved, a loop is named', async ({ page }) => {
  await page.goto('./#/drills/netzplan');
  await expect(page.getByTestId('np-path')).toHaveText('A → C → E → F');
  await expect(page.getByText('Project duration: 10')).toBeVisible();
  // Make A wait for F: a circle.
  await page.locator('.np-input tbody tr').first().getByLabel('After (predecessors)').fill('F');
  await expect(page.getByRole('alert')).toContainText('wait for each other in a circle');
});
