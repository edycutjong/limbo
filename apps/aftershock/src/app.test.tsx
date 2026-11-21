import { act, cleanup, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setMedia } from '../../../skeleton/src/limbo/test/setup.ts';
import type { Pair } from '../../../skeleton/src/sync/pair.ts';
import type { Op } from '../../../skeleton/src/core/types.ts';
import { boot, withReplicas } from './main.tsx';
import type { State } from './model.ts';

let pair: Pair<State> | undefined;
let el: HTMLElement | undefined;

async function mount(o: { reload?: () => void; seedOps?: readonly Op[] } = {}): Promise<Pair<State>> {
  el = document.createElement('div');
  document.body.append(el);
  let p!: Pair<State>;
  await act(async () => {
    p = await boot(el!, { reload: o.reload ?? (() => undefined), ...(o.seedOps ? { seedOps: o.seedOps } : {}) }).ready;
  });
  pair = p;
  return p;
}

beforeEach(() => history.replaceState(null, '', '/'));

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

describe('app assembly', () => {
  it('both cards render, with the heading, tagline and chip kept', async () => {
    setMedia({ narrow: false });
    await mount();
    expect(document.querySelectorAll('[data-replica]').length).toBe(2);
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(screen.getByText('For small teams who fill the same form when the signal is gone.')).toBeTruthy();
    expect(screen.getByRole('note').textContent).toContain('DEMO DATA');
  });

  it('both chips read Live', async () => {
    setMedia({ narrow: false });
    await mount();
    const chips = document.querySelectorAll('.limbo-chip-text');
    expect(chips.length).toBe(2);
    for (const c of Array.from(chips)) expect(c.textContent).toBe('Live');
  });

  it('shows a single layout below 640 px', async () => {
    setMedia({ narrow: true });
    history.replaceState(null, '', '/?replicas=1');
    await mount();
    expect(document.querySelector('.limbo-single')).toBeTruthy();
    expect(document.querySelectorAll('[data-replica]').length).toBe(1);
  });

  it('exposes window.limbo in a test build', async () => {
    const p = await mount();
    const w = (window as unknown as { limbo: { ready: Promise<void>; pair: unknown } }).limbo;
    await w.ready;
    expect(w.pair).toBe(p);
  });

  it('Reset demo deletes both databases and calls reload', async () => {
    setMedia({ narrow: false });
    const reload = vi.fn();
    await mount({ reload });
    expect((await indexedDB.databases()).map((d) => d.name)).toEqual(
      expect.arrayContaining(['limbo:aftershock:a', 'limbo:aftershock:b']),
    );
    await act(async () => {
      screen.getByRole('button', { name: 'Reset demo' }).click();
    });
    await waitFor(() => expect(reload).toHaveBeenCalledTimes(1));
    const left = (await indexedDB.databases()).map((d) => d.name);
    expect(left).not.toContain('limbo:aftershock:a');
    expect(left).not.toContain('limbo:aftershock:b');
  });

  it('with no seed ops shows the empty state', async () => {
    setMedia({ narrow: false });
    await mount({ seedOps: [] });
    expect(screen.getAllByText('No sectors reported yet. Tap a sector to report.').length).toBeGreaterThan(0);
  });

  it('with no replicas param on a phone, both cards and Cut link render', async () => {
    setMedia({ narrow: true });
    await mount();
    expect(document.querySelectorAll('[data-replica]').length).toBe(2);
    expect(screen.getByRole('button', { name: /Cut link/ })).toBeTruthy();
  });
});

describe('withReplicas', () => {
  it('adds replicas=2 when absent', () => {
    expect(withReplicas('')).toBe('?replicas=2');
  });
  it('keeps replicas=1 and replicas=2', () => {
    expect(withReplicas('?replicas=1')).toBe('?replicas=1');
    expect(withReplicas('?replicas=2')).toBe('?replicas=2');
  });
  it('keeps other params', () => {
    const p = new URLSearchParams(withReplicas('?x=y'));
    expect(p.get('x')).toBe('y');
    expect(p.get('replicas')).toBe('2');
  });
});
