import { act, cleanup, fireEvent, screen, within } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { runShuffle } from '../../../../skeleton/src/limbo/shuffle.ts';
import type { ShuffleRunner } from '../../../../skeleton/src/limbo/shuffle-test.tsx';
import type { Pair } from '../../../../skeleton/src/sync/pair.ts';
import * as actions from '../actions.ts';
import { boot } from '../main.tsx';
import { materialize, type State } from '../model.ts';

let pair: Pair<State> | undefined;
let el: HTMLElement | undefined;
const inline = (): ShuffleRunner => ({ run: async (input) => runShuffle(input, materialize), cancel() {} });

async function mount(): Promise<Pair<State>> {
  el = document.createElement('div');
  document.body.append(el);
  await act(async () => {
    pair = await boot(el!, { reload: () => undefined, createRunner: inline }).ready;
  });
  return pair!;
}
const card = (id: 'a' | 'b'): HTMLElement => document.querySelector(`[data-replica="${id}"]`) as HTMLElement;

afterEach(async () => {
  cleanup();
  pair?.close();
  pair = undefined;
  el?.remove();
  await Promise.all(
    ['a', 'b'].map(
      (id) =>
        new Promise<void>((res) => {
          const r = indexedDB.deleteDatabase(`limbo:aftershock:${id}`);
          r.onsuccess = r.onerror = r.onblocked = () => res();
        }),
    ),
  );
});

async function runShuffleTest(): Promise<void> {
  await act(async () => void fireEvent.click(screen.getByRole('button', { name: 'Run shuffle test' })));
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });
}

describe('Inspector and ShuffleTest wiring', () => {
  it('Inspector queued rows equal view.unacked', async () => {
    const p = await mount();
    p.cut();
    await act(async () => {
      actions.reportSector(p.a, 'C3', 'damaged');
      actions.setCount(p.a, 'C3', 2);
    });
    await act(async () => void fireEvent.click(within(card('a')).getByRole('button', { name: 'Inspector' })));
    const table = within(card('a')).getByRole('table', { name: 'Queued ops' });
    const rows = within(table).getAllByRole('row').slice(1);
    expect(rows.length).toBe(p.view('a').unacked);
    expect(rows.length).toBe(2);
  });

  it('I toggles the controlled Inspector drawer', async () => {
    await mount();
    const root = document.querySelector('.limbo-shell') as HTMLElement;
    const btn = within(card('a')).getByRole('button', { name: 'Inspector' });
    btn.focus();
    await act(async () => void fireEvent.keyDown(btn, { key: 'i' }));
    expect(within(card('a')).queryByRole('dialog')).not.toBeNull();
    await act(async () => void fireEvent.keyDown(root, { key: 'i' }));
    expect(within(card('a')).queryByRole('dialog')).toBeNull();
  });

  it('the seed prints the orderings line and the golden line', async () => {
    await mount();
    await runShuffleTest();
    expect(screen.getByText('1,000 / 1,000 orderings → same state')).toBeTruthy();
    expect(screen.getByText('matches the specified result ✓')).toBeTruthy();
  });

  it('after an extra edit no golden line prints', async () => {
    const p = await mount();
    await act(async () => void actions.reportSector(p.a, 'C3', 'damaged'));
    await runShuffleTest();
    expect(screen.getByText('1,000 / 1,000 orderings → same state')).toBeTruthy();
    expect(screen.queryByText('matches the specified result ✓')).toBeNull();
  });

  it('the worker imports runShuffle and materialize only', () => {
    const src = readFileSync(resolve(process.cwd(), 'apps/aftershock/src/shuffle.worker.ts'), 'utf8');
    const imports = [...src.matchAll(/from '([^']+)'/g)].map((m) => m[1]);
    expect(imports).toEqual(['../../../skeleton/src/limbo/shuffle.ts', './model.ts']);
    expect(src).toMatch(/runShuffle/);
    expect(src).toMatch(/materialize/);
  });
});
