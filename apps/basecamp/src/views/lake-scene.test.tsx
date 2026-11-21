// R10 and R11 on the DOM: the lake scene over a real createPair with a manual scheduler (nothing moves until settle()).
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { canonical } from '../../../../skeleton/src/core/causal.ts';
import { runShuffle } from '../../../../skeleton/src/limbo/shuffle.ts';
import type { ShuffleRunner } from '../../../../skeleton/src/limbo/shuffle-test.tsx';
import { createPair, type Pair } from '../../../../skeleton/src/sync/pair.ts';
import { openStore } from '../../../../skeleton/src/sync/store.ts';
import * as actions from '../actions.ts';
import { twinCount, describeConflicts } from '../conflicts.ts';
import { App } from '../main.tsx';
import { materialize, type State } from '../model.ts';
import { ops as defs } from '../ops/registry.gen.ts';
import { goldens } from '../scene.ts';
import { seedOps } from '../seed.ts';

type Side = 'a' | 'b';
let pair: Pair<State> | undefined;
let n = 0;
const inline = (): ShuffleRunner => ({ run: async (input) => runShuffle(input, materialize), cancel() {} });

async function mount(): Promise<Pair<State>> {
  const tag = `lake${n++}`;
  const p = await createPair<State>({
    app: 'basecamp',
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
const fogLabel = (id: Side): string => text(card(id).querySelector('.limbo-fog-label'));
const plate = (id: Side): string => text(card(id).querySelector('.limbo-plate'));
const chip = (id: Side): string => text(card(id).querySelector('.limbo-chip-text'));
const rowIds = (id: Side): string[] => Array.from(card(id).querySelectorAll('[data-item]')).map((r) => (r as HTMLElement).dataset.item!);
const rowNames = (id: Side): string[] => Array.from(card(id).querySelectorAll('[data-name]')).map((e) => text(e));
const row = (id: Side, item: string): HTMLElement => card(id).querySelector(`[data-item="${item}"]`) as HTMLElement;
const captions = (id: Side): string[] => Array.from(card(id).querySelectorAll('.limbo-twin-caption')).map((e) => text(e));
const click = (e: HTMLElement): Promise<void> => act(async () => void fireEvent.click(e));
const tick = (): Promise<void> => act(async () => void (await new Promise((r) => setTimeout(r, 0))));
const settle = (): Promise<void> => act(async () => pair!.settle());
const edit = (f: () => void): Promise<void> => act(async () => f());

async function resolveBoth(p: Pair<State>): Promise<void> {
  // B's release reaches A before A taps Keep. The exchange stays open (acks still queued), so both
  // resolves land in one Inspector exchange on A, and A's own Keep is the last change it sees.
  await click(within(card('b')).getByRole('button', { name: 'OK' }));
  await act(async () => void p.link.pump());
  await click(within(card('a')).getByRole('button', { name: 'Keep' }));
  await settle();
}

describe('lake scene (R10) with manual edits', () => {
  it('walks R10.1 to R10.9 on the DOM', async () => {
    const p = await mount();
    const seedIds = rowIds('a');
    expect(rowIds('b')).toEqual(seedIds);
    expect(chip('a')).toBe('Live');

    // R10.1
    p.cut();
    await tick();
    for (const id of ['a', 'b'] as const) {
      expect(card(id).querySelector('[data-fog]')!.getAttribute('data-fog')).toBe('full');
      expect(fogLabel(id)).toBe('Offline');
      expect(chip(id)).toBe('Offline');
    }
    expect(screen.queryByRole('button', { name: 'Play the lake scene' })).not.toBeNull();

    // R10.2
    await edit(() => actions.tickItem(p.a, 'tent', true));
    await edit(() => actions.deleteItem(p.b, 'tent'));
    expect(plate('a')).toContain('1 WAITING');
    expect(plate('b')).toContain('1 WAITING');
    expect(rowIds('a')).toContain('tent');
    expect(rowIds('b')).not.toContain('tent');

    // R10.3
    await edit(() => actions.claimItem(p.a, 'stove'));
    await edit(() => actions.claimItem(p.b, 'stove'));
    for (const id of ['a', 'b'] as const) {
      expect(plate(id)).toContain('2 WAITING');
      expect(text(row(id, 'stove'))).toContain('Yours? waiting');
    }

    // R10.4: haze before settle(), the same list after
    p.restore();
    // Hello and ops cross (four deliveries); the acks are still queued, so both sides are unacked 2.
    for (let i = 0; i < 4; i++) await act(async () => void p.link.pump());
    for (const id of ['a', 'b'] as const) {
      expect(card(id).querySelector('[data-fog]')!.getAttribute('data-fog')).toBe('haze');
      expect(fogLabel(id)).toBe('Syncing 2…');
    }
    await settle();
    expect(rowIds('a')).toEqual(rowIds('b'));
    expect(rowNames('a')).toEqual(rowNames('b'));
    expect(rowIds('a')).toEqual(seedIds);
    for (const id of ['a', 'b'] as const) expect(card(id).querySelector('[data-fog]')!.getAttribute('data-fog')).toBe('none');
    expect(screen.queryByRole('button', { name: 'Play the lake scene' })).toBeNull();

    // R10.5
    for (const id of ['a', 'b'] as const) {
      expect(captions(id)).toContain('TWIN · Budi deleted this while Sari ticked it · rule: resurrect');
      const names = Array.from(card(id).querySelectorAll('.limbo-twin-actions button')).map((b) => text(b));
      expect(names).toContain('Keep');
      expect(names).toContain('Delete');
    }

    // R10.6
    for (const id of ['a', 'b'] as const) expect(text(row(id, 'stove'))).toContain('Sari is bringing it');
    expect(text(card('b'))).toContain('Your claim — Sari is bringing it');
    expect(text(card('b'))).toContain('claim-one: offline nobody can know who was first');
    expect(text(card('a'))).toContain("Budi's claim lost · rule: claim-one");
    expect(within(card('b')).queryByRole('button', { name: 'OK' })).not.toBeNull();
    expect(within(card('a')).queryByRole('button', { name: 'OK' })).toBeNull();

    // R10.7
    await resolveBoth(p);
    expect(canonical(p.a.state())).toBe(canonical(p.b.state()));
    expect(twinCount(p.a.state())).toBe(0);
    expect(twinCount(p.b.state())).toBe(0);
    expect(card('a').querySelector('.limbo-twin')).toBeNull();
    expect(card('b').querySelector('.limbo-twin')).toBeNull();
    for (const id of ['a', 'b'] as const) expect(text(card(id).querySelector('.limbo-fixed-text'))).toBe('FIXED');
    expect(canonical(p.a.state())).toBe(goldens[1]!.state);

    // R10.8
    await click(within(card('a')).getByRole('button', { name: 'Inspector' }));
    const tables = within(card('a')).getAllByRole('table', { name: /^Exchange/ });
    const rows = (t: HTMLElement): string[][] =>
      within(t)
        .getAllByRole('row')
        .slice(1)
        .map((r) => Array.from(r.querySelectorAll('td')).map((c) => text(c)));
    const [newest, older] = [rows(tables[0]!), rows(tables[1]!)];
    expect(newest.map((r) => r[1]).sort()).toEqual(['item.release', 'item.restore']);
    expect(older.map((r) => r[1]).sort()).toEqual(['item.claim', 'item.claim', 'item.delete', 'item.tick']);
    for (const r of [...newest, ...older]) {
      expect(r[3]).toMatch(/^[a-z-]+$/); // merge
      expect(r[5]).toMatch(/^\d+·(a|b)#1·\d+$/); // l·r·n
      expect(r[6]).not.toBe('');
    }
    expect(older.map((r) => r[5]).sort()).toEqual(['16·a#1·1', '16·b#1·1', '17·a#1·2', '17·b#1·2']);
    const conflicts = within(card('a')).getByRole('region', { name: 'Conflicts' });
    const items = Array.from(conflicts.querySelectorAll('li')).map((li) => text(li));
    // A lists both resolved twins: the tent (its own Keep) and the stove claim (B's OK, incoming).
    expect(items).toHaveLength(2);
    expect(items.some((i) => /\(rule: resurrect\) resolved$/.test(i))).toBe(true);
    expect(items.some((i) => /\(rule: claim-one\) resolved$/.test(i))).toBe(true);

    // R10.9
    await click(screen.getByRole('button', { name: 'Run shuffle test' }));
    await tick();
    expect(screen.getByText('1,000 / 1,000 orderings → same state')).toBeTruthy();
    expect(screen.getByText('matches the specified result ✓')).toBeTruthy();
  });
});

describe('Play the lake scene (R11)', () => {
  it('shows only while the link is down, labels each scripted edit and gives the manual result', async () => {
    const p = await mount();
    expect(screen.queryByRole('button', { name: 'Play the lake scene' })).toBeNull();
    p.cut();
    await tick();
    await click(screen.getByRole('button', { name: 'Play the lake scene' }));
    expect(screen.queryByRole('button', { name: 'Play the lake scene' })).toBeNull();

    // one scripted edit tag per changed row, and the button restores nothing and resolves nothing
    expect(within(row('a', 'tent')).queryByText('scripted edit')).not.toBeNull();
    expect(within(row('a', 'stove')).queryByText('scripted edit')).not.toBeNull();
    expect(within(row('b', 'stove')).queryByText('scripted edit')).not.toBeNull();
    expect(rowIds('b')).not.toContain('tent');
    expect(p.view('a').link).toBe('down');
    for (const id of ['a', 'b'] as const) expect(plate(id)).toContain('2 WAITING');
    expect(p.a.log().filter((o) => o.id.startsWith('a#')).map((o) => o.op)).toEqual(['item.tick', 'item.claim']);
    expect(p.b.log().filter((o) => o.id.startsWith('b#')).map((o) => o.op)).toEqual(['item.delete', 'item.claim']);

    // the tags clear on link up
    p.restore();
    await settle();
    expect(card('a').querySelector('.bc-scripted')).toBeNull();
    expect(card('b').querySelector('.bc-scripted')).toBeNull();

    await resolveBoth(p);
    expect(canonical(p.a.state())).toBe(canonical(p.b.state()));
    expect(canonical(p.a.state())).toBe(goldens[1]!.state);
    expect(twinCount(p.a.state())).toBe(0);

    // the scene flag stays set, so the button does not return on a later cut
    p.cut();
    await tick();
    expect(screen.queryByRole('button', { name: 'Play the lake scene' })).toBeNull();
  });

  it('Reset demo clears the flag', async () => {
    const p = await mount();
    p.cut();
    await tick();
    await click(screen.getByRole('button', { name: 'Play the lake scene' }));
    await click(screen.getByRole('button', { name: 'Reset demo' }));
    expect(screen.queryByRole('button', { name: 'Play the lake scene' })).not.toBeNull();
  });
});
