import { act, cleanup, fireEvent, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import type { Pair } from '../../../../skeleton/src/sync/pair.ts';
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
const handle = (id: 'a' | 'b', item: string): HTMLElement => row(id, item).querySelector('.bc-handle') as HTMLElement;
const key = (e: HTMLElement, k: string): Promise<void> => act(async () => void fireEvent.keyDown(e, { key: k }));
const moves = (p: Pair<State>): number => p.a.log().filter((o) => o.op === 'item.move').length;

afterEach(async () => {
  cleanup();
  pair?.close();
  pair = undefined;
  el?.remove();
  sessionStorage.clear();
  await Promise.all(
    (await indexedDB.databases())
      .map((d) => d.name!)
      .filter((n) => n.startsWith('limbo:basecamp:'))
      .map(
        (n) =>
          new Promise<void>((res) => {
            const r = indexedDB.deleteDatabase(n);
            r.onsuccess = r.onerror = r.onblocked = () => res();
          }),
      ),
  );
});

describe('Reorder', () => {
  it('ArrowDown then ArrowUp on the handle move one place, emit one item.move each, keep focus', async () => {
    const p = await mount();
    const before = [...p.a.state().order];
    const first = before[0]!;
    handle('a', first).focus();
    await key(handle('a', first), 'ArrowDown');
    expect(p.a.state().order.slice(0, 2)).toEqual([before[1], first]);
    expect(moves(p)).toBe(1);
    expect(document.activeElement).toBe(handle('a', first));
    await key(handle('a', first), 'ArrowUp');
    expect(p.a.state().order).toEqual(before);
    expect(moves(p)).toBe(2);
    expect(document.activeElement).toBe(handle('a', first));
  });

  it('first and last rows do not move past the ends', async () => {
    const p = await mount();
    const order = [...p.a.state().order];
    await key(handle('a', order[0]!), 'ArrowUp');
    await key(handle('a', order.at(-1)!), 'ArrowDown');
    expect(p.a.state().order).toEqual(order);
    expect(moves(p)).toBe(0);
  });

  it('a pointer drag over rect stubs calls move with the right index', async () => {
    const p = await mount();
    const order = [...p.a.state().order];
    order.forEach((id, i) => {
      row('a', id).getBoundingClientRect = () => ({ top: i * 50, height: 50, bottom: i * 50 + 50, left: 0, right: 100, width: 100, x: 0, y: i * 50, toJSON: () => ({}) });
    });
    const dragged = order[0]!;
    await act(async () => void fireEvent.pointerDown(handle('a', dragged)));
    // y = 130 is below the midpoints of rows 1 and 2 (75, 125) and above row 3's (175)
    await act(async () => void window.dispatchEvent(new MouseEvent('pointerup', { clientY: 130 })));
    expect(p.a.state().order.slice(0, 3)).toEqual([order[1], order[2], dragged]);
    expect(moves(p)).toBe(1);
  });

  it('two concurrent moves converge on both replicas and show no twin', async () => {
    const p = await mount();
    const order = [...p.a.state().order];
    p.cut();
    await key(handle('a', order[0]!), 'ArrowDown');
    await key(handle('b', order[0]!), 'ArrowDown');
    await key(handle('b', order[2]!), 'ArrowUp');
    p.restore();
    await act(async () => p.settle());
    expect(p.a.state().order).toEqual(p.b.state().order);
    expect(p.a.state().order).toHaveLength(order.length);
    expect(within(card('a')).queryAllByText(/TWIN/)).toHaveLength(0);
    expect(within(card('b')).queryAllByText(/TWIN/)).toHaveLength(0);
  });
});
