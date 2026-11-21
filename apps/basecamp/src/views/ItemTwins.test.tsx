import { act, cleanup, fireEvent, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import type { Pair } from '../../../../skeleton/src/sync/pair.ts';
import * as actions from '../actions.ts';
import { boot } from '../main.tsx';
import type { State } from '../model.ts';

let pair: Pair<State> | undefined;
let el: HTMLElement | undefined;

async function mount(): Promise<Pair<State>> {
  el = document.createElement('div');
  document.body.append(el);
  await act(async () => {
    pair = await boot(el!, { reload: () => undefined }).ready;
  });
  return pair!;
}
type Side = 'a' | 'b';
const card = (id: Side): HTMLElement => document.querySelector(`[data-replica="${id}"]`) as HTMLElement;
const click = (e: HTMLElement): Promise<void> => act(async () => void fireEvent.click(e));
const settle = (): Promise<void> => act(async () => pair!.settle());
const caption = (id: Side): string | undefined => card(id).querySelector('.limbo-twin-caption')?.textContent ?? undefined;
const btn = (id: Side, name: string): HTMLElement => within(card(id)).getByRole('button', { name });
const names = (id: Side): string[] =>
  Array.from(card(id).querySelectorAll('.limbo-twin-actions button')).map((b) => b.textContent ?? '');
const noTwin = (id: Side): void => {
  expect(card(id).querySelector('.limbo-twin')).toBeNull();
  expect(card(id).querySelector('.limbo-twin-ghost')).toBeNull();
};

/** Cut, run the edits offline, restore and settle. */
async function partition(p: Pair<State>, edits: () => void): Promise<void> {
  p.cut();
  await act(async () => edits());
  p.restore();
  await settle();
}
const tentTwin = (p: Pair<State>): Promise<void> =>
  partition(p, () => {
    actions.tickItem(p.a, 'tent', true);
    actions.deleteItem(p.b, 'tent');
  });
const stoveTwin = (p: Pair<State>): Promise<void> =>
  partition(p, () => {
    actions.claimItem(p.a, 'stove');
    actions.claimItem(p.b, 'stove');
  });

afterEach(async () => {
  cleanup();
  pair?.close();
  pair = undefined;
  el?.remove();
  await Promise.all(
    ['a', 'b'].map(
      (id) =>
        new Promise<void>((res) => {
          const r = indexedDB.deleteDatabase(`limbo:basecamp:${id}`);
          r.onsuccess = r.onerror = r.onblocked = () => res();
        }),
    ),
  );
});

describe('life twin', () => {
  it('shows the caption with Keep and Delete on both replicas', async () => {
    const p = await mount();
    await tentTwin(p);
    for (const id of ['a', 'b'] as const) {
      expect(caption(id)).toBe('TWIN · Budi deleted this while Sari ticked it · rule: resurrect');
      expect(names(id)).toEqual(['Keep', 'Delete']);
    }
  });

  it('Keep clears it on both and the tent stays', async () => {
    const p = await mount();
    await tentTwin(p);
    await click(btn('a', 'Keep'));
    await settle();
    for (const id of ['a', 'b'] as const) {
      noTwin(id);
      expect(p[id].state().items.tent!.life).toBe('alive');
      expect(card(id).querySelector('[data-item="tent"] [data-name]')).not.toBeNull();
    }
  });

  it('Delete clears it on both and the tent is gone', async () => {
    const p = await mount();
    await tentTwin(p);
    await click(btn('b', 'Delete'));
    await settle();
    for (const id of ['a', 'b'] as const) {
      noTwin(id);
      expect(p[id].state().order).not.toContain('tent');
      expect(card(id).querySelector('[data-item="tent"]')).toBeNull();
    }
  });
});

describe('claim loser twin', () => {
  it('loser caption on B, quiet note on A; OK clears both', async () => {
    const p = await mount();
    await stoveTwin(p);
    expect(caption('b')).toContain('rule: claim-one');
    expect(card('b').querySelector('.limbo-twin-ghost')!.textContent).toBe('Your claim — Sari is bringing it');
    expect(names('b')).toEqual(['OK', 'Why Sari?']);
    expect(card('a').querySelector('.limbo-twin')).toBeNull();
    const note = card('a').querySelector('[data-note="stove"]')!;
    expect(note.textContent).toBe("Budi's claim lost · rule: claim-one");
    expect(note.querySelector('button')).toBeNull();

    await click(btn('b', 'OK'));
    await settle();
    noTwin('a');
    noTwin('b');
    expect(card('a').querySelector('[data-note]')).toBeNull();
    expect(card('b').querySelector('[data-note]')).toBeNull();
    expect(p.a.state().items.stove!.losers).toEqual([]);
    expect(p.b.state().items.stove!.winners).toEqual(['sari']);
  });

  it('Why Sari? opens the Inspector and prints both stamps', async () => {
    const p = await mount();
    await stoveTwin(p);
    const { winners, losers } = p.b.state().items.stove!.claims;
    const stamp = (s: { l: number; r: string; n: number }): string => `${s.l}·${s.r}·${s.n}`;
    expect(winners[0]!.stamp.l).toBe(losers[0]!.stamp.l);
    expect(winners[0]!.stamp.r).not.toBe(losers[0]!.stamp.r);
    await click(btn('b', 'Why Sari?'));
    expect(within(card('b')).getByRole('dialog')).toBeTruthy();
    const line = card('b').querySelector('[data-stamps]')!.textContent!;
    expect(line).toContain(stamp(winners[0]!.stamp));
    expect(line).toContain(stamp(losers[0]!.stamp));
  });
});

describe('value twins', () => {
  it('concurrent renames show one button per name and the pick clears the twin', async () => {
    const p = await mount();
    await partition(p, () => {
      actions.renameItem(p.a, 'rope', 'Big tarp');
      actions.renameItem(p.b, 'rope', 'Small tarp');
    });
    for (const id of ['a', 'b'] as const) {
      expect(caption(id)).toBe('TWIN · Sari set this to “Big tarp” while Budi set it to “Small tarp”');
      expect(names(id)).toEqual(['Big tarp', 'Small tarp']);
    }
    await click(btn('b', 'Small tarp'));
    await settle();
    for (const id of ['a', 'b'] as const) {
      noTwin(id);
      expect(p[id].state().items.rope!.name).toBe('Small tarp');
    }
  });

  it('concurrent ticks twin the value and the pick clears it', async () => {
    const p = await mount();
    await partition(p, () => {
      actions.tickItem(p.a, 'cooler', true);
      actions.tickItem(p.b, 'cooler', false);
    });
    for (const id of ['a', 'b'] as const) {
      expect(caption(id)).toBe('TWIN · Sari set this to “ticked” while Budi set it to “not ticked”');
      expect(names(id)).toEqual(['Ticked', 'Not ticked']);
    }
    await click(btn('a', 'Ticked'));
    await settle();
    for (const id of ['a', 'b'] as const) {
      noTwin(id);
      expect(p[id].state().items.cooler!.ticked).toBe(true);
    }
  });
});
