import 'fake-indexeddb/auto';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { Op } from '../core/types.ts';
import { openStore } from './store.ts';

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
