import { act, cleanup, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { setMedia } from '../../../skeleton/src/limbo/test/setup.ts';
import type { Pair } from '../../../skeleton/src/sync/pair.ts';
import { boot } from './main.tsx';
import { SEED_ITEMS } from './seed.ts';
import type { State } from './model.ts';

let pair: Pair<State> | undefined;
let el: HTMLElement | undefined;

async function mount(reload: () => void = () => undefined): Promise<Pair<State>> {
  el = document.createElement('div');
  document.body.append(el);
  let p!: Pair<State>;
  await act(async () => {
    p = await boot(el!, { reload }).ready;
  });
  pair = p;
  return p;
}

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

describe('app assembly', () => {
  it('both cards render the seeded list in the seed order', async () => {
    await mount();
    const names = SEED_ITEMS.map((i) => i.name);
    for (const id of ['a', 'b']) {
      const card = document.querySelector(`[data-replica="${id}"]`) as HTMLElement;
      const rows = within(card).getAllByRole('listitem').filter((li) => li.hasAttribute('data-item'));
      expect(rows.map((r) => r.textContent)).toEqual(names);
    }
  });

  it('both chips read Live', async () => {
    await mount();
    const chips = document.querySelectorAll('.limbo-chip-text');
    expect(chips.length).toBe(2);
    for (const c of Array.from(chips)) expect(c.textContent).toBe('Live');
  });

  it('shows the tagline and a single layout below 640 px', async () => {
    setMedia({ narrow: true });
    await mount();
    expect(screen.getByText('For people whose shared list breaks when the signal does.')).toBeTruthy();
    expect(document.querySelector('.limbo-single')).toBeTruthy();
    expect(document.querySelectorAll('[data-replica]').length).toBe(1);
  });

  it('exposes window.limbo in a test build', async () => {
    const p = await mount();
    const w = (window as unknown as { limbo: { ready: Promise<void>; pair: unknown; state(id: 'a'): string } }).limbo;
    await w.ready;
    expect(w.pair).toBe(p);
    expect(JSON.parse(w.state('a')).order.length).toBe(SEED_ITEMS.length);
  });

  it('Reset demo deletes both databases and calls reload', async () => {
    const reload = vi.fn();
    await mount(reload);
    expect((await indexedDB.databases()).map((d) => d.name)).toEqual(expect.arrayContaining(['limbo:basecamp:a', 'limbo:basecamp:b']));
    await act(async () => {
      screen.getByRole('button', { name: 'Reset demo' }).click();
    });
    await waitFor(() => expect(reload).toHaveBeenCalledTimes(1));
    const left = (await indexedDB.databases()).map((d) => d.name);
    expect(left).not.toContain('limbo:basecamp:a');
    expect(left).not.toContain('limbo:basecamp:b');
  });
});
