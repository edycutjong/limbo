import { afterEach, describe, expect, it } from 'vitest';
import { canonical, compareStamp } from '../../../skeleton/src/core/causal.ts';
import type { Op } from '../../../skeleton/src/core/types.ts';
import { createPair, type Pair } from '../../../skeleton/src/sync/pair.ts';
import { openStore } from '../../../skeleton/src/sync/store.ts';
import { releaseItem, restoreItem } from './actions.ts';
import { twinCount, describeConflicts } from './conflicts.ts';
import { materialize, type State } from './model.ts';
import { ops as defs } from './ops/registry.gen.ts';
import { goldens, lakeScript } from './scene.ts';
import { seedOps } from './seed.ts';

// ASSUMPTION (R12.5): fresh databases. Replica `a` makes `a#1:n`, replica `b` makes `b#1:n`.
let n = 0;
let pair: Pair<State> | undefined;
afterEach(() => pair?.close());

async function lake(): Promise<Pair<State>> {
  const tag = `scene${n++}`;
  const p = await createPair<State>({
    app: 'basecamp',
    defs,
    materialize,
    twinCount,
    seedOps,
    store: (name) => openStore(`${tag}:${name}`),
    schedule: () => undefined, // manual scheduler: nothing moves until settle()
  });
  pair = p;
  p.cut();
  return p;
}

/** Deterministic Fisher-Yates over a small LCG (no Math.random). */
function shuffled<T>(xs: readonly T[], seed: number): T[] {
  const a = [...xs];
  let s = seed >>> 0;
  for (let i = a.length - 1; i > 0; i--) {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    const j = s % (i + 1);
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

async function playToResolve(): Promise<{ p: Pair<State>; partition: Op[]; resolves: Op[] }> {
  const p = await lake();
  const partition = lakeScript.map((step) => step.run(step.replica === 'a' ? p.a : p.b));
  p.restore();
  await p.settle();
  const resolves = [restoreItem(p.a, 'tent'), releaseItem(p.b, 'stove')];
  await p.settle();
  return { p, partition, resolves };
}

describe('lake scene script', () => {
  it('makes the stated ids, counters and tie', async () => {
    const { p, partition, resolves } = await playToResolve();
    expect(partition.map((o) => o.id)).toEqual(['a#1:1', 'b#1:1', 'a#1:2', 'b#1:2']);
    expect(partition.map((o) => o.op)).toEqual(['item.tick', 'item.delete', 'item.claim', 'item.claim']);
    expect(partition.map((o) => o.stamp.l)).toEqual([16, 16, 17, 17]);
    const [aClaim, bClaim] = [partition[2]!, partition[3]!];
    expect(aClaim.stamp.l).toBe(17);
    expect(bClaim.stamp.l).toBe(17);
    expect(aClaim.stamp.r).not.toBe(bClaim.stamp.r);
    expect(compareStamp(aClaim.stamp, bClaim.stamp)).toBeLessThan(0);
    expect(resolves.map((o) => o.id)).toEqual(['a#1:3', 'b#1:3']);
    expect(resolves.map((o) => o.op)).toEqual(['item.restore', 'item.release']);
    expect(p.a.state().items.stove!.winners).toEqual(['sari']);
  });

  it('asserts the stated expectations field by field on both replicas', async () => {
    const { p } = await playToResolve();
    for (const s of [p.a.state(), p.b.state()]) {
      const tent = s.items.tent!;
      expect(tent.life).toBe('alive');
      expect(tent.ticked).toBe(true);
      expect(tent.lifeInfo).toBeUndefined();
      expect(tent.twins.fields).toEqual([]);
      const stove = s.items.stove!;
      expect(stove.winners).toEqual(['sari']);
      expect(stove.losers).toEqual([]);
      expect(stove.life).toBe('alive');
      expect(describeConflicts(s)).toEqual([]);
      expect(twinCount(s)).toBe(0);
    }
    expect(canonical(p.a.state())).toBe(canonical(p.b.state()));
  });

  it('has the claim ids and stamps the golden expects', async () => {
    const { p } = await playToResolve();
    const stove = p.b.state().items.stove!;
    expect(stove.claims.winners).toEqual([{ who: 'sari', op: 'a#1:2', stamp: { l: 17, n: 2, r: 'a#1' } }]);
  });
});

describe('goldens', () => {
  it('hold the seed and the finished scene', () => {
    expect(goldens).toHaveLength(2);
    expect(goldens[0]!.opIds).toEqual(seedOps.map((o) => o.id));
    expect(goldens[1]!.opIds).toHaveLength(15 + 4 + 2);
  });

  it('seed golden: expectations field by field, and state equals materialize in shuffled orders', () => {
    const g = goldens[0]!;
    const s = materialize(seedOps);
    expect(s.items.tent!.ticked).toBe(false);
    expect(s.items.coffee!.ticked).toBe(true);
    expect(s.items.gas!.winners).toEqual(['citra']);
    expect(s.items.filter!.winners).toEqual(['dewi']);
    expect(twinCount(s)).toBe(0);
    for (const seed of [1, 2, 3, 4, 5]) {
      expect(canonical(materialize(shuffled(seedOps, seed)))).toBe(g.state);
    }
  });

  it('lake golden: state equals materialize of its ops in shuffled orders', async () => {
    const { p } = await playToResolve();
    const byId = new Map(p.a.applied().map((o) => [o.id, o] as const));
    const g = goldens[1]!;
    const ops = g.opIds.map((id) => byId.get(id)!);
    expect(ops.every((o) => o !== undefined)).toBe(true);
    expect(p.a.applied()).toHaveLength(g.opIds.length);
    for (const seed of [1, 2, 3, 4, 5, 6]) {
      expect(canonical(materialize(shuffled(ops, seed)))).toBe(g.state);
    }
    expect(g.state).toBe(canonical(p.a.state()));
  });

  it('lake golden: stated summary is in the literal', () => {
    const s = JSON.parse(goldens[1]!.state) as State;
    expect(s.items.tent!.life).toBe('alive');
    expect(s.items.tent!.ticked).toBe(true);
    expect(s.items.stove!.winners).toEqual(['sari']);
    expect(s.items.stove!.losers).toEqual([]);
    expect(Object.values(s.items).every((i) => i.twins.fields.length === 0 && i.losers.length === 0 && i.life === 'alive')).toBe(true);
    expect(s.order).toHaveLength(10);
  });
});
