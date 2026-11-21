import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, test, type Browser, type Locator, type Page } from '@playwright/test';

// Live deployment check (R9). The two base addresses come only from the environment variables below;
// a test whose variable is unset is skipped, so `pnpm e2e` needs no network. The judge flow reads
// on-screen text and ARIA roles, scoped to a card by its `data-replica` attribute. With
// LIMBO_LIVE_RECORD=1 a JSON record of the run is written to evidence/live/.

type App = 'basecamp' | 'aftershock';
type Side = 'a' | 'b';

const URL_OF: Record<App, string | undefined> = {
  basecamp: process.env['LIMBO_LIVE_BASECAMP'],
  aftershock: process.env['LIMBO_LIVE_AFTERSHOCK'],
};
const VAR_OF: Record<App, string> = { basecamp: 'LIMBO_LIVE_BASECAMP', aftershock: 'LIMBO_LIVE_AFTERSHOCK' };
const SLOW = { timeout: 30_000 };

const card = (p: Page, id: Side): Locator => p.locator(`[data-replica="${id}"]`);
const region = (p: Page, id: Side, app: App): Locator =>
  app === 'basecamp' ? card(p, id).getByRole('list', { name: 'Packing list' }) : card(p, id).getByRole('grid');

// The claim winner sees a "Stop bringing it" button on their own card only; every other line must match.
const regionText = async (p: Page, id: Side, app: App): Promise<string> =>
  (await region(p, id, app).innerText()).replace(/^Stop bringing it\n/gm, '');

const wispCount = async (p: Page, id: Side): Promise<number> => {
  const l = card(p, id).locator('.wisp-count');
  if ((await l.count()) === 0) return 0;
  return Number(((await l.first().textContent()) ?? '').replace(/\D/g, '') || '0');
};

/** Both cards unfogged, chip "Live", same region text, no waiting ops. */
async function settled(p: Page, app: App): Promise<void> {
  for (const id of ['a', 'b'] as const) {
    await expect(card(p, id).locator('[data-fog]')).toHaveAttribute('data-fog', 'none', SLOW);
    await expect(card(p, id).locator('.limbo-chip-text')).toHaveText('Live', SLOW);
  }
  await expect
    .poll(async () => (await regionText(p, 'a', app)) === (await regionText(p, 'b', app)), SLOW)
    .toBe(true);
  await expect.poll(async () => (await wispCount(p, 'a')) + (await wispCount(p, 'b')), SLOW).toBe(0);
}

async function snap(p: Page, app: App): Promise<unknown> {
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

async function controlled(p: Page): Promise<void> {
  await p.evaluate(() => navigator.serviceWorker.ready.then(() => true));
  await expect.poll(() => p.evaluate(() => navigator.serviceWorker.controller !== null), SLOW).toBe(true);
  await expect.poll(() => p.evaluate(async () => (await caches.keys()).length), SLOW).toBeGreaterThan(0);
}

async function fresh(browser: Browser, url: string): Promise<{ page: Page; close(): Promise<void>; setOffline(v: boolean): Promise<void> }> {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 2000 } });
  const page = await ctx.newPage();
  await page.goto(url);
  return { page, close: () => ctx.close(), setOffline: (v) => ctx.setOffline(v) };
}

async function edit(p: Page, app: App): Promise<void> {
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

async function judgeBasecamp(p: Page): Promise<void> {
  const A = card(p, 'a');
  const B = card(p, 'b');
  await p.getByRole('button', { name: 'Cut link' }).click();
  await p.getByRole('button', { name: 'Play the lake scene' }).click();
  await expect(A.locator('.limbo-plate')).toContainText('2 WAITING', SLOW);
  await expect(B.locator('.limbo-plate')).toContainText('2 WAITING', SLOW);
  await p.getByRole('button', { name: 'Restore link' }).click();
  await expect(A.getByRole('button', { name: 'Keep', exact: true })).toBeVisible(SLOW);
  await expect(B.getByRole('button', { name: 'OK', exact: true })).toBeVisible(SLOW);
  for (const c of [A, B]) {
    await expect(c.getByText(/^Syncing/)).toHaveCount(0, SLOW);
    await expect(c.getByText(/^Live/).first()).toBeVisible(SLOW);
  }
  await A.getByRole('button', { name: 'Keep', exact: true }).click();
  await B.getByRole('button', { name: 'OK', exact: true }).click();
  await expect(p.getByText(/TWIN ·/)).toHaveCount(0, SLOW);
  await expect(A.getByRole('button', { name: 'Keep', exact: true })).toHaveCount(0, SLOW);
  await expect(B.getByRole('button', { name: 'OK', exact: true })).toHaveCount(0, SLOW);
  for (const c of [A, B]) {
    await expect(c.getByText('FIXED', { exact: true })).toBeVisible(SLOW);
    await expect(c.getByText('Sari is bringing it')).toHaveCount(1);
    await expect(c.getByText('Budi is bringing it')).toHaveCount(0);
  }
  await expect
    .poll(async () => (await regionText(p, 'a', 'basecamp')) === (await regionText(p, 'b', 'basecamp')), SLOW)
    .toBe(true);
}

async function judgeAftershock(p: Page): Promise<void> {
  const A = card(p, 'a');
  const B = card(p, 'b');
  await p.getByRole('button', { name: 'Cut link' }).click();
  await p.getByRole('button', { name: 'Play the survey scene' }).click();
  await expect(A.locator('.limbo-plate')).toContainText('3 WAITING', SLOW);
  await expect(B.locator('.limbo-plate')).toContainText('3 WAITING', SLOW);
  await p.getByRole('button', { name: 'Restore link' }).click();
  const keep = A.getByRole('button', { name: 'Keep this note: gas smell, east wall' });
  await expect(keep).toBeVisible(SLOW);
  for (const c of [A, B]) {
    await expect(c.getByText(/^Syncing/)).toHaveCount(0, SLOW);
    await expect(c.getByText(/^Live/).first()).toBeVisible(SLOW);
  }
  await keep.click();
  await expect(p.getByText(/TWIN ·/)).toHaveCount(0, SLOW);
  await expect(p.getByRole('button', { name: /^Keep this (note|count)/ })).toHaveCount(0, SLOW);
  for (const c of [A, B]) {
    await expect(c.getByText('FIXED', { exact: true })).toBeVisible(SLOW);
    await expect(c.getByText('UNSAFE', { exact: true }).first()).toBeVisible();
    await expect(c.getByText('5 reported — Sari 2, Budi 3')).toBeVisible();
  }
  await expect
    .poll(async () => (await region(p, 'a', 'aftershock').innerText()) === (await region(p, 'b', 'aftershock').innerText()), SLOW)
    .toBe(true);
}

// Record of the run (R9.6). Filled after each test; written once, only when LIMBO_LIVE_RECORD=1.
const results: { name: string; status: string }[] = [];

test.afterEach(({}, info) => {
  results.push({ name: info.title, status: info.status ?? 'unknown' });
});

test.afterAll(() => {
  if (process.env['LIMBO_LIVE_RECORD'] !== '1') return;
  const now = new Date().toISOString();
  const dir = resolve(process.cwd(), 'evidence', 'live');
  mkdirSync(dir, { recursive: true });
  const urls: Record<string, string> = {};
  for (const app of ['basecamp', 'aftershock'] as const) {
    const u = URL_OF[app];
    if (u) urls[app] = u;
  }
  const record = {
    date: now,
    urls,
    tests: results,
    passCount: results.filter((r) => r.status === 'passed').length,
  };
  writeFileSync(resolve(dir, `live-${now.replace(/[:.]/g, '-')}.json`), `${JSON.stringify(record, null, 2)}\n`);
});

for (const app of ['basecamp', 'aftershock'] as const) {
  const upper = app.toUpperCase();

  test.describe(`live ${app}`, () => {
    test.setTimeout(180_000);

    test(`${app}: judge flow converges with no twin left`, async ({ browser }) => {
      const url = URL_OF[app];
      test.skip(!url, `${VAR_OF[app]} not set`);
      const { page, close } = await fresh(browser, url!);
      await expect(page.locator('main h1')).toHaveText(new RegExp(`^${upper}$`, 'i'), SLOW);
      await settled(page, app);
      if (app === 'basecamp') await judgeBasecamp(page);
      else await judgeAftershock(page);
      await close();
    });

    test(`${app}: offline reload keeps the edit and the state`, async ({ browser }) => {
      const url = URL_OF[app];
      test.skip(!url, `${VAR_OF[app]} not set`);
      const { page, close, setOffline } = await fresh(browser, url!);
      await expect(page.locator('main h1')).toHaveText(new RegExp(`^${upper}$`, 'i'), SLOW);
      await controlled(page);
      await settled(page, app);

      await page.getByRole('button', { name: 'Cut link' }).click();
      await edit(page, app);
      await expect.poll(() => wispCount(page, 'a'), SLOW).toBeGreaterThan(0);
      await page.getByRole('button', { name: 'Restore link' }).click();
      await settled(page, app);
      const before = await snap(page, app);

      await setOffline(true);
      await page.reload();
      await expect(page.locator('main h1')).toHaveText(new RegExp(`^${upper}$`, 'i'), SLOW);
      await settled(page, app);
      expect(await snap(page, app)).toEqual(before);
      expect(await page.evaluate(() => navigator.serviceWorker.controller !== null)).toBe(true);

      for (const id of ['a', 'b'] as const) {
        if (app === 'basecamp') {
          await expect(card(page, id).getByRole('checkbox', { name: /^Tick Tent/ })).toBeChecked();
        } else {
          await expect(card(page, id).getByText('UNSAFE', { exact: true }).first()).toBeVisible();
        }
      }
      await close();
    });

    test(`${app}: sw.js is revalidated`, async ({ request }) => {
      const url = URL_OF[app];
      test.skip(!url, `${VAR_OF[app]} not set`);
      const res = await request.get(new URL('sw.js', url!.endsWith('/') ? url! : `${url!}/`).toString());
      expect(res.ok()).toBe(true);
      const cc = res.headers()['cache-control'] ?? '';
      const age = /max-age=(\d+)/.exec(cc);
      expect(age === null ? 0 : Number(age[1])).toBe(0);
      expect(cc).not.toContain('immutable');
    });
  });
}
