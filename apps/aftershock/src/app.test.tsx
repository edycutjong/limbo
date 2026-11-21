import { act, cleanup, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setMedia } from '../../../skeleton/src/limbo/test/setup.ts';
import type { Pair } from '../../../skeleton/src/sync/pair.ts';
import type { Op } from '../../../skeleton/src/core/types.ts';
import { reportSector } from './actions.ts';
import { boot, withReplicas } from './main.tsx';
import type { State } from './model.ts';


function memStorage(init: Record<string, string> = {}) {
  const m = new Map(Object.entries(init));
  return {
    m,
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
    removeItem: (k: string) => void m.delete(k),
  };
}

function memLocks() {
  const held = new Map<string, () => void>();
  return {
    /** Simulates the page unloading: every lock is released. */
    releaseAll: () => [...held.values()].forEach((r) => r()),
    request(name: string, _o: { ifAvailable: true }, cb: (lock: unknown) => Promise<unknown> | null): Promise<unknown> {
      if (held.has(name)) return Promise.resolve(cb(null));
      const p = cb({});
      const done = (): void => void held.delete(name);
      held.set(name, done);
      return Promise.resolve(p).finally(done);
    },
  };
}

function ids(...list: string[]): () => string {
  let i = 0;
  return () => list[i++] ?? `x${i}`;
}

const names = async (): Promise<string[]> => (await indexedDB.databases()).map((d) => d.name!);

async function wipeAll(): Promise<void> {
  await Promise.all(
    (await names())
      .filter((n) => n.startsWith('limbo:aftershock:'))
      .map(
        (n) =>
          new Promise<void>((res) => {
            const r = indexedDB.deleteDatabase(n);
            r.onsuccess = r.onerror = r.onblocked = () => res();
          }),
      ),
  );
}

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

beforeEach(() => {
  history.replaceState(null, '', '/');
  sessionStorage.clear();
});

afterEach(async () => {
  cleanup();
  pair?.close();
  pair = undefined;
  el?.remove();
  await wipeAll();
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

describe('pair identity (R14)', () => {
  const A = 'aftershock';
  async function bootWith(identity: object, reload: () => void = () => undefined): Promise<{ p: Pair<State>; el: HTMLElement }> {
    const host = document.createElement('div');
    document.body.append(host);
    let p!: Pair<State>;
    await act(async () => {
      p = await boot(host, { reload, identity } as never).ready;
    });
    return { p, el: host };
  }

  it('opens the R14 database names and not the fixed ones', async () => {
    const storage = memStorage();
    const t = await bootWith({ storage, locks: memLocks(), newId: ids('s1', 's2'), search: '' });
    pair = t.p;
    el = t.el;
    const n = await names();
    expect(n).toEqual(expect.arrayContaining([`limbo:${A}:pair-s1:a`, `limbo:${A}:pair-s1:b`]));
    expect(n).not.toContain(`limbo:${A}:a`);
    expect(n).not.toContain(`limbo:${A}:b`);
  });

  it('a second boot with the same session id and locks opens pair-s2', async () => {
    const locks = memLocks();
    const newId = ids('s1', 's2');
    const first = await bootWith({ storage: memStorage(), locks, newId, search: '' });
    const second = await bootWith({ storage: memStorage({ [`limbo:${A}:session`]: 's1' }), locks, newId, search: '' });
    pair = second.p;
    el = second.el;
    first.p.close();
    const n = await names();
    expect(n).toEqual(
      expect.arrayContaining([`limbo:${A}:pair-s1:a`, `limbo:${A}:pair-s1:b`, `limbo:${A}:pair-s2:a`, `limbo:${A}:pair-s2:b`]),
    );
    first.el.remove();
  });

  it('Reset demo deletes only this session databases, clears the session key and reloads once', async () => {
    const locks = memLocks();
    const newId = ids('s1', 's2');
    const storage = memStorage();
    await new Promise<void>((res) => {
      const r = indexedDB.open(`limbo:${A}:pair-other:a`);
      r.onsuccess = () => {
        r.result.close();
        res();
      };
    });
    const reload = vi.fn();
    const first = await bootWith({ storage, locks, newId, search: '' }, reload);
    const second = await bootWith({ storage: memStorage({ [`limbo:${A}:session`]: 's1' }), locks, newId, search: '' });
    pair = second.p;
    el = second.el;
    await act(async () => {
      within(first.el).getByRole('button', { name: 'Reset demo' }).click();
    });
    await waitFor(() => expect(reload).toHaveBeenCalledTimes(1));
    const left = await names();
    expect(left).not.toContain(`limbo:${A}:pair-s1:a`);
    expect(left).not.toContain(`limbo:${A}:pair-s1:b`);
    expect(left).toContain(`limbo:${A}:pair-other:a`);
    expect(left).toEqual(expect.arrayContaining([`limbo:${A}:pair-s2:a`, `limbo:${A}:pair-s2:b`]));
    expect(storage.m.has(`limbo:${A}:session`)).toBe(false);
    first.el.remove();
  });

  it('a plain reload opens the same names and keeps the list and queued ops', async () => {
    const locks = memLocks();
    const storage = memStorage();
    const idOpts = { storage, locks, newId: ids('s1', 's2'), search: '' };
    const first = await bootWith(idOpts);
    first.p.cut();
    reportSector(first.p.a, 'S9', 'high' as never);
    const before = { state: first.p.a.state(), queued: first.p.queued('a').map((o) => o.id) };
    expect(before.queued.length).toBeGreaterThan(0);
    first.p.close();
    first.el.remove();
    locks.releaseAll();
    await new Promise((r) => setTimeout(r, 0));
    const second = await bootWith(idOpts);
    pair = second.p;
    el = second.el;
    const n = await names();
    expect(n.filter((x) => x.startsWith(`limbo:${A}:pair-`)).sort()).toEqual([`limbo:${A}:pair-s1:a`, `limbo:${A}:pair-s1:b`]);
    expect(second.p.a.state()).toEqual(before.state);
    // The op survives in the store; the fresh link then delivers it, so the queue drains.
    expect(second.p.a.log().map((o) => o.id)).toEqual(expect.arrayContaining(before.queued));
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
