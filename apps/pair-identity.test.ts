import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { IdLocks, IdStorage } from '../skeleton/src/sync/identity.ts';
import { openStore } from '../skeleton/src/sync/store.ts';
import { acquirePairIdentity } from './pair-identity.ts';

const memStorage = (): IdStorage => {
  const m = new Map<string, string>();
  return {
    getItem: (k) => m.get(k) ?? null,
    setItem: (k, v) => void m.set(k, v),
    removeItem: (k) => void m.delete(k),
  };
};
const memLocks = (held: Set<string>): IdLocks => ({
  request(name, _opts, cb) {
    if (held.has(name)) return Promise.resolve(cb(null));
    held.add(name);
    return Promise.resolve(cb({ name })).finally(() => held.delete(name));
  },
});
const dbNames = async (): Promise<string[]> => (await indexedDB.databases()).map((d) => d.name ?? '');

afterEach(() => vi.unstubAllGlobals());

describe('acquirePairIdentity', () => {
  it('defaults to sessionStorage and the global search string', async () => {
    const storage = memStorage();
    storage.setItem('limbo:t:session', 's1');
    vi.stubGlobal('sessionStorage', storage);
    vi.stubGlobal('location', { search: '' });
    vi.stubGlobal('navigator', {});
    const id = await acquirePairIdentity('t', { newId: () => 'never' });
    expect(id.names).toEqual(['limbo:t:pair-s1:a', 'limbo:t:pair-s1:b']);
    expect(id.exclusive).toBe(false);
  });

  it('passes navigator.locks only when defined', async () => {
    const held = new Set<string>();
    vi.stubGlobal('sessionStorage', memStorage());
    vi.stubGlobal('location', { search: '' });
    vi.stubGlobal('navigator', { locks: memLocks(held) });
    const id = await acquirePairIdentity('t', { newId: () => 's2' });
    expect(id.exclusive).toBe(true);
    expect(held.has('limbo:t:pair-s2')).toBe(true);
    id.release();
  });

  it('passes location.search so ?reset=1 wipes before the stores open', async () => {
    const s = openStore('limbo:t:pair-s9:a');
    await s.ready;
    await s.meta.write({ k: 4 });
    s.close();
    const storage = memStorage();
    storage.setItem('limbo:t:session', 's9');
    vi.stubGlobal('sessionStorage', storage);
    vi.stubGlobal('location', { search: '?reset=1' });
    vi.stubGlobal('navigator', {});
    await acquirePairIdentity('t');
    expect(await dbNames()).not.toContain('limbo:t:pair-s9:a');
  });

  it('calls the id generator only inside acquireIdentity, and only when no session exists', async () => {
    const newId = vi.fn(() => 'g1');
    const storage = memStorage();
    expect(newId).not.toHaveBeenCalled();
    const id = await acquirePairIdentity('t', { storage, locks: undefined, search: '', newId });
    expect(newId).toHaveBeenCalledTimes(1);
    expect(id.names[0]).toBe('limbo:t:pair-g1:a');
    await acquirePairIdentity('t', { storage, locks: undefined, search: '', newId });
    expect(newId).toHaveBeenCalledTimes(1);
  });

  it('default generator gives a hex id', async () => {
    const storage = memStorage();
    await acquirePairIdentity('t', { storage, locks: undefined, search: '' });
    expect(storage.getItem('limbo:t:session')).toMatch(/^[0-9a-f]{8,}$/);
  });
});
