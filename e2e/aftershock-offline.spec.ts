import { expect, test, type Browser, type Locator, type Page } from '@playwright/test';

// AFTERSHOCK test (a), R10, R11, R15.1, R15.2, R15.4, R15.5: the survey scene in one page, pair view.
// A fresh browser context gives empty databases. Counts are read from the page, never from constants here
// (the expected values of the scene itself, such as "5 reported", are the specified result).

type Side = 'a' | 'b';

const card = (p: Page, id: Side): Locator => p.locator(`[data-replica="${id}"]`);
const sector = (p: Page, id: Side): Locator => card(p, id).locator('[data-card="C3"]');
interface Debug {
  ready: Promise<void>;
  state(id: Side): string;
  queued(id: Side): unknown[];
}
const num = async (l: Locator): Promise<number> => Number(((await l.textContent()) ?? '').replace(/\D/g, ''));
const NOTE_A = 'cracked stairwell';
const NOTE_B = 'gas smell, east wall';
const BUTTON = 'Play the survey scene';

/** Record every fog label each card has shown. Transient states are otherwise missed. */
async function watch(p: Page): Promise<void> {
  await p.evaluate(() => {
    const seen = { a: new Set<string>(), b: new Set<string>() };
    (window as unknown as { __asSeen: typeof seen }).__asSeen = seen;
    const scan = (): void => {
      for (const id of ['a', 'b'] as const) {
        const lab = document.querySelector(`[data-replica="${id}"] .limbo-fog-label`)?.textContent;
        if (lab) seen[id].add(lab);
      }
    };
    new MutationObserver(scan).observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true });
    scan();
  });
}

async function open(browser: Browser): Promise<{ page: Page; close(): Promise<void> }> {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 2000 } });
  const page = await ctx.newPage();
  await page.goto('/');
  await page.evaluate(() => (window as unknown as { limbo: Debug }).limbo.ready);
  return { page, close: () => ctx.close() };
}

const openC3 = (p: Page, id: Side): Promise<void> => card(p, id).locator('[data-sector="C3"]').click();

/** One surveyor's edit through the form: severity, count, note, Save. */
async function report(p: Page, id: Side, severity: string, count: number, note: string): Promise<void> {
  await openC3(p, id);
  const form = card(p, id).locator('[data-form="C3"]');
  await form.getByRole('radio', { name: severity }).click();
  await form.locator('input[type="number"]').fill(String(count));
  await form.locator('textarea').fill(note);
  await form.getByRole('button', { name: 'Save' }).click();
}

async function surveyScene(p: Page, scripted: boolean): Promise<void> {
  const stateOf = (id: Side): Promise<string> => p.evaluate((i) => (window as unknown as { limbo: Debug }).limbo.state(i), id);
  const queued = (id: Side): Promise<number> => p.evaluate((i) => (window as unknown as { limbo: Debug }).limbo.queued(i).length, id);
  const A = card(p, 'a');
  const B = card(p, 'b');

  // Tagline, chip, one h1.
  await expect(p.locator('main h1')).toHaveCount(1);
  await expect(p.getByText('For small teams who fill the same form when the signal is gone.')).toBeVisible();
  const chip = p.locator('[role="note"]', { hasText: 'DEMO DATA' });
  await expect(chip).toContainText('DEMO DATA');
  await expect(chip).toContainText('Demonstration data shape — not used in the field');

  // R10.1: both live, no button; cut the link.
  await expect(A.locator('.limbo-chip-text')).toHaveText('Live');
  await expect(B.locator('.limbo-chip-text')).toHaveText('Live');
  await expect(p.getByRole('button', { name: BUTTON })).toHaveCount(0);
  await p.getByRole('button', { name: 'Cut link' }).click();
  for (const id of ['a', 'b'] as const) {
    await expect(card(p, id).locator('[data-fog]')).toHaveAttribute('data-fog', 'full');
    await expect(card(p, id).locator('.limbo-fog-label')).toHaveText('Offline');
    await expect(card(p, id).locator('.limbo-chip-text')).toHaveText('Offline');
  }

  // R10.2 / R11: the partition edits, by hand or by the button.
  if (scripted) {
    await p.getByRole('button', { name: BUTTON }).click();
    await expect(p.getByRole('button', { name: BUTTON })).toHaveCount(0);
    for (const id of ['a', 'b'] as const) await expect(card(p, id).locator('.limbo-plate')).toContainText('3 WAITING', { timeout: 10_000 });
    await openC3(p, 'a');
    await openC3(p, 'b');
    for (const id of ['a', 'b'] as const) {
      await expect(sector(p, id).locator('[data-scripted]')).toHaveText(['scripted edit', 'scripted edit', 'scripted edit']);
    }
  } else {
    await report(p, 'a', 'Damaged', 2, NOTE_A);
    await report(p, 'b', 'Unsafe', 3, NOTE_B);
    for (const id of ['a', 'b'] as const) await expect(sector(p, id).locator('[data-scripted]')).toHaveCount(0);
  }
  for (const id of ['a', 'b'] as const) {
    const q = await queued(id);
    await expect.poll(() => num(card(p, id).locator('.wisp-count'))).toBe(q);
    expect(q).toBe(3);
  }
  // The local views.
  await expect(sector(p, 'a').locator('[data-severity-word]')).toHaveText('DAMAGED');
  await expect(sector(p, 'a').locator('[data-total]')).toHaveText('2 reported — Sari 2');
  await expect(sector(p, 'b').locator('[data-severity-word]')).toHaveText('UNSAFE');
  await expect(sector(p, 'b').locator('[data-total]')).toHaveText('3 reported — Budi 3');
  expect(await stateOf('a')).not.toBe(await stateOf('b'));

  // R10.3: restore; the haze reads "Syncing".
  await watch(p);
  await p.getByRole('button', { name: 'Restore link' }).click();
  await expect.poll(async () => (await stateOf('a')) === (await stateOf('b')), { timeout: 15_000 }).toBe(true);
  for (const id of ['a', 'b'] as const) {
    await expect(card(p, id).locator('[data-fog]')).toHaveAttribute('data-fog', 'none', { timeout: 15_000 });
  }
  const seen = await p.evaluate(() => {
    const w = (window as unknown as { __asSeen: { a: Set<string>; b: Set<string> } }).__asSeen;
    return { a: [...w.a], b: [...w.b] };
  });
  for (const id of ['a', 'b'] as const) expect(seen[id].some((l) => /^Syncing/.test(l))).toBe(true);
  await expect(p.getByRole('button', { name: BUTTON })).toHaveCount(0);
  if (scripted) await expect(p.locator('[data-scripted]')).toHaveCount(0);

  // R10.4: converged, UNSAFE, 5 reported, may overlap, the note twin, the instruction.
  for (const id of ['a', 'b'] as const) {
    const c = sector(p, id);
    await expect(c.locator('[data-severity-word]')).toHaveText('UNSAFE');
    await expect(c.locator('[data-total]')).toHaveText('5 reported — Sari 2, Budi 3');
    await expect(c.locator('[data-may-overlap]')).toHaveText('may overlap');
    await expect(card(p, id).locator('.limbo-twin-caption')).toHaveText([
      `TWIN · Sari wrote “${NOTE_A}” while Budi wrote “${NOTE_B}” · rule: causal-lww`,
    ]);
    await expect(card(p, id).getByRole('button', { name: `Keep this note: ${NOTE_A}` })).toHaveCount(1);
    await expect(card(p, id).getByRole('button', { name: `Keep this note: ${NOTE_B}` })).toHaveCount(1);
    await expect(c.locator('[data-instruction]')).toHaveText('C3 — do not enter');
  }

  // R10.5: one tap on A resolves both.
  await A.getByRole('button', { name: `Keep this note: ${NOTE_B}` }).click();
  await expect(p.locator('.limbo-twin')).toHaveCount(0, { timeout: 15_000 });
  await expect
    .poll(async () => (await stateOf('a')) === (await stateOf('b')) && (await queued('a')) === 0 && (await queued('b')) === 0, { timeout: 15_000 })
    .toBe(true);
  const fa = await stateOf('a');
  expect(JSON.parse(fa)).toEqual(JSON.parse(await stateOf('b')));
  for (const id of ['a', 'b'] as const) {
    await expect(card(p, id).locator('.limbo-fixed-text')).toHaveText('FIXED');
    await expect(sector(p, id).locator('[data-note]')).toHaveText(NOTE_B);
    await expect(card(p, id).locator('[data-fog]')).toHaveAttribute('data-fog', 'none');
  }

  // R10.6: Inspector on A, newest first, with merge, l·r·n, deps; the resolved twin with its rule.
  await A.getByRole('button', { name: 'Inspector' }).click();
  const tables = A.getByRole('table', { name: /^Exchange/ });
  await expect(tables.first()).toBeVisible();
  const grouped = await tables.evaluateAll((ts) =>
    ts.map((t) => Array.from(t.querySelectorAll('tbody tr')).map((tr) => Array.from(tr.querySelectorAll('td')).map((td) => td.textContent ?? ''))),
  );
  // columns: dir, op, target, merge, intent, stamp, deps
  expect(grouped[0]!.map((r) => r[1])).toEqual(['sector.note']);
  expect(grouped[0]![0]![5]).toBe('22·a#1·4');
  const older = grouped.slice(1).flat();
  expect(older.map((r) => r[1]).sort()).toEqual([
    'sector.count', 'sector.count', 'sector.note', 'sector.note', 'sector.report', 'sector.report',
  ]);
  for (const r of [...grouped[0]!, ...older]) {
    expect(r[3]).toMatch(/^[a-z-]+$/);
    expect(r[5]).toMatch(/^\d+·(a|b)#1·\d+$/);
    expect(r[6]).not.toBe('');
  }
  const conflicts = await A.getByRole('region', { name: 'Conflicts' }).locator('li').allTextContents();
  expect(conflicts).toHaveLength(1);
  expect(conflicts[0]).toMatch(/\(rule: causal-lww\) resolved$/);

  // R10.7: shuffle line with its own count, then the golden line.
  await p.getByRole('button', { name: 'Run shuffle test' }).click();
  const ran = p.getByText(/orderings → same state$/);
  await expect(ran).toBeVisible({ timeout: 60_000 });
  const m = /^([\d,]+) \/ ([\d,]+) orderings → same state$/.exec((await ran.textContent()) ?? '');
  expect(m).not.toBeNull();
  expect(m![1]).toBe(m![2]);
  expect(Number(m![1]!.replace(/,/g, ''))).toBeGreaterThan(0);
  await expect(p.getByText('matches the specified result ✓')).toBeVisible();
}

test('survey scene in one page: manual edits', async ({ browser }) => {
  const { page, close } = await open(browser);
  await surveyScene(page, false);
  await close();
});

test('survey scene in one page: Play the survey scene', async ({ browser }) => {
  const { page, close } = await open(browser);
  await surveyScene(page, true);
  await close();
});

// AFTERSHOCK test (b), R14 and R15.3 to R15.5: two browser contexts, each a solo page over the dev relay.
// `context.setOffline` is the partition. Waits are on state, never on fixed sleeps, except the one bounded
// observation window that asserts nothing crosses while both are offline.

const RELAY = 'http://localhost:5175';

interface SoloDebug {
  ready: Promise<void>;
  state(): string;
  queued(): unknown[];
  report(sector: string, severity: string): unknown;
  count(sector: string, n: number): unknown;
}
type SoloSector = { severity?: string; total: number; counts: { who: string; value: number }[] };
const solo = (p: Page) => ({
  state: (): Promise<string> => p.evaluate(() => (window as unknown as { limbo: SoloDebug }).limbo.state()),
  queued: (): Promise<number> => p.evaluate(() => (window as unknown as { limbo: SoloDebug }).limbo.queued().length),
  sectors: async (): Promise<Record<string, SoloSector>> =>
    (JSON.parse(await p.evaluate(() => (window as unknown as { limbo: SoloDebug }).limbo.state())) as { sectors: Record<string, SoloSector> }).sectors,
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

  // A reports C3 damaged and counts 2; B reports C3 unsafe and counts 3.
  await pa.evaluate(() => {
    const l = (window as unknown as { limbo: SoloDebug }).limbo;
    l.report('C3', 'damaged');
    l.count('C3', 2);
  });
  await pb.evaluate(() => {
    const l = (window as unknown as { limbo: SoloDebug }).limbo;
    l.report('C3', 'unsafe');
    l.count('C3', 3);
  });
  expect(await A.queued()).toBe(2);
  expect(await B.queued()).toBe(2);

  // Several poll periods with the link cut: no edit crosses, the relay log holds none of the new ops.
  const midA = await A.state();
  const midB = await B.state();
  await pa.waitForTimeout(1_500);
  expect(await A.state()).toBe(midA);
  expect(await B.state()).toBe(midB);
  expect((await A.sectors())['C3']?.severity).toBe('damaged');
  expect((await B.sectors())['C3']?.severity).toBe('unsafe');
  const relayLog = (await (await request.get(`${RELAY}/ops?since=0`)).json()) as { ops: { id: string }[] };
  expect(relayLog.ops.filter((o) => /^(a|b)[#:]/.test(o.id))).toHaveLength(0);
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

  // Canonical states deep-equal; C3 unsafe on both; both counts present.
  expect(JSON.parse(await A.state())).toEqual(JSON.parse(await B.state()));
  for (const sectors of [await A.sectors(), await B.sectors()]) {
    const c3 = sectors['C3']!;
    expect(c3.severity).toBe('unsafe');
    expect(c3.counts).toEqual(expect.arrayContaining([{ who: 'sari', value: 2 }, { who: 'budi', value: 3 }].map((c) => expect.objectContaining(c))));
  }
  await ctxA.close();
  await ctxB.close();
});
