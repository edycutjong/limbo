import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import type { Op, OpDef } from '../core/types.ts';
import { acquireIdentity, type IdLocks, type IdStorage } from './identity.ts';
import { createReplica } from './replica.ts';
import { openStore } from './store.ts';

const memStorage = (): IdStorage => {
  const m = new Map<string, string>();
  return {
    getItem: (k) => m.get(k) ?? null,
    setItem: (k, v) => void m.set(k, v),
    removeItem: (k) => void m.delete(k),
  };
};
/** Stand-in for navigator.locks: a set of held names, shared by every "tab". */
const memLocks = (held: Set<string>): IdLocks => ({
  request(name, _opts, cb) {
    if (held.has(name)) return Promise.resolve(cb(null));
    held.add(name);
    return Promise.resolve(cb({ name })).finally(() => held.delete(name));
  },
});
const counter = () => {
  let i = 0;
  return () => `id${++i}`;
};
const dbNames = async (): Promise<string[]> =>
  (await indexedDB.databases()).map((d) => d.name ?? '').sort();

const defs: OpDef[] = [{ name: 'set', merge: 'causal-lww', intent: { kind: 'set', field: 'v' } }];
const boot = (name: string) =>
  createReplica<number>({
    app: 't',
    replicaId: 'a',
    defs,
    materialize: (ops: readonly Op[]) => ops.length,
    twinCount: () => 0,
    store: openStore(name),
    seedOps: [],
  });

describe('identity', () => {
  it('a second tab with the same session id gets a new pair', async () => {
    const held = new Set<string>();
    const locks = memLocks(held);
    const newId = counter();
    const first = await acquireIdentity({ app: 'x', mode: 'pair', storage: memStorage(), locks, newId });
    // a duplicated tab copies sessionStorage, so it starts with the same session id
    const copied = memStorage();
    copied.setItem('limbo:x:session', 'id1');
    const second = await acquireIdentity({ app: 'x', mode: 'pair', storage: copied, locks, newId });
    expect(first.names).toEqual(['limbo:x:pair-id1:a', 'limbo:x:pair-id1:b']);
    expect(second.names).toEqual(['limbo:x:pair-id2:a', 'limbo:x:pair-id2:b']);
    expect(copied.getItem('limbo:x:session')).toBe('id2');
    expect(second.replicaIds).toEqual(['a', 'b']);
    expect(second.exclusive).toBe(true);
    first.release();
  });

  it('a held single replica name gives a new replica id', async () => {
    const held = new Set<string>(['limbo:x:r1']);
    const storage = memStorage();
    storage.setItem('limbo:x:replica', 'r1');
    let n = 1;
    const id = await acquireIdentity({
      app: 'x',
      mode: 'single',
      storage,
      locks: memLocks(held),
      newId: () => `r${++n}`,
    });
    expect(id.replicaIds).toEqual(['r2']);
    expect(id.names).toEqual(['limbo:x:r2']);
    expect(storage.getItem('limbo:x:replica')).toBe('r2');
  });

  it('release frees the lock', async () => {
    const held = new Set<string>();
    const id = await acquireIdentity({
      app: 'x',
      mode: 'single',
      storage: memStorage(),
      locks: memLocks(held),
      newId: counter(),
    });
    expect(held.has(id.names[0]!)).toBe(true);
    id.release();
    await Promise.resolve();
    await Promise.resolve();
    expect(held.size).toBe(0);
  });

  it('reset deletes only this identity databases; a reset pair restarts at incarnation 1', async () => {
    const newId = counter();
    const storage = memStorage();
    const mine = await acquireIdentity({ app: 'x', mode: 'pair', storage, locks: undefined, newId });
    const otherStorage = memStorage();
    otherStorage.setItem('limbo:x:session', 'other');
    const other = await acquireIdentity({ app: 'x', mode: 'pair', storage: otherStorage, locks: undefined, newId });
    for (const name of [...mine.names, ...other.names]) {
      const r = await boot(name);
      r.local('set', 't', 'v');
      await new Promise((res) => setTimeout(res, 30));
      r.close();
    }
    const again = await boot(mine.names[0]!);
    expect(again.ns).toBe('a#2');
    await mine.reset(() => again.close());
    expect(await dbNames()).toEqual([...other.names].sort());
    expect(storage.getItem('limbo:x:session')).toBeNull();
    expect(otherStorage.getItem('limbo:x:session')).toBe('other');
    const fresh = await boot(mine.names[0]!);
    expect(fresh.ns).toBe('a#1');
    expect(fresh.log()).toEqual([]);
    fresh.close();
    const survivor = await boot(other.names[0]!);
    expect(survivor.log().length).toBe(1);
    survivor.close();
  });

  it('?reset=1 wipes this identity before the stores open', async () => {
    const storage = memStorage();
    storage.setItem('limbo:x:session', 's9');
    const s = openStore('limbo:x:pair-s9:a');
    await s.ready;
    await s.meta.write({ k: 4 });
    s.close();
    await acquireIdentity({
      app: 'x',
      mode: 'pair',
      storage,
      locks: undefined,
      newId: counter(),
      search: '?reset=1',
    });
    expect(await dbNames()).not.toContain('limbo:x:pair-s9:a');
  });

  it('locks undefined gives exclusive: false', async () => {
    const id = await acquireIdentity({
      app: 'x',
      mode: 'single',
      storage: memStorage(),
      locks: undefined,
      newId: counter(),
    });
    expect(id.exclusive).toBe(false);
  });

  it('throws after 5 tries when every lock is held', async () => {
    const locks: IdLocks = { request: (_n, _o, cb) => Promise.resolve(cb(null)) };
    await expect(
      acquireIdentity({ app: 'x', mode: 'pair', storage: memStorage(), locks, newId: counter() }),
    ).rejects.toThrow(/lock held/);
  });
});

describe('identity without Web Locks', () => {
  it('is not exclusive and release does nothing', async () => {
    const id = await acquireIdentity({ app: 'x', mode: 'single', storage: memStorage(), locks: undefined, newId: counter() });
    expect(id.exclusive).toBe(false);
    expect(id.names).toEqual(['limbo:x:id1']);
    expect(() => id.release()).not.toThrow();
  });
});
