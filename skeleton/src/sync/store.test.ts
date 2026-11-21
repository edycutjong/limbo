import 'fake-indexeddb/auto';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { Op } from '../core/types.ts';
import { deleteStore, openStore } from './store.ts';

const mk = (r: string, n: number, v = 'x'): Op => ({
  id: `${r}:${n}`,
  op: 'item.tick',
  target: 'i1',
  payload: { v },
  stamp: { l: n, r, n },
  deps: {},
});

describe('store', () => {
  it('put and all', async () => {
    const s = openStore('t-put');
    await s.ready;
    s.put(mk('a', 1));
    s.put(mk('b', 1));
    expect(s.all().map((o) => o.id).sort()).toEqual(['a:1', 'b:1']);
    s.close();
  });

  it('duplicate id keeps the first op', async () => {
    const s = openStore('t-dup');
    await s.ready;
    s.put(mk('a', 1, 'first'));
    s.put(mk('a', 1, 'second'));
    expect(s.all()).toHaveLength(1);
    expect(s.all()[0]!.payload).toEqual({ v: 'first' });
    s.close();
  });

  it('onChange fires on put and can unsubscribe', async () => {
    const s = openStore('t-change');
    await s.ready;
    let n = 0;
    const off = s.onChange(() => n++);
    s.put(mk('a', 1));
    off();
    s.put(mk('a', 2));
    expect(n).toBe(1);
    s.close();
  });

  it('persistence round trip', async () => {
    const s1 = openStore('t-persist');
    await s1.ready;
    s1.put(mk('a', 1));
    s1.put(mk('a', 2));
    await new Promise((r) => setTimeout(r, 50));
    s1.close();
    const s2 = openStore('t-persist');
    await s2.ready;
    expect(s2.all().map((o) => o.id).sort()).toEqual(['a:1', 'a:2']);
    s2.close();
  });
});

describe('confirmed writes', () => {
  // Spike: the design assumes an empty readwrite transaction on the updates store completes
  // after every earlier update write. Each put is awaited, then a fresh connection (a second
  // openStore on the same name, while the first stays open) must already see the op.
  it('put resolves only after the update is readable from a fresh connection', async () => {
    const s1 = openStore('t-spike');
    await s1.ready;
    for (let i = 1; i <= 20; i++) {
      await s1.put(mk('a', i));
      const fresh = openStore('t-spike');
      await fresh.ready;
      expect(fresh.all().map((o) => o.id)).toContain(`a:${i}`);
      fresh.close();
    }
    s1.close();
  });

  it('a burst of unawaited puts is all readable once the last one resolves', async () => {
    const s1 = openStore('t-burst');
    await s1.ready;
    const puts = Array.from({ length: 30 }, (_, i) => s1.put(mk('a', i + 1)));
    await puts[puts.length - 1];
    const fresh = openStore('t-burst');
    await fresh.ready;
    expect(fresh.all()).toHaveLength(30);
    fresh.close();
    s1.close();
  });

  it('second put of the same id is a no-op that still resolves', async () => {
    const s = openStore('t-dup2');
    await s.ready;
    await s.put(mk('a', 1, 'first'));
    await s.put(mk('a', 1, 'second'));
    expect(s.all()).toHaveLength(1);
    expect(s.all()[0]!.payload).toEqual({ v: 'first' });
    s.close();
    const s2 = openStore('t-dup2');
    await s2.ready;
    expect(s2.all()[0]!.payload).toEqual({ v: 'first' });
    s2.close();
  });

  it('meta round-trips across close and reopen', async () => {
    const s1 = openStore('t-meta');
    await s1.ready;
    expect(s1.meta.read()).toEqual({});
    await s1.meta.write({ replicaId: 'a', k: 1, seedVersion: 'v1' });
    await s1.meta.write({ k: 2, peerAckVV: { b: { 'b#1': 3 } } });
    s1.close();
    const s2 = openStore('t-meta');
    await s2.ready;
    expect(s2.meta.read()).toEqual({
      replicaId: 'a',
      k: 2,
      seedVersion: 'v1',
      peerAckVV: { b: { 'b#1': 3 } },
    });
    s2.close();
  });

  it('deleteStore removes the log and meta', async () => {
    const s1 = openStore('t-del');
    await s1.ready;
    await s1.put(mk('a', 1));
    await s1.meta.write({ k: 1 });
    s1.close();
    await deleteStore('t-del');
    const s2 = openStore('t-del');
    await s2.ready;
    expect(s2.all()).toEqual([]);
    expect(s2.meta.read()).toEqual({});
    s2.close();
  });

  it('deleteStore leaves other databases alone', async () => {
    const keep = openStore('t-keep');
    await keep.ready;
    await keep.put(mk('a', 1));
    keep.close();
    await deleteStore('t-gone');
    const again = openStore('t-keep');
    await again.ready;
    expect(again.all()).toHaveLength(1);
    again.close();
  });
});

describe('memory-only path (no IndexedDB)', () => {
  it('put, meta and deleteStore resolve', async () => {
    const saved = (globalThis as { indexedDB?: unknown }).indexedDB;
    delete (globalThis as { indexedDB?: unknown }).indexedDB;
    try {
      const s = openStore('t-mem');
      await s.ready;
      await expect(s.put(mk('a', 1))).resolves.toBeUndefined();
      await expect(s.meta.write({ k: 1 })).resolves.toBeUndefined();
      expect(s.all()).toHaveLength(1);
      expect(s.meta.read()).toEqual({ k: 1 });
      await expect(deleteStore('t-mem')).resolves.toBeUndefined();
      s.close();
    } finally {
      (globalThis as { indexedDB?: unknown }).indexedDB = saved;
    }
  });
});

describe('yjs import lint', () => {
  it('only store.ts imports yjs or y-indexeddb', () => {
    const roots = ['skeleton/src', 'apps', 'kit', 'e2e'].map((p) => join(process.cwd(), p));
    const offenders: string[] = [];
    const walk = (d: string) => {
      let names: string[];
      try {
        names = readdirSync(d);
      } catch {
        return;
      }
      for (const f of names) {
        if (f === 'node_modules') continue;
        const p = join(d, f);
        if (statSync(p).isDirectory()) walk(p);
        else if (/\.(ts|tsx|mjs|js)$/.test(f) && !p.endsWith(join('sync', 'store.ts'))) {
          if (p === import.meta.filename) continue;
          if (/from\s+['"](yjs|y-indexeddb)['"]|import\(['"](yjs|y-indexeddb)['"]\)/.test(readFileSync(p, 'utf8')))
            offenders.push(p);
        }
      }
    };
    roots.forEach(walk);
    expect(offenders).toEqual([]);
  });
});
