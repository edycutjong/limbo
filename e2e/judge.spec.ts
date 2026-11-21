import { expect, test } from '@playwright/test';

// /judge is the page a triaging judge opens first. It must answer with no credentials, no cookies and no redirect,
// carry the one-sentence claim, and keep the six sections in order. The same checks run against the live URL when
// LIMBO_LIVE_LANDING is set (the `live` project).

const CLAIM = 'When the connection dies, your app crosses over, keeps working on the other side, and comes back without losing an edit.';
const SECTIONS = ['The 60-second path', 'The receipts', 'Where Kiro did the work', 'Reproduce it', 'Honest limits', 'Links'];

const base = process.env['LIMBO_LIVE_LANDING'];

test('/judge answers 200 with no credentials, no redirect, the claim and the sections in order', async ({ playwright, baseURL }) => {
  const origin = base ?? baseURL;
  test.skip(!origin, 'no baseURL and LIMBO_LIVE_LANDING unset');
  const ctx = await playwright.request.newContext({ baseURL: origin, storageState: { cookies: [], origins: [] } });
  const res = await ctx.get('/judge', { maxRedirects: 0 });
  expect(res.status()).toBe(200);
  const html = await res.text();
  expect(html).toContain(CLAIM);
  const at = SECTIONS.map((s) => html.indexOf(`>${s}</h2>`));
  expect(at.every((i) => i > 0), `missing section in ${at}`).toBe(true);
  expect([...at].sort((a, b) => a - b)).toEqual(at);
  expect(html).toContain('basecamp.limbo.edycu.dev');
  expect(html).toContain('aftershock.limbo.edycu.dev');
  await ctx.dispose();
});

test('/judge renders in a browser and its version chip keeps the baked text when the release request fails', async ({ page, baseURL }) => {
  test.skip(!baseURL, 'needs the local site server');
  await page.route('https://api.github.com/**', (r) => r.abort());
  await page.goto('/judge');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('LIMBO, for judges');
  await expect(page.locator('#version')).toHaveText(/^v\d+\.\d+\.\d+$/);
});
