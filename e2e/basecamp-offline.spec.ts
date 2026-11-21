import { expect, test, type Locator, type Page } from '@playwright/test';

// BASECAMP test (a), R15.1 and R15.2: the lake scene (R10.1 to R10.9, R10.11) in one page, pair view.
// A fresh browser context gives empty databases. Counts are read from the page, never from constants here.

type Side = 'a' | 'b';

const card = (p: Page, id: Side): Locator => p.locator(`[data-replica="${id}"]`);
const row = (p: Page, id: Side, item: string): Locator => card(p, id).locator(`[data-item="${item}"]`);
const rowIds = (p: Page, id: Side): Promise<string[]> =>
  card(p, id).locator('[data-item]').evaluateAll((els) => els.map((e) => (e as HTMLElement).dataset['item'] ?? ''));
// The spike declares `window.limbo` with another shape, so BASECAMP's is read through this cast.
interface Debug {
  ready: Promise<void>;
  state(id: Side): string;
  queued(id: Side): unknown[];
}
const num = async (l: Locator): Promise<number> => Number(((await l.textContent()) ?? '').trim());

declare global {
  interface Window {
    __seen: { fog: Record<string, Set<string>>; cross: Record<string, number> };
  }
}

/** Record every fog label and the most crossing wisps each card has shown. Transient states are otherwise missed. */
async function watch(p: Page): Promise<void> {
  await p.evaluate(() => {
    const seen = { fog: { a: new Set<string>(), b: new Set<string>() }, cross: { a: 0, b: 0 } } as Window['__seen'];
    window.__seen = seen;
    const scan = (): void => {
      for (const id of ['a', 'b'] as const) {
        const c = document.querySelector(`[data-replica="${id}"]`);
        if (!c) continue;
        const lab = c.querySelector('.limbo-fog-label')?.textContent;
        if (lab) seen.fog[id]!.add(lab);
        seen.cross[id] = Math.max(seen.cross[id]!, c.querySelectorAll('.wisp-cross').length);
      }
    };
    new MutationObserver(scan).observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true });
    scan();
  });
}

test('lake scene in one page: partition, Play the lake scene, reconnect, resolve, converge', async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 1600 } });
  const page = await ctx.newPage();
  await page.goto('/');
  await page.evaluate(() => (window as unknown as { limbo: Debug }).limbo.ready);

  const stateOf = (id: Side): Promise<string> => page.evaluate((i) => (window as unknown as { limbo: Debug }).limbo.state(i), id);
  const A = card(page, 'a');
  const B = card(page, 'b');

  // The page opens with the tagline, one h1 and a main landmark.
  await expect(page.locator('main h1')).toHaveCount(1);
  await expect(page.getByText('For people whose shared list breaks when the signal does.')).toBeVisible();

  // Both replicas start live, with the same seeded list and no Play button while the link is up.
  const seedIds = await rowIds(page, 'a');
  expect(seedIds.length).toBeGreaterThan(0);
  expect(await rowIds(page, 'b')).toEqual(seedIds);
  await expect(A.locator('.limbo-chip-text')).toHaveText('Live');
  await expect(B.locator('.limbo-chip-text')).toHaveText('Live');
  await expect(page.getByRole('button', { name: 'Play the lake scene' })).toHaveCount(0);
  expect(await stateOf('a')).toBe(await stateOf('b'));

  // R10.1: cut the link. Both cards fogged, chip "Offline".
  await page.getByRole('button', { name: 'Cut link' }).click();
  for (const id of ['a', 'b'] as const) {
    await expect(card(page, id).locator('[data-fog]')).toHaveAttribute('data-fog', 'full');
    await expect(card(page, id).locator('.limbo-fog-label')).toHaveText('Offline');
    await expect(card(page, id).locator('.limbo-chip-text')).toHaveText('Offline');
  }

  // R10.2 and R10.3 through the button (R11): four scripted edits, each labelled.
  await page.getByRole('button', { name: 'Play the lake scene' }).click();
  await expect(page.getByRole('button', { name: 'Play the lake scene' })).toHaveCount(0);
  await expect(A.locator('.limbo-plate')).toContainText('2 WAITING', { timeout: 10_000 });
  await expect(B.locator('.limbo-plate')).toContainText('2 WAITING', { timeout: 10_000 });
  await expect(row(page, 'a', 'tent').getByText('scripted edit')).toBeVisible();
  await expect(row(page, 'a', 'stove').getByText('scripted edit')).toBeVisible();
  await expect(row(page, 'b', 'stove').getByText('scripted edit')).toBeVisible();
  // B's scripted delete removes the tent row, so no label can sit beside it; only the stove claim shows one on B.
  expect(await rowIds(page, 'a')).toContain('tent');
  expect(await rowIds(page, 'b')).not.toContain('tent');
  expect(await card(page, 'b').locator('.bc-scripted').count()).toBe(1);

  // R10.2 as read from the page: each side's wisp counter is the queue length (the tent edit plus the stove claim).
  for (const id of ['a', 'b'] as const) {
    const q = await page.evaluate((i) => (window as unknown as { limbo: Debug }).limbo.queued(i).length, id);
    expect(await num(card(page, id).locator('.wisp-count'))).toBe(q);
    expect(q).toBe(2);
    await expect(row(page, id, 'stove')).toContainText('Yours? waiting');
  }
  // While cut, nothing crossed: A still has the tent, B does not.
  expect((JSON.parse(await stateOf('a')) as { items: Record<string, { life: string }> }).items['tent']?.life).toBe('alive');

  // R10.4: restore. Record the haze and crossing wisps while ops move.
  await watch(page);
  await page.getByRole('button', { name: 'Restore link' }).click();
  await expect
    .poll(async () => (await stateOf('a')) === (await stateOf('b')), { timeout: 15_000 })
    .toBe(true);
  await expect(A.locator('[data-fog]')).toHaveAttribute('data-fog', 'none', { timeout: 15_000 });
  await expect(B.locator('[data-fog]')).toHaveAttribute('data-fog', 'none', { timeout: 15_000 });
  const seen = await page.evaluate(() => ({
    fog: { a: [...window.__seen.fog.a!], b: [...window.__seen.fog.b!] },
    cross: window.__seen.cross,
  }));
  for (const id of ['a', 'b'] as const) {
    expect(seen.fog[id]).toContain('Syncing 2…');
    expect(seen.cross[id]).toBe(2);
  }
  expect(await rowIds(page, 'a')).toEqual(await rowIds(page, 'b'));
  expect(await rowIds(page, 'a')).toEqual(seedIds);
  await expect(page.getByRole('button', { name: 'Play the lake scene' })).toHaveCount(0);
  // the scripted labels clear on link restore
  await expect(page.locator('.bc-scripted')).toHaveCount(0);

  // R10.5: the tent returns as a resurrect twin with Keep and Delete.
  for (const id of ['a', 'b'] as const) {
    const c = card(page, id);
    await expect(c.locator('.limbo-twin-caption', { hasText: 'TWIN · Budi deleted this while Sari ticked it · rule: resurrect' })).toHaveCount(1);
    const tent = c.locator('[data-item="tent"]');
    await expect(tent.getByRole('button', { name: 'Keep' })).toBeVisible();
    await expect(tent.getByRole('button', { name: 'Delete' })).toBeVisible();
  }

  // R10.6: stove goes to Sari on both. B sees the loser twin, A the quiet note.
  await expect(row(page, 'a', 'stove')).toContainText('Sari is bringing it');
  await expect(row(page, 'b', 'stove')).toContainText('Sari is bringing it');
  await expect(B).toContainText('Your claim — Sari is bringing it');
  await expect(B).toContainText('claim-one: offline nobody can know who was first');
  await expect(B.getByRole('button', { name: 'OK' })).toBeVisible();
  await expect(A).toContainText("Budi's claim lost · rule: claim-one");
  await expect(A.getByRole('button', { name: 'OK' })).toHaveCount(0);

  // R10.11: Why Sari? opens B's Inspector and shows both claim stamps, equal l, different r.
  await B.getByRole('button', { name: 'Why Sari?' }).click();
  await expect(page.getByRole('dialog', { name: 'Limbo inspector' })).toBeVisible();
  const why = (await B.locator('[data-stamps]').textContent()) ?? '';
  const stamps = [...why.matchAll(/(\d+)·([^·\s]+)·(\d+)/g)].map((m) => ({ l: m[1], r: m[2] }));
  expect(stamps).toHaveLength(2);
  expect(stamps[0]!.l).toBe(stamps[1]!.l);
  expect(stamps[0]!.r).not.toBe(stamps[1]!.r);
  await page.getByRole('dialog', { name: 'Limbo inspector' }).getByRole('button', { name: 'Close' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);

  // R10.7: A taps Keep, B taps OK. Both converge, 0 twins, FIXED fires.
  await B.getByRole('button', { name: 'OK' }).click();
  await expect(A.getByText("Budi's claim lost")).toHaveCount(0);
  await A.getByRole('button', { name: 'Keep' }).click();
  await expect(A.locator('.limbo-twin')).toHaveCount(0);
  await expect(B.locator('.limbo-twin')).toHaveCount(0);
  await expect(A.locator('.limbo-fixed-text')).toHaveText('FIXED');
  await expect(B.locator('.limbo-fixed-text')).toHaveText('FIXED');
  await expect
    .poll(
      async () => {
        const [sa, sb, qa, qb] = await Promise.all([
          stateOf('a'),
          stateOf('b'),
          page.evaluate(() => (window as unknown as { limbo: Debug }).limbo.queued('a').length),
          page.evaluate(() => (window as unknown as { limbo: Debug }).limbo.queued('b').length),
        ]);
        return sa === sb && qa === 0 && qb === 0;
      },
      { timeout: 15_000 },
    )
    .toBe(true);
  const finalA = await stateOf('a');
  expect(JSON.parse(finalA)).toEqual(JSON.parse(await stateOf('b')));
  const fin = JSON.parse(finalA) as { items: Record<string, { life: string; ticked: boolean; winners: string[] }> };
  expect(fin.items['tent']).toMatchObject({ life: 'alive', ticked: true });
  expect(fin.items['stove']?.winners).toEqual(['sari']);
  await expect(A.locator('[data-fog]')).toHaveAttribute('data-fog', 'none');

  // R10.8: Inspector on A, newest exchange first, then the partition-era ops, then conflicts.
  await A.getByRole('button', { name: 'Inspector' }).click();
  const dlg = page.getByRole('dialog', { name: 'Limbo inspector' });
  await expect(dlg).toBeVisible();
  const exchanges = await dlg.getByRole('table', { name: /^Exchange/ }).evaluateAll((tables) =>
    tables.map((t) =>
      Array.from(t.querySelectorAll('tbody tr')).map((tr) => Array.from(tr.querySelectorAll('td')).map((td) => td.textContent ?? '')),
    ),
  );
  // columns: dir, op, target, merge, intent, stamp, deps (exchange tables carry a dir column)
  const flat = exchanges.flat();
  const names = flat.map((r) => r[1]);
  expect(names.slice(0, 2).sort()).toEqual(['item.release', 'item.restore']);
  expect(names.slice(2).sort()).toEqual(['item.claim', 'item.claim', 'item.delete', 'item.tick']);
  for (const r of flat) {
    expect(r[3]).toMatch(/^[a-z-]+$/);
    expect(r[5]).toMatch(/^\d+·(a|b)#1·\d+$/);
    expect(r[6]).not.toBe('');
  }
  const conflicts = await dlg.getByRole('region', { name: 'Conflicts' }).locator('li').allTextContents();
  expect(conflicts).toHaveLength(2);
  expect(conflicts.filter((t) => /\(rule: resurrect\) resolved$/.test(t))).toHaveLength(1);
  expect(conflicts.filter((t) => /\(rule: claim-one\) resolved$/.test(t))).toHaveLength(1);
  await dlg.getByRole('button', { name: 'Close' }).click();

  // R10.9: shuffle test prints its own count and the golden line.
  await page.getByRole('button', { name: 'Run shuffle test' }).click();
  const ranLine = page.getByText(/orderings → same state$/);
  await expect(ranLine).toBeVisible({ timeout: 60_000 });
  const m = /^([\d,]+) \/ ([\d,]+) orderings → same state$/.exec((await ranLine.textContent()) ?? '');
  expect(m).not.toBeNull();
  expect(m![1]).toBe(m![2]);
  expect(Number(m![1]!.replace(/,/g, ''))).toBeGreaterThan(0);
  await expect(page.getByText('matches the specified result ✓')).toBeVisible();

  await ctx.close();
});

// BASECAMP test (b), R14 and R15.3 to R15.6: two browser contexts, each a solo page over the dev relay.
// `context.setOffline` is the partition. Waits are on state, never on fixed sleeps, except the one bounded
// observation window that asserts nothing crosses while both are offline.

const RELAY = 'http://localhost:5175';

interface SoloDebug {
  ready: Promise<void>;
  state(): string;
  queued(): unknown[];
  tick(id: string, ticked?: boolean): unknown;
  delete(id: string): unknown;
  claim(id: string): unknown;
}
type SoloItem = { life: string; ticked: boolean; winners: string[]; losers: string[] };
const solo = (p: Page) => ({
  state: (): Promise<string> => p.evaluate(() => (window as unknown as { limbo: SoloDebug }).limbo.state()),
  queued: (): Promise<number> => p.evaluate(() => (window as unknown as { limbo: SoloDebug }).limbo.queued().length),
  items: async (): Promise<Record<string, SoloItem>> =>
    (JSON.parse(await p.evaluate(() => (window as unknown as { limbo: SoloDebug }).limbo.state())) as { items: Record<string, SoloItem> }).items,
});

test('two contexts through the dev relay: partition, reconnect, converge', async ({ browser, request }) => {
  await request.post(`${RELAY}/reset`);
  const ctxA = await browser.newContext();
  const ctxB = await browser.newContext();
  const pa = await ctxA.newPage();
  const pb = await ctxB.newPage();
  await pa.goto(`/?devrelay=${encodeURIComponent(RELAY)}&r=a`);
  await pb.goto(`/?devrelay=${encodeURIComponent(RELAY)}&r=b`);
  for (const p of [pa, pb]) await p.evaluate(() => (window as unknown as { limbo: SoloDebug }).limbo.ready);
  const A = solo(pa);
  const B = solo(pb);

  // Both live and equal before the cut.
  for (const p of [pa, pb]) await expect(p.locator('[data-status]')).toHaveText('Live', { timeout: 15_000 });
  await expect.poll(async () => (await A.state()) === (await B.state())).toBe(true);
  const seedA = await A.state();

  // Partition both contexts. The link reads down once a poll fails.
  await ctxA.setOffline(true);
  await ctxB.setOffline(true);
  for (const p of [pa, pb]) await expect(p.locator('[data-status]')).toHaveText(/Offline/, { timeout: 15_000 });

  // A ticks the tent and claims the stove; B deletes the tent and claims the stove.
  await pa.evaluate(() => {
    const l = (window as unknown as { limbo: SoloDebug }).limbo;
    l.tick('tent', true);
    l.claim('stove');
  });
  await pb.evaluate(() => {
    const l = (window as unknown as { limbo: SoloDebug }).limbo;
    l.delete('tent');
    l.claim('stove');
  });
  expect(await A.queued()).toBe(2);
  expect(await B.queued()).toBe(2);

  // Several poll periods (150 ms each) with the link cut: no edit crosses, the relay log stays empty.
  const midA = await A.state();
  const midB = await B.state();
  await pa.waitForTimeout(1_500);
  expect(await A.state()).toBe(midA);
  expect(await B.state()).toBe(midB);
  expect((await A.items())['tent']).toMatchObject({ life: 'alive', ticked: true });
  expect((await B.items())['tent']?.life).toBe('deleted');
  const relayLog = (await (await request.get(`${RELAY}/ops?since=0`)).json()) as { ops: { id: string }[] };
  expect(relayLog.ops.filter((o) => /^(a|b)#/.test(o.id))).toHaveLength(0);
  expect(midA).not.toBe(seedA);

  // Reconnect and wait on state, not on time.
  await ctxA.setOffline(false);
  await ctxB.setOffline(false);
  await expect
    .poll(async () => (await A.state()) === (await B.state()) && (await A.queued()) === 0 && (await B.queued()) === 0, {
      timeout: 20_000,
    })
    .toBe(true);
  for (const p of [pa, pb]) await expect(p.locator('[data-status]')).toContainText('Live', { timeout: 15_000 });

  // Canonical states deep-equal; tent is a twin on both; exactly one stove claimant.
  const fa = await A.state();
  expect(JSON.parse(fa)).toEqual(JSON.parse(await B.state()));
  for (const items of [await A.items(), await B.items()]) {
    expect(items['tent']?.life).toBe('twin');
    expect(items['stove']?.winners).toHaveLength(1);
    expect(items['stove']?.losers).toHaveLength(1);
  }

  await ctxA.close();
  await ctxB.close();
});
