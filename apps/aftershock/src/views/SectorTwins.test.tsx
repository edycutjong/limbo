import { act, cleanup, fireEvent, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { canonical } from '../../../../skeleton/src/core/causal.ts';
import type { Pair } from '../../../../skeleton/src/sync/pair.ts';
import * as actions from '../actions.ts';
import { boot } from '../main.tsx';
import type { State } from '../model.ts';

let pair: Pair<State> | undefined;
let el: HTMLElement | undefined;

type Side = 'a' | 'b';
const card = (id: Side): HTMLElement => document.querySelector(`[data-replica="${id}"]`) as HTMLElement;
const click = (e: HTMLElement): Promise<void> => act(async () => void fireEvent.click(e));
const settle = (): Promise<void> => act(async () => pair!.settle());
const caption = (id: Side): string | undefined => card(id).querySelector('.limbo-twin-caption')?.textContent ?? undefined;
const buttons = (id: Side): string[] =>
  Array.from(card(id).querySelectorAll('.limbo-twin-actions button')).map((b) => b.getAttribute('aria-label') ?? '');

async function mount(): Promise<Pair<State>> {
  el = document.createElement('div');
  document.body.append(el);
  await act(async () => {
    pair = await boot(el!, { reload: () => undefined }).ready;
  });
  for (const id of ['a', 'b'] as const) await click(card(id).querySelector<HTMLElement>('[data-sector="C3"]')!);
  return pair!;
}

async function partition(p: Pair<State>, edits: () => void): Promise<void> {
  p.cut();
  await act(async () => edits());
  p.restore();
  await settle();
}

afterEach(async () => {
  cleanup();
  pair?.close();
  pair = undefined;
  el?.remove();
  sessionStorage.clear();
  await Promise.all(
    (await indexedDB.databases())
      .map((d) => d.name!)
      .filter((n) => n.startsWith('limbo:aftershock:'))
      .map(
        (n) =>
          new Promise<void>((res) => {
            const r = indexedDB.deleteDatabase(n);
            r.onsuccess = r.onerror = r.onblocked = () => res();
          }),
      ),
  );
});

const noteTwin = (p: Pair<State>): Promise<void> =>
  partition(p, () => {
    actions.setNote(p.a, 'C3', 'cracked stairwell');
    actions.setNote(p.b, 'C3', 'gas smell, east wall');
  });

const gone = (id: Side): void => {
  expect(card(id).querySelector('.limbo-twin')).toBeNull();
  expect(card(id).querySelector('.limbo-twin-ghost')).toBeNull();
  expect(card(id).querySelector('.limbo-twin-caption')).toBeNull();
  expect(card(id).querySelector('.limbo-twin-actions')).toBeNull();
};

describe('note twin', () => {
  it('shows the caption and one Keep this note button per note on both replicas', async () => {
    const p = await mount();
    await noteTwin(p);
    for (const id of ['a', 'b'] as const) {
      expect(caption(id)).toBe('TWIN · Sari wrote “cracked stairwell” while Budi wrote “gas smell, east wall” · rule: causal-lww');
      expect(buttons(id)).toEqual(['Keep this note: cracked stairwell', 'Keep this note: gas smell, east wall']);
      expect(card(id).querySelector('.limbo-twin-ghost')!.getAttribute('aria-hidden')).toBe('true');
    }
  });

  it('a tap clears the twin on both and leaves one note', async () => {
    const p = await mount();
    await noteTwin(p);
    await click(within(card('a')).getByRole('button', { name: 'Keep this note: gas smell, east wall' }));
    await settle();
    for (const id of ['a', 'b'] as const) {
      gone(id);
      expect(card(id).querySelector('[data-note]')!.textContent).toBe('gas smell, east wall');
    }
    expect(canonical(p.a.state())).toBe(canonical(p.b.state()));
    expect(p.a.state().sectors.C3!.noteValues).toEqual([]);
  });
});

describe('count twin', () => {
  const countTwin = (p: Pair<State>): Promise<void> =>
    partition(p, () => {
      actions.pickCount(p.a, 'C3', 'sari', 2);
      actions.pickCount(p.b, 'C3', 'sari', 3);
    });

  it('shows Keep this count buttons and the pick clears it on both', async () => {
    const p = await mount();
    await countTwin(p);
    for (const id of ['a', 'b'] as const) {
      expect(caption(id)).toContain('rule: causal-lww');
      expect(buttons(id)).toEqual(['Keep this count: 2', 'Keep this count: 3']);
      expect(card(id).querySelector('.limbo-twin-ghost')!.getAttribute('aria-hidden')).toBe('true');
    }
    await click(within(card('b')).getByRole('button', { name: 'Keep this count: 2' }));
    await settle();
    for (const id of ['a', 'b'] as const) {
      gone(id);
      expect(card(id).querySelector('[data-total]')!.textContent).toBe('2 reported — Sari 2');
    }
  });
});
