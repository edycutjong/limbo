import { afterEach, describe, expect, it } from 'vitest';
import { canonical, compareStamp } from '../../../skeleton/src/core/causal.ts';
import type { Op } from '../../../skeleton/src/core/types.ts';
import { createPair, type Pair } from '../../../skeleton/src/sync/pair.ts';
import { openStore } from '../../../skeleton/src/sync/store.ts';
import { pickNote } from './actions.ts';
import { describeConflicts, twinCount } from './conflicts.ts';
import { materialize, type State } from './model.ts';
import { ops as defs } from './ops/registry.gen.ts';
import { goldens, PARTITION_OP_IDS, RESOLVE_OP_IDS, SEED_OP_IDS, surveyScript } from './scene.ts';
import { seedOps } from './seed.ts';

// ASSUMPTION (R12.5): fresh databases. Replica `a` makes `a#1:n`, replica `b` makes `b#1:n`.
let n = 0;
let pair: Pair<State> | undefined;
afterEach(() => pair?.close());

async function survey(): Promise<Pair<State>> {
  const tag = `ascene${n++}`;
  const p = await createPair<State>({
    app: 'aftershock',
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

async function playToRestore(): Promise<{ p: Pair<State>; partition: Op[] }> {
  const p = await survey();
  const partition = surveyScript.map((step) => step.run(step.replica === 'a' ? p.a : p.b));
  p.restore();
  await p.settle();
  return { p, partition };
}

async function playToResolve(): Promise<{ p: Pair<State>; partition: Op[]; resolve: Op }> {
  const { p, partition } = await playToRestore();
  const resolve = pickNote(p.a, 'C3', 'gas smell, east wall');
  await p.settle();
  return { p, partition, resolve };
}

describe('survey scene script', () => {
  it('makes the stated ids, counters and tie', async () => {
    const { p, partition } = await playToRestore();
    const mine = (r: string): Op[] => partition.filter((o) => o.stamp.r === r);
    expect(mine('a#1').map((o) => o.id)).toEqual(['a#1:1', 'a#1:2', 'a#1:3']);
    expect(mine('b#1').map((o) => o.id)).toEqual(['b#1:1', 'b#1:2', 'b#1:3']);
    expect(partition.map((o) => o.id).sort()).toEqual([...PARTITION_OP_IDS].sort());
    expect(partition.map((o) => o.op)).toEqual([
      'sector.report', 'sector.report', 'sector.count', 'sector.count', 'sector.note', 'sector.note',
    ]);
    expect(partition.map((o) => o.stamp.l)).toEqual([19, 19, 20, 20, 21, 21]);
    const [aReport, bReport] = [partition[0]!, partition[1]!];
    expect(aReport.stamp.r).not.toBe(bReport.stamp.r);
    expect(compareStamp(aReport.stamp, bReport.stamp)).toBeLessThan(0);

    const resolve = pickNote(p.a, 'C3', 'gas smell, east wall');
    expect(resolve.id).toBe('a#1:4');
    expect(resolve.id).toBe(RESOLVE_OP_IDS[0]);
    expect(resolve.stamp.l).toBe(22);
  });

  it('shows two note values before the resolve and none after', async () => {
    const { p } = await playToRestore();
    for (const s of [p.a.state(), p.b.state()]) {
      const c3 = s.sectors.C3!;
      expect(c3.severity).toBe('unsafe');
      expect(c3.total).toBe(5);
      expect(c3.noteValues).toHaveLength(2);
      expect(c3.note).toBe('gas smell, east wall');
      expect(twinCount(s)).toBe(1);
    }
    expect(canonical(p.a.state())).toBe(canonical(p.b.state()));
    pickNote(p.a, 'C3', 'gas smell, east wall');
    await p.settle();
    for (const s of [p.a.state(), p.b.state()]) {
      expect(s.sectors.C3!.noteValues).toEqual([]);
      expect(describeConflicts(s)).toEqual([]);
    }
  });

  it('asserts the stated expectations field by field on both replicas', async () => {
    const { p } = await playToResolve();
    for (const s of [p.a.state(), p.b.state()]) {
      const c3 = s.sectors.C3!;
      expect(c3.severity).toBe('unsafe');
      expect(c3.reports).toBe(2);
      expect(c3.counts.map((c) => [c.who, c.value])).toEqual([['sari', 2], ['budi', 3]]);
      expect(c3.counts.every((c) => c.values.length === 0)).toBe(true);
      expect(c3.total).toBe(5);
      expect(c3.needs).toEqual([]);
      expect(c3.note).toBe('gas smell, east wall');
      expect(c3.noteValues).toEqual([]);
      expect(twinCount(s)).toBe(0);
    }
    expect(canonical(p.a.state())).toBe(canonical(p.b.state()));
  });
});

describe('goldens', () => {
  it('hold the seed and the finished scene', () => {
    expect(goldens).toHaveLength(2);
    expect(goldens[0]!.opIds).toEqual(seedOps.map((o) => o.id));
    expect(goldens[0]!.opIds).toEqual([...SEED_OP_IDS]);
    expect(goldens[1]!.opIds).toHaveLength(18 + 6 + 1);
  });

  it('seed golden: state equals materialize in shuffled orders', () => {
    const g = goldens[0]!;
    const s = materialize(seedOps);
    expect(Object.keys(s.sectors)).toHaveLength(10);
    expect(s.sectors.C3).toBeUndefined();
    expect(twinCount(s)).toBe(0);
    for (const seed of [1, 2, 3, 4, 5]) {
      expect(canonical(materialize(shuffled(seedOps, seed)))).toBe(g.state);
    }
  });

  it('scene golden: state equals materialize of its ops in shuffled orders', async () => {
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

  it('scene golden: stated summary is in the literal', () => {
    const s = JSON.parse(goldens[1]!.state) as State;
    const c3 = s.sectors.C3!;
    expect(c3.severity).toBe('unsafe');
    expect(c3.reports).toBe(2);
    expect(c3.counts).toEqual([
      { who: 'sari', value: 2, values: [] },
      { who: 'budi', value: 3, values: [] },
    ]);
    expect(c3.total).toBe(5);
    expect(c3.needs).toEqual([]);
    expect(c3.note).toBe('gas smell, east wall');
    expect(c3.noteValues).toEqual([]);
    expect(Object.values(s.sectors).every((x) => x.noteValues.length === 0 && x.counts.every((c) => c.values.length === 0))).toBe(true);
  });
});
