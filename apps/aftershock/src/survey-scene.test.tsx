// R10 and R11 on the DOM: the survey scene over a real createPair with a manual scheduler
// (nothing moves until settle()). Fresh stores, so the ids are the ones the goldens name.
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { canonical } from '../../../skeleton/src/core/causal.ts';
import { runShuffle } from '../../../skeleton/src/limbo/shuffle.ts';
import type { ShuffleRunner } from '../../../skeleton/src/limbo/shuffle-test.tsx';
import { setMedia } from '../../../skeleton/src/limbo/test/setup.ts';
import { createPair, type Pair } from '../../../skeleton/src/sync/pair.ts';
import { openStore } from '../../../skeleton/src/sync/store.ts';
import * as actions from './actions.ts';
import { twinCount } from './conflicts.ts';
import { App } from './main.tsx';
import { materialize, type State } from './model.ts';
import { ops as defs } from './ops/registry.gen.ts';
import { goldens } from './scene.ts';
import { seedOps } from './seed.ts';

type Side = 'a' | 'b';
let pair: Pair<State> | undefined;
let n = 0;
const inline = (): ShuffleRunner => ({ run: async (input) => runShuffle(input, materialize), cancel() {} });

async function mount(): Promise<Pair<State>> {
  setMedia({ narrow: false });
  const tag = `survey${n++}`;
  const p = await createPair<State>({
    app: 'aftershock',
    defs,
    materialize,
    twinCount,
    seedOps,
    store: (name) => openStore(`${tag}:${name}`),
    schedule: () => undefined,
  });
  pair = p;
  await act(async () => {
    render(<App pair={p} createRunner={inline} sceneDelay={0} />);
  });
  return p;
}
afterEach(() => {
  cleanup();
  pair?.close();
  pair = undefined;
});

const card = (id: Side): HTMLElement => document.querySelector(`[data-replica="${id}"]`) as HTMLElement;
const text = (e: Element | null | undefined): string => e?.textContent ?? '';
const fogMode = (id: Side): string | null => card(id).querySelector('[data-fog]')!.getAttribute('data-fog');
const fogLabel = (id: Side): string => text(card(id).querySelector('.limbo-fog-label'));
const plate = (id: Side): string => text(card(id).querySelector('.limbo-plate'));
const chip = (id: Side): string => text(card(id).querySelector('.limbo-chip-text'));
const sectorCard = (id: Side): HTMLElement => card(id).querySelector('[data-card="C3"]') as HTMLElement;
const captions = (id: Side): string[] => Array.from(card(id).querySelectorAll('.limbo-twin-caption')).map((e) => text(e));
const click = (e: HTMLElement): Promise<void> => act(async () => void fireEvent.click(e));
const tick = (): Promise<void> => act(async () => void (await new Promise((r) => setTimeout(r, 0))));
const settle = (): Promise<void> => act(async () => pair!.settle());
const edit = (f: () => void): Promise<void> => act(async () => f());
const openC3 = (id: Side): Promise<void> => click(card(id).querySelector('[data-sector="C3"]') as HTMLElement);
const BUTTON = 'Play the survey scene';
const NOTE_A = 'cracked stairwell';
const NOTE_B = 'gas smell, east wall';

/** The R10.2 to R10.4 steps, shared by the manual run and the scripted run. */
async function partitionAndRestore(p: Pair<State>, scripted: boolean): Promise<void> {
  p.cut();
  await tick();
  if (scripted) {
    await click(screen.getByRole('button', { name: BUTTON }));
  } else {
    await edit(() => actions.reportSector(p.a, 'C3', 'damaged'));
    await edit(() => actions.reportSector(p.b, 'C3', 'unsafe'));
    await edit(() => actions.setCount(p.a, 'C3', 2));
    await edit(() => actions.setCount(p.b, 'C3', 3));
    await edit(() => actions.setNote(p.a, 'C3', NOTE_A));
    await edit(() => actions.setNote(p.b, 'C3', NOTE_B));
  }
  await openC3('a');
  await openC3('b');
}

describe('survey scene (R10) with manual edits', () => {
  it('walks R10.1 to R10.9 on the DOM', async () => {
    const p = await mount();
    expect(chip('a')).toBe('Live');
    expect(chip('b')).toBe('Live');

    // R10.1
    p.cut();
    await tick();
    for (const id of ['a', 'b'] as const) {
      expect(fogMode(id)).toBe('full');
      expect(fogLabel(id)).toBe('Offline');
      expect(chip(id)).toBe('Offline');
    }
    expect(screen.queryByRole('button', { name: BUTTON })).not.toBeNull();

    // R10.2: A and B open C3 and edit it; the card shows the local view only
    await openC3('a');
    await openC3('b');
    await edit(() => actions.reportSector(p.a, 'C3', 'damaged'));
    await edit(() => actions.setCount(p.a, 'C3', 2));
    await edit(() => actions.setNote(p.a, 'C3', NOTE_A));
    await edit(() => actions.reportSector(p.b, 'C3', 'unsafe'));
    await edit(() => actions.setCount(p.b, 'C3', 3));
    await edit(() => actions.setNote(p.b, 'C3', NOTE_B));
    for (const id of ['a', 'b'] as const) {
      const waiting = p.queued(id).length;
      expect(waiting).toBe(3);
      expect(plate(id)).toContain(`${waiting} WAITING`);
      expect(card(id).querySelectorAll('.limbo-wisp-row .wisp').length).toBe(waiting);
    }
    expect(text(sectorCard('a').querySelector('[data-severity-word]'))).toBe('DAMAGED');
    expect(text(sectorCard('a').querySelector('[data-total]'))).toBe('2 reported — Sari 2');
    expect(text(sectorCard('b').querySelector('[data-severity-word]'))).toBe('UNSAFE');
    expect(text(sectorCard('b').querySelector('[data-total]'))).toBe('3 reported — Budi 3');
    expect(sectorCard('a').querySelector('[data-instruction]')).toBeNull();

    // R10.3: haze before settle(), the same state after
    p.restore();
    for (let i = 0; i < 4; i++) await act(async () => void p.link.pump());
    for (const id of ['a', 'b'] as const) {
      expect(fogMode(id)).toBe('haze');
      expect(fogLabel(id)).toMatch(/^Syncing/);
    }
    await settle();
    expect(canonical(p.a.state())).toBe(canonical(p.b.state()));
    for (const id of ['a', 'b'] as const) expect(fogMode(id)).toBe('none');
    expect(screen.queryByRole('button', { name: BUTTON })).toBeNull();

    // R10.4
    for (const id of ['a', 'b'] as const) {
      const c = sectorCard(id);
      expect(text(c.querySelector('[data-severity-word]'))).toBe('UNSAFE');
      expect(text(c.querySelector('[data-total]'))).toBe('5 reported — Sari 2, Budi 3');
      expect(text(c.querySelector('[data-may-overlap]'))).toBe('may overlap');
      expect(captions(id)).toEqual([`TWIN · Sari wrote “${NOTE_A}” while Budi wrote “${NOTE_B}” · rule: causal-lww`]);
      expect(within(card(id)).getByRole('button', { name: `Keep this note: ${NOTE_A}` })).toBeTruthy();
      expect(within(card(id)).getByRole('button', { name: `Keep this note: ${NOTE_B}` })).toBeTruthy();
      expect(text(c.querySelector('[data-instruction]'))).toBe('C3 — do not enter');
    }

    // R10.5, R10.9: one tap, a pick-one note that covers both
    await click(within(card('a')).getByRole('button', { name: `Keep this note: ${NOTE_B}` }));
    await settle();
    expect(canonical(p.a.state())).toBe(canonical(p.b.state()));
    expect(twinCount(p.a.state())).toBe(0);
    expect(twinCount(p.b.state())).toBe(0);
    for (const id of ['a', 'b'] as const) {
      expect(card(id).querySelector('.limbo-twin')).toBeNull();
      expect(within(card(id)).queryByRole('button', { name: /^Keep this note/ })).toBeNull();
      expect(text(card(id).querySelector('.limbo-fixed-text'))).toBe('FIXED');
      expect(text(sectorCard(id).querySelector('[data-note]'))).toBe(NOTE_B);
    }
    expect(canonical(p.a.state())).toBe(goldens[1]!.state);
    const resolve = p.a.log().find((o) => o.id === 'a#1:4')!;
    expect(resolve.op).toBe('sector.note');
    const noteIds = p.a.log().filter((o) => o.op === 'sector.note' && o.target === 'C3' && o.id !== resolve.id).map((o) => o.id);
    for (const id of noteIds) expect(resolve.deps[id.split(':')[0]!]).toBeGreaterThanOrEqual(Number(id.split(':')[1]));

    // R10.6: Inspector on A, newest first
    await click(within(card('a')).getByRole('button', { name: 'Inspector' }));
    const tables = within(card('a')).getAllByRole('table', { name: /^Exchange/ });
    const rows = (t: HTMLElement): string[][] =>
      within(t)
        .getAllByRole('row')
        .slice(1)
        .map((r) => Array.from(r.querySelectorAll('td')).map((c) => text(c)));
    const all = tables.map((t) => rows(t));
    expect(all[0]!.map((r) => r[1])).toEqual(['sector.note']);
    expect(all[0]![0]![5]).toBe('22·a#1·4');
    const older = all.slice(1).flat();
    expect(older.map((r) => r[1]).sort()).toEqual([
      'sector.count', 'sector.count', 'sector.note', 'sector.note', 'sector.report', 'sector.report',
    ]);
    expect(older.map((r) => r[5]).sort()).toEqual(['19·a#1·1', '19·b#1·1', '20·a#1·2', '20·b#1·2', '21·a#1·3', '21·b#1·3']);
    for (const r of [...all[0]!, ...older]) {
      expect(r[3]).toMatch(/^[a-z-]+$/); // merge
      expect(r[5]).toMatch(/^\d+·(a|b)#1·\d+$/); // l·r·n
      expect(r[6]).not.toBe('');
    }
    const conflicts = within(card('a')).getByRole('region', { name: 'Conflicts' });
    const items = Array.from(conflicts.querySelectorAll('li')).map((li) => text(li));
    expect(items).toHaveLength(1);
    expect(items[0]).toMatch(/\(rule: causal-lww\) resolved$/);

    // R10.7: shuffle line and golden line
    await click(screen.getByRole('button', { name: 'Run shuffle test' }));
    await tick();
    expect(screen.getByText(/^[\d,]+ \/ [\d,]+ orderings → same state$/).textContent).toBe('1,000 / 1,000 orderings → same state');
    expect(screen.getByText('matches the specified result ✓')).toBeTruthy();
  });
});

describe('Play the survey scene (R11)', () => {
  it('shows only while the link is down, labels each scripted edit and gives the manual result', async () => {
    const p = await mount();
    expect(screen.queryByRole('button', { name: BUTTON })).toBeNull();
    p.cut();
    await tick();
    await click(screen.getByRole('button', { name: BUTTON }));
    expect(screen.queryByRole('button', { name: BUTTON })).toBeNull();
    expect(p.view('a').link).toBe('down');
    for (const id of ['a', 'b'] as const) expect(p.queued(id).length).toBe(3);
    expect(p.a.log().filter((o) => o.id.startsWith('a#')).map((o) => o.op)).toEqual(['sector.report', 'sector.count', 'sector.note']);
    expect(p.b.log().filter((o) => o.id.startsWith('b#')).map((o) => o.op)).toEqual(['sector.report', 'sector.count', 'sector.note']);

    await openC3('a');
    await openC3('b');
    for (const id of ['a', 'b'] as const) {
      const tags = Array.from(sectorCard(id).querySelectorAll('[data-scripted]')).map((t) => text(t));
      expect(tags).toEqual(['edited offline', 'edited offline', 'edited offline']);
    }

    // the tags clear on link up; the button restored nothing and tapped nothing
    p.restore();
    await settle();
    expect(card('a').querySelector('[data-scripted]')).toBeNull();
    expect(card('b').querySelector('[data-scripted]')).toBeNull();
    expect(twinCount(p.a.state())).toBe(1);
    await click(within(card('b')).getByRole('button', { name: `Keep this note: ${NOTE_B}` }));
    await settle();
    expect(twinCount(p.a.state())).toBe(0);
    expect(canonical(p.a.state())).toBe(canonical(p.b.state()));

    // the scene flag stays set, so the button does not return on a later cut
    p.cut();
    await tick();
    expect(screen.queryByRole('button', { name: BUTTON })).toBeNull();
  });

  it('gives the same end state as the manual run (before the resolve)', async () => {
    const p = await mount();
    await partitionAndRestore(p, true);
    p.restore();
    await settle();
    const scriptedState = canonical(p.a.state());
    expect(scriptedState).toBe(canonical(p.b.state()));
    expect(text(sectorCard('a').querySelector('[data-total]'))).toBe('5 reported — Sari 2, Budi 3');
  });

  it('Reset demo clears the flag', async () => {
    const p = await mount();
    p.cut();
    await tick();
    await click(screen.getByRole('button', { name: BUTTON }));
    await click(screen.getByRole('button', { name: 'Reset demo' }));
    expect(screen.queryByRole('button', { name: BUTTON })).not.toBeNull();
  });
});
