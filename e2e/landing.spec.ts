import { expect, test } from '@playwright/test';

// The landing hero runs BASECAMP's ops on the skeleton inside the page (site/src/hero.ts → site/assets/hero.js).
// Every look must follow a real sync value: cut → fog, offline edit → counted in limbo, restore → LIVE,
// the lake scene → twins on both plates, Keep + OK → FIXED on both. Reduced motion makes each step instant.

const plates = '[data-hero] .lb-plate';
const axes = (page: import('@playwright/test').Page) => page.locator(plates).evaluateAll((ps) => ps.map((p) => (p as HTMLElement).dataset['axis']));

test('the hero instrument follows the real sync state from cut to FIXED', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.route('https://api.github.com/**', (r) => r.abort());
  await page.goto('/');
  expect(await page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches)).toBe(true);
  await expect(page.locator('[data-hero]')).toHaveAttribute('data-ready', '');
  await page.click('[data-act="reset"]');
  await page.click('[data-act="link"]');
  await expect.poll(() => axes(page)).toEqual(['FOGGED', 'FOGGED']);
  await page.click('[data-replica="b"] [data-act="tick"][data-id="gas"]');
  await expect(page.locator('[data-replica="b"] .lb-count')).toHaveText('1');
  await expect(page.locator('[data-replica="b"] .lb-limbo')).toContainText('item.tick');
  await page.click('[data-act="link"]');
  await expect.poll(() => axes(page)).toEqual(['LIVE', 'LIVE']);
  await page.click('[data-act="scene"]');
  await expect(page.locator(`${plates}[data-conflict="CONFLICT"]`)).toHaveCount(2);
  await expect(page.locator('[data-replica="a"] .lb-twin').first()).toContainText('Budi deleted this while Sari ticked it');
  await page.click('[data-replica="a"] [data-act="keep"][data-id="tent"]');
  await page.click('[data-replica="b"] [data-act="ok"][data-id="stove"]');
  await expect(page.locator(`${plates}[data-fixed][data-conflict="CLEAR"]`)).toHaveCount(2);
});

test('the deck serves 12 slides and steps through the replayed session', async ({ page }) => {
  await page.route('https://api.github.com/**', (r) => r.abort());
  await page.goto('/deck/#10');
  await expect(page.locator('.slide')).toHaveCount(12);
  await expect(page.locator('.slide.on')).toHaveAttribute('aria-label', '10: The Agent Stop block');
  const later = page.locator('.slide.on .term-line.later');
  const before = await later.count();
  await page.keyboard.press('ArrowRight');
  await expect(later).toHaveCount(before - 1);
});
