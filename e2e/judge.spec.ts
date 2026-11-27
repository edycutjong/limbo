import { expect, test } from '@playwright/test';

// /judge is the page a triaging judge opens first. It must answer with no credentials, no cookies and no redirect, carry
// the one-sentence claim, keep its ten plates in order, and name the test count the Deploy smoke test greps for. The
// same request-level checks run against the live URL when LIMBO_LIVE_LANDING is set (the `live-judge` project).
// The browser test drives the in-page instrument on the local site: the real skeleton bundle, every engine check ticked,
// the shuffle landing on the replicas' own state, and the labelled recorded fallback when the bundle cannot load.

const CLAIM = 'When the connection dies, your app keeps working. When it returns, an item deleted while it was edited comes back as a ghost twin, and a lost claim is shown to its owner.';
const PLATES = ['crew', 'path', 'run', 'criteria', 'kiro', 'video', 'receipts', 'real', 'verify', 'limits'];
const CHECKS = ['cut', 'limbo', 'twin', 'claim', 'fixed', 'shuffle'];

const base = process.env['LIMBO_LIVE_LANDING'];

test('/judge answers 200 with no credentials, no redirect, the claim and the ten plates in order', async ({ playwright, baseURL }) => {
  const origin = base ?? baseURL;
  test.skip(!origin, 'no baseURL and LIMBO_LIVE_LANDING unset');
  const ctx = await playwright.request.newContext({ baseURL: origin, storageState: { cookies: [], origins: [] } });
  const res = await ctx.get('/judge', { maxRedirects: 0 });
  expect(res.status()).toBe(200);
  const html = await res.text();
  expect(html).toContain(CLAIM);
  const at = PLATES.map((id) => html.indexOf(`id="${id}" aria-labelledby="h-${id}"`));
  expect(at.every((i) => i > 0), `missing plate in ${at}`).toBe(true);
  expect([...at].sort((a, b) => a - b)).toEqual(at);
  for (const id of PLATES) expect(html).toContain(`<h2 id="h-${id}">`);
  expect(html).toMatch(/[\d,]+ unit, component and property tests pass/);
  expect(html).toContain('basecamp.limbo.edycu.dev');
  expect(html).toContain('aftershock.limbo.edycu.dev');
  expect(html).toMatch(/data-src="\/assets\/judge\.js\?v=[0-9a-f]{10}"/);
  const js = await ctx.get(html.match(/data-src="([^"]+)"/)![1]!);
  expect(js.status()).toBe(200);
  expect(await js.text()).toContain('LimboJudge');
  await ctx.dispose();
});

test('/judge in a browser: release chip fallback, the instrument runs the whole path, and a blocked engine says RECORDED', async ({ browser, baseURL }) => {
  test.skip(!baseURL, 'needs the local site server');
  test.setTimeout(60_000);
  const ctx = await browser.newContext({ reducedMotion: 'reduce' });
  const page = await ctx.newPage();
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.route('https://api.github.com/**', (r) => r.abort());
  await page.goto(`${baseURL}/judge`);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Cut the link. Judge what comes back.');
  await expect(page.locator('#version')).toHaveText('latest release'); // the release request is blocked, so the baked label stays
  const lab = page.locator('[data-proof]');
  await expect(lab).toHaveAttribute('data-engine', 'idle');
  await lab.locator('[data-act="auto"]').click();
  await expect(lab).toHaveAttribute('data-engine', 'live');
  for (const k of CHECKS) await expect(lab.locator(`[data-check="${k}"]`)).toHaveAttribute('data-done', '', { timeout: 30_000 });
  await expect(lab.locator('[data-shuffle-out]')).toContainText('1,000 / 1,000 orderings → 1 final state');
  await expect(lab.locator('[data-shuffle-out]')).toContainText('the state both replicas hold');
  const prints = await lab.locator('[data-print]').allTextContents();
  expect(prints).toHaveLength(2);
  expect(prints[0]).toBe(prints[1]);
  await expect(lab.locator('[data-replica="a"]')).toHaveAttribute('data-fixed', '');
  expect(errors).toEqual([]);

  const blocked = await ctx.newPage();
  await blocked.route('**/assets/judge.js*', (r) => r.abort());
  await blocked.route('https://api.github.com/**', (r) => r.abort());
  await blocked.goto(`${baseURL}/judge`);
  await blocked.locator('[data-proof] [data-act="link"]').click();
  await expect(blocked.locator('[data-proof]')).toHaveAttribute('data-engine', 'recorded', { timeout: 15_000 });
  await expect(blocked.locator('.recorded')).toBeVisible();
  await expect(blocked.locator('.recorded')).toContainText('1,000 orderings');
  await ctx.close();
});
