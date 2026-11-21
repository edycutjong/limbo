import { test as base, expect } from '@playwright/test';

const test = base.extend<{ app: 'basecamp' | 'aftershock' }>({
  app: ['basecamp', { option: true }],
});

// Smoke: the production preview for each app starts and renders its title.
test('production preview loads', async ({ page, app }) => {
  await page.goto('/');
  await expect(page.locator('main h1')).toHaveText(new RegExp(`^${app}$`, 'i'));
});
