import { expect, test, type Page } from '@playwright/test';
import type { State } from '../apps/basecamp/src/model.ts';

// G1 spike (R17.4 to R17.6): two replicas go offline, edit, reconnect, and converge.
const RELAY = 'http://localhost:5175';

const parse = async (p: Page): Promise<State> =>
  JSON.parse(await p.evaluate(() => window.limbo.state())) as State;

test('two offline replicas converge after reconnect', async ({ browser, request }) => {
  await request.post(`${RELAY}/reset`);
  const ctxA = await browser.newContext();
  const ctxB = await browser.newContext();
  const a = await ctxA.newPage();
  const b = await ctxB.newPage();
  await a.goto('/?r=a');
  await b.goto('/?r=b');
  await a.evaluate(() => window.limbo.ready);
  await b.evaluate(() => window.limbo.ready);

  // Same seed (x, y, z) in both contexts.
  const seedA = await parse(a);
  expect(seedA.order).toEqual(['x', 'y', 'z']);
  expect(await a.evaluate(() => window.limbo.state())).toBe(await b.evaluate(() => window.limbo.state()));

  await ctxA.setOffline(true);
  await ctxB.setOffline(true);

  // A ticks x, moves z to the top, claims y. B deletes x, adds an item, claims y.
  await a.evaluate(() => {
    window.limbo.tick('x');
    window.limbo.move('z', 0);
    window.limbo.claim('y');
  });
  const newId = await b.evaluate(() => {
    window.limbo.delete('x');
    const id = window.limbo.add('w');
    window.limbo.claim('y');
    return id;
  });

  // R17.5: neither side sees the other's edits while offline (several poll periods).
  await a.waitForTimeout(800);
  const offA = await parse(a);
  const offB = await parse(b);
  expect(offA.items[newId]).toBeUndefined();
  expect(offA.items['x']?.life).toBe('alive');
  expect(offA.items['x']?.ticked).toBe(true);
  expect(offA.order[0]).toBe('z');
  expect(offB.items[newId]).toBeDefined();
  expect(offB.items['x']?.ticked).toBe(false);
  expect(offB.order).not.toContain('x');
  expect(offB.order[0]).not.toBe('z');
  expect(await a.evaluate(() => window.limbo.queued())).toBeGreaterThan(0);
  expect(await b.evaluate(() => window.limbo.queued())).toBeGreaterThan(0);

  await ctxA.setOffline(false);
  await ctxB.setOffline(false);

  // R17.6: wait for equal states and empty queues, then assert.
  await expect
    .poll(
      async () => {
        const [sa, sb, qa, qb] = await Promise.all([
          a.evaluate(() => window.limbo.state()),
          b.evaluate(() => window.limbo.state()),
          a.evaluate(() => window.limbo.queued()),
          b.evaluate(() => window.limbo.queued()),
        ]);
        return sa === sb && qa === 0 && qb === 0 && sa.includes(newId);
      },
      { timeout: 15_000 },
    )
    .toBe(true);

  const fa = await parse(a);
  const fb = await parse(b);
  expect(fa.items['x']?.life).toBe('twin');
  expect(fb.items['x']?.life).toBe('twin');
  expect(fa.items['y']?.winners).toHaveLength(1);
  expect(fb.items['y']?.winners).toHaveLength(1);
  expect(fa.order).toEqual(fb.order);
  expect(fa.order).toContain(newId);

  await ctxA.close();
  await ctxB.close();
});
