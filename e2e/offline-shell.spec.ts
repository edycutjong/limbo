import { test as base, expect, type Locator, type Page } from '@playwright/test';

// Offline reload against the production preview (service worker on). Run once per app by the
// `basecamp-shell` and `aftershock-shell` projects. The in-page pair reconnects at boot, so the
// wisp counts compared are the settled ones (design D4).

type Side = 'a' | 'b';
const test = base.extend<{ app: 'basecamp' | 'aftershock' }>({
  app: ['basecamp', { option: true }],
});

const card = (p: Page, id: Side): Locator => p.locator(`[data-replica="${id}"]`);
const region = (p: Page, id: Side, app: 'basecamp' | 'aftershock'): Locator =>
  app === 'basecamp' ? card(p, id).getByRole('list', { name: 'Packing list' }) : card(p, id).getByRole('grid');

const wispCount = async (p: Page, id: Side): Promise<number> => {
  const l = card(p, id).locator('.wisp-count');
  if ((await l.count()) === 0) return 0;
  return Number(((await l.first().textContent()) ?? '').replace(/\D/g, '') || '0');
};

async function snap(p: Page, app: 'basecamp' | 'aftershock'): Promise<unknown> {
  const out: Record<string, unknown> = {};
  for (const id of ['a', 'b'] as const) {
    out[id] = {
      text: await region(p, id, app).innerText(),
      wisps: await wispCount(p, id),
      chip: await card(p, id).locator('.limbo-chip-text').innerText(),
    };
  }
  return out;
}

/** Wait until both cards are live, unfogged and show the same region text. */
async function settled(p: Page, app: 'basecamp' | 'aftershock'): Promise<void> {
  for (const id of ['a', 'b'] as const) {
    await expect(card(p, id).locator('[data-fog]')).toHaveAttribute('data-fog', 'none', { timeout: 15_000 });
    await expect(card(p, id).locator('.limbo-chip-text')).toHaveText('Live', { timeout: 15_000 });
  }
  await expect
    .poll(async () => (await region(p, 'a', app).innerText()) === (await region(p, 'b', app).innerText()), { timeout: 15_000 })
    .toBe(true);
  await expect.poll(async () => (await wispCount(p, 'a')) + (await wispCount(p, 'b')), { timeout: 15_000 }).toBe(0);
}

async function controlled(p: Page): Promise<void> {
  await p.evaluate(() => navigator.serviceWorker.ready.then(() => true));
  await expect
    .poll(() => p.evaluate(() => navigator.serviceWorker.controller !== null), { timeout: 15_000 })
    .toBe(true);
  await expect.poll(() => p.evaluate(async () => (await caches.keys()).length), { timeout: 15_000 }).toBeGreaterThan(0);
}

const hasLimbo = (p: Page): Promise<boolean> => p.evaluate(() => 'limbo' in window);

async function edit(p: Page, app: 'basecamp' | 'aftershock'): Promise<void> {
  if (app === 'basecamp') {
    await card(p, 'a').getByRole('checkbox', { name: /^Tick Tent/ }).check();
    return;
  }
  await card(p, 'a').locator('[data-sector="C3"]').click();
  const form = card(p, 'a').locator('[data-form="C3"]');
  await form.getByRole('radio', { name: 'Unsafe' }).click();
  await form.locator('input[type="number"]').fill('3');
  await form.locator('textarea').fill('gas smell, east wall');
  await form.getByRole('button', { name: 'Save' }).click();
}

test('offline reload keeps the edit and the state', async ({ browser, app }) => {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 2000 } });
  const page = await ctx.newPage();
  await page.goto('/');
  await expect(page.locator('main h1')).toHaveText(new RegExp(`^${app}$`, 'i'));
  await controlled(page);
  await settled(page, app);
  expect(await hasLimbo(page)).toBe(false);

  await page.getByRole('button', { name: 'Cut link' }).click();
  await edit(page, app);
  await expect.poll(() => wispCount(page, 'a'), { timeout: 10_000 }).toBeGreaterThan(0);

  await page.getByRole('button', { name: 'Restore link' }).click();
  await settled(page, app);
  const before = await snap(page, app);

  await ctx.setOffline(true);
  await page.reload();
  await expect(page.locator('main h1')).toHaveText(new RegExp(`^${app}$`, 'i'));
  await settled(page, app);

  expect(await snap(page, app)).toEqual(before);
  expect(await hasLimbo(page)).toBe(false);
  expect(await page.evaluate(() => navigator.serviceWorker.controller !== null)).toBe(true);

  for (const id of ['a', 'b'] as const) {
    if (app === 'basecamp') {
      await expect(card(page, id).getByRole('checkbox', { name: /^Tick Tent/ })).toBeChecked();
    } else {
      await expect(card(page, id).locator('[data-sector="C3"] .as-cell-word')).toHaveText('UNSAFE');
    }
  }

  // The shuffle worker script is precached, so the test still runs offline.
  await page.getByRole('button', { name: 'Run shuffle test' }).click();
  await expect(page.getByText(/orderings → same state$/)).toBeVisible({ timeout: 60_000 });

  await ctx.close();
});
