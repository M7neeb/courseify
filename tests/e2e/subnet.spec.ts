import { test, expect, type Page } from '@playwright/test';

// The subnet solver: several boxes, each checked on its own.

/** The host and prefix from the task on the page ("192.168.1.77/26"), and the answers worked out here. */
async function solve(page: Page) {
  const text = (await page.locator('.drill-prompt .drill-mono').first().innerText()).trim();
  const m = text.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)\/(\d+)$/)!;
  const ip = m.slice(1, 5).map(Number);
  const prefix = Number(m[5]);
  const mask = ((0xffffffff << (32 - prefix)) >>> 0);
  const a = ((ip[0] << 24) | (ip[1] << 16) | (ip[2] << 8) | ip[3]) >>> 0;
  const net = (a & mask) >>> 0;
  const bc = (net | (~mask >>> 0)) >>> 0;
  const oct = (n: number) => [n >>> 24, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];
  return {
    mask: oct(mask),
    network: oct(net),
    first: oct(net + 1),
    last: oct(bc - 1),
    broadcast: oct(bc),
    hosts: String(2 ** (32 - prefix) - 2)
  };
}

async function fillIp(page: Page, id: string, octets: number[]) {
  const boxes = page.locator(`[data-field="${id}"] input`);
  for (let i = 0; i < 4; i++) if (!(await boxes.nth(i).isDisabled()) && (await boxes.nth(i).getAttribute('readonly')) === null) await boxes.nth(i).fill(String(octets[i]));
}

test('subnet solver: one wrong box stays marked while the others lock', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (err) => errors.push(err.message));
  await page.goto('./#/drills/subnet');
  await expect(page.getByRole('heading', { name: 'Subnet solver' })).toBeVisible();
  await page.getByRole('group', { name: 'Task type' }).getByRole('button', { name: 'Everything' }).click();
  const want = await solve(page);

  await fillIp(page, 'mask', want.mask);
  await fillIp(page, 'network', want.network);
  await fillIp(page, 'first', want.first);
  await fillIp(page, 'last', want.last);
  await fillIp(page, 'broadcast', want.broadcast.map((o, i) => (i === 3 ? (o + 1) % 256 : o)));
  await page.locator('[data-field="hosts"] input').fill(want.hosts);
  await page.getByRole('button', { name: 'Check' }).click();

  await expect(page.locator('[data-field="broadcast"]')).toHaveAttribute('data-status', 'bad');
  await expect(page.locator('[data-field="network"]')).toHaveAttribute('data-status', 'ok');
  await expect(page.locator('[data-field="hosts"]')).toHaveAttribute('data-status', 'ok');
  await expect(page.locator('[data-field="network"] input').first()).toHaveAttribute('readonly', '');

  await fillIp(page, 'broadcast', want.broadcast);
  await page.getByRole('button', { name: 'Check' }).click();
  await expect(page.getByText('Right. Next time without help.')).toBeVisible();
  await page.getByRole('button', { name: 'Next problem' }).click();
  await expect(page.getByRole('button', { name: 'Check' })).toBeDisabled();
  expect(errors).toEqual([]);
});

test('subnet solver: typing a dot jumps on, filled octets can be given, steps show the binary', async ({ page }) => {
  await page.goto('./#/drills/subnet');
  await page.getByRole('group', { name: 'Task type' }).getByRole('button', { name: 'Everything' }).click();
  await page.getByLabel('Fill in the octets that do not change').check();

  const net = page.locator('[data-field="network"] input');
  const readonlyCount = await net.evaluateAll((els) => els.filter((e) => (e as HTMLInputElement).readOnly).length);
  expect(readonlyCount).toBeGreaterThanOrEqual(1);
  const firstFree = readonlyCount;
  await net.nth(firstFree).focus();
  await page.keyboard.type('12.');
  await expect(net.nth(firstFree)).toHaveValue('12');
  if (firstFree < 3) await expect(net.nth(firstFree + 1)).toBeFocused();

  await page.getByRole('button', { name: 'Show the first step' }).click();
  await expect(page.locator('.drill-steps li')).toHaveCount(1);
  await page.getByRole('button', { name: 'Show the next step' }).click();
  await expect(page.locator('.drill-steps .drill-mono').first()).toContainText('|');
});

test('subnet solver: same-network, subnet-size and exam tasks work and show the solution', async ({ page }) => {
  await page.goto('./#/drills/subnet');
  const modes = page.getByRole('group', { name: 'Task type' });

  await modes.getByRole('button', { name: 'Same network?' }).click();
  await expect(page.getByText('Are these two hosts in the same network?')).toBeVisible();
  await expect(page.locator('[data-field="same"] button')).toHaveCount(2);
  await page.getByRole('button', { name: 'Show the solution' }).click();
  await expect(page.locator('.drill-steps')).toBeVisible();
  await expect(page.locator('[data-field="netA"] input').first()).not.toHaveValue('');

  await page.getByRole('button', { name: 'Next problem' }).click();
  await modes.getByRole('button', { name: 'Subnet size' }).click();
  await expect(page.getByText(/needs \d+ hosts/)).toBeVisible();
  await expect(page.locator('[data-field="prefix"]')).toBeVisible();

  await modes.getByRole('button', { name: 'Exam tasks' }).click();
  await expect(page.getByText('Fixed tasks like in exams', { exact: false })).toBeVisible();
  await expect(page.locator('[data-field="broadcast"]')).toBeVisible();
});
