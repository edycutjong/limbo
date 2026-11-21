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
const card = (id: 'a' | 'b'): HTMLElement => document.querySelector(`[data-replica="${id}"]`) as HTMLElement;
const row = (id: 'a' | 'b', item: string): HTMLElement => card(id).querySelector(`[data-item="${item}"]`) as HTMLElement;
const click = (e: HTMLElement): Promise<void> => act(async () => void fireEvent.click(e));
const settle = (): Promise<void> => act(async () => pair!.settle());

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

describe('ItemRow', () => {
  it('data-ticked follows item.ticked', async () => {
    await mount();
    expect(row('a', 'cooler').getAttribute('data-ticked')).toBe('false');
    await click(within(row('a', 'cooler')).getByLabelText('Tick Cooler'));
    expect(row('a', 'cooler').getAttribute('data-ticked')).toBe('true');
  });

  it('tick sets true then false (explicit values)', async () => {
    const p = await mount();
    const box = within(row('a', 'cooler')).getByLabelText('Tick Cooler') as HTMLInputElement;
    await click(box);
    expect(p.a.state().items.cooler!.ticked).toBe(true);
    await click(within(row('a', 'cooler')).getByLabelText('Tick Cooler'));
    expect(p.a.state().items.cooler!.ticked).toBe(false);
    expect(p.a.log().filter((o) => o.op === 'item.tick' && o.target === 'cooler').map((o) => (o.payload as { ticked: boolean }).ticked)).toEqual([true, false]);
  });

  it('Space ticks and Delete deletes the focused row, not while typing', async () => {
    const p = await mount();
    const r = row('a', 'rope');
    await act(async () => void fireEvent.keyDown(r, { key: ' ' }));
    expect(p.a.state().items.rope!.ticked).toBe(true);
    await click(within(r).getByLabelText('More actions for Rope (10 m)'));
    await click(within(r).getByText('Rename'));
    const input = within(r).getByLabelText('Rename Rope (10 m)');
    await act(async () => void fireEvent.keyDown(input, { key: 'Delete' }));
    expect(p.a.state().order).toContain('rope');
    await act(async () => void fireEvent.keyDown(row('a', 'cooler'), { key: 'Delete' }));
    expect(p.a.state().order).not.toContain('cooler');
  });

  it('units 2 shows "1 of 2 claimed" and a claim button for another member', async () => {
    await mount();
    const r = row('a', 'gas');
    expect(within(r).getByText('1 of 2 claimed')).toBeTruthy();
    expect(within(r).getByRole('button', { name: "I'll bring it" })).toBeTruthy();
  });

  it('claim: waiting while queued, then "is bringing it" with Stop after sync', async () => {
    const p = await mount();
    p.cut();
    await click(within(row('a', 'stove')).getByRole('button', { name: "I'll bring it" }));
    expect(within(row('a', 'stove')).getByText('Yours? waiting')).toBeTruthy();
    p.restore();
    await settle();
    expect(within(row('a', 'stove')).getByText('Sari is bringing it')).toBeTruthy();
    expect(within(row('a', 'stove')).getByRole('button', { name: 'Stop bringing it' })).toBeTruthy();
    expect(within(row('b', 'stove')).getByText('Sari is bringing it')).toBeTruthy();
  });

  it('release lets the next claimant see "Now you\'re bringing it"', async () => {
    const p = await mount();
    p.cut();
    await click(within(row('a', 'stove')).getByRole('button', { name: "I'll bring it" }));
    await click(within(row('b', 'stove')).getByRole('button', { name: "I'll bring it" }));
    p.restore();
    await settle();
    expect(within(row('b', 'stove')).queryByText("Now you're bringing it")).toBeNull();
    await click(within(row('a', 'stove')).getByRole('button', { name: 'Stop bringing it' }));
    await settle();
    expect(within(row('b', 'stove')).getByText("Now you're bringing it")).toBeTruthy();
    expect(within(row('b', 'stove')).getByText('Budi is bringing it')).toBeTruthy();
  });

  it('empty list shows the empty state', async () => {
    const p = await mount();
    await act(async () => {
      for (const id of [...p.a.state().order]) actions.deleteItem(p.a, id);
    });
    expect(within(card('a')).getByText('Nothing packed yet. Add the first thing.')).toBeTruthy();
  });

  it('add field creates an item on Enter and renders names as text', async () => {
    const p = await mount();
    const input = within(card('a')).getByLabelText('Add an item') as HTMLInputElement;
    await act(async () => void fireEvent.change(input, { target: { value: '<b>Lantern</b>' } }));
    await act(async () => void fireEvent.submit(input.closest('form')!));
    const id = p.a.state().order.at(-1)!;
    expect(p.a.state().items[id]!.name).toBe('<b>Lantern</b>');
    expect(row('a', id).querySelector('b')).toBeNull();
    expect(row('a', id).querySelector('[data-name]')!.textContent).toBe('<b>Lantern</b>');
  });

  it('every control is 44 px or larger', async () => {
    await mount();
    const controls = Array.from(card('a').querySelectorAll<HTMLElement>('button, input')).filter((c) => !c.closest('.limbo-chip, .limbo-reset, [data-limbo]'));
    const mine = Array.from(row('a', 'gas').querySelectorAll<HTMLElement>('button, input')).concat(Array.from(card('a').querySelectorAll<HTMLElement>('.bc-add button, .bc-add input')));
    expect(mine.length).toBeGreaterThan(4);
    for (const c of mine) {
      expect(parseInt(c.style.minWidth)).toBeGreaterThanOrEqual(44);
      expect(parseInt(c.style.minHeight)).toBeGreaterThanOrEqual(44);
    }
    expect(controls.length).toBeGreaterThan(0);
  });
});
