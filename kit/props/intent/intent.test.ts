// Fixture reducers for intents that have no real op yet (R11.9), plus wrong reducers each oracle must catch.
import { describe, expect, it } from 'vitest';
import type { Op, OpDef } from '../../../skeleton/src/core/types.ts';
import { failingProperties, type RunOptions } from '../run.ts';
import { addRemoveIntent, deltaIntent, maxIntent, setIntent, splitIntent } from './index.ts';

const asDef = (d: unknown): OpDef => d as OpDef;
const RUNS = 60;
const ORDER = ['low', 'mid', 'high'];

// delta
type N = { n?: number };
const inc = (wrong: boolean) =>
  asDef({
    name: 'f.inc',
    merge: 'commutes',
    intent: { kind: 'delta', field: 'n' },
    apply: (s: N, op: Op<{ by: number; seen: number }>) => ({ n: wrong ? op.payload.seen + 1 : (s.n ?? 0) + op.payload.by }),
  } satisfies OpDef<N, { by: number; seen: number }>);
const deltaOpts: RunOptions = {
  gen: (_d, r) => ({ target: 't', payload: { by: 1 + r.int(3), seen: 0 } }),
  checks: [deltaIntent({ delta: (o) => (o.op === 'f.inc' ? (o.payload as { by: number }).by : undefined), read: (s: N) => s.n })],
};

// set
type V = { v?: number; ticked?: boolean };
const setOpts: RunOptions = {
  gen: (_d, r) => ({ target: 't', payload: { v: r.int(3) } }),
  checks: [setIntent({ write: (o) => (o.op === 'f.set' ? (o.payload as { v: number }).v : undefined), read: (s: V) => s.v })],
};
const setLww = asDef({
  name: 'f.set',
  merge: 'causal-lww',
  intent: { kind: 'set', field: 'v' },
  // Correct: carries the stamp it was applied with and keeps the highest.
  apply: (s: V & { at?: [number, string, number] }, op: Op<{ v: number }>) => {
    const k: [number, string, number] = [op.stamp.l, op.stamp.r, op.stamp.n];
    const cur = s.at;
    const higher = !cur || k[0] > cur[0] || (k[0] === cur[0] && (k[1] > cur[1] || (k[1] === cur[1] && k[2] > cur[2])));
    return higher ? { v: op.payload.v, at: k } : s;
  },
});
const setToggle = asDef({
  name: 'f.set',
  merge: 'causal-lww',
  intent: { kind: 'set', field: 'v' },
  apply: (s: V, op: Op<{ v: number }>) => ({ v: ((s.v ?? 0) + op.payload.v) % 3 }),
});

// add-remove
type AR = { adds: Record<string, { m: string; r: string; n: number }>; rems: Record<string, { m: string; deps: Record<string, number> }> };
const arRead = (s: AR): string[] =>
  Object.values(s.adds)
    .filter((a) => a.m && !Object.values(s.rems).some((x) => x.m === a.m && (x.deps[a.r] ?? 0) >= a.n))
    .map((a) => a.m);
const arDef = (wrong: boolean) =>
  asDef({
    name: 'f.ar',
    merge: 'commutes',
    intent: { kind: 'add-remove', field: 'm' },
    apply: (s: AR, op: Op<{ add: boolean; m: string }>) =>
      op.payload.add
        ? { ...s, adds: { ...s.adds, [op.id]: { m: op.payload.m, r: op.stamp.r, n: op.stamp.n } } }
        : wrong
          ? { adds: Object.fromEntries(Object.entries(s.adds).filter(([, a]) => a.m !== op.payload.m)), rems: s.rems } // remove wins over concurrent add
          : { ...s, rems: { ...s.rems, [op.id]: { m: op.payload.m, deps: op.deps } } },
  } satisfies OpDef<AR, { add: boolean; m: string }>);
const arOpts: RunOptions = {
  init: () => ({ adds: {}, rems: {} }),
  gen: (_d, r) => ({ target: 't', payload: { add: r.chance(0.6), m: r.pick(['p', 'q']) } }),
  checks: [
    addRemoveIntent({
      add: (o) => ((o.payload as { add: boolean }).add ? (o.payload as { m: string }).m : undefined),
      remove: (o) => (!(o.payload as { add: boolean }).add ? (o.payload as { m: string }).m : undefined),
      read: arRead,
    }),
  ],
};

// max
type MX = { reps: Record<string, { l: string; r: string; n: number }>; clears: Record<string, Record<string, number>> };
const mxRead = (s: MX): string | undefined => {
  const live = Object.values(s.reps).filter((x) => !Object.values(s.clears).some((d) => (d[x.r] ?? 0) >= x.n));
  return live.map((x) => x.l).sort((a, b) => ORDER.indexOf(b) - ORDER.indexOf(a))[0];
};
const mxDef = asDef({
  name: 'f.mx',
  merge: 'commutes',
  intent: { kind: 'max', field: 'lvl', order: ORDER },
  apply: (s: MX, op: Op<{ lvl: string | null }>) =>
    op.payload.lvl === null
      ? { ...s, clears: { ...s.clears, [op.id]: op.deps } }
      : { ...s, reps: { ...s.reps, [op.id]: { l: op.payload.lvl, r: op.stamp.r, n: op.stamp.n } } },
} satisfies OpDef<MX, { lvl: string | null }>);
const mxOpts: RunOptions = {
  init: () => ({ reps: {}, clears: {} }),
  gen: (_d, r) => ({ target: 't', payload: { lvl: r.chance(0.2) ? null : r.pick(ORDER) } }),
  checks: [
    maxIntent({
      order: ORDER,
      report: (o) => (o.payload as { lvl: string | null }).lvl ?? undefined,
      isClear: (o) => (o.payload as { lvl: string | null }).lvl === null,
      read: mxRead,
    }),
  ],
};

// split
type SP = { amount: number; members: string[]; shares: Record<string, number> };
const spDef = (wrong: boolean) =>
  asDef({
    name: 'f.sp',
    merge: 'sum-split',
    intent: { kind: 'split' },
    apply: (s: SP, op: Op<{ m: string }>) => {
      const members = [...new Set([...s.members, op.payload.m])].sort();
      const base = Math.floor(s.amount / members.length);
      const rem = s.amount % members.length;
      const shares = Object.fromEntries(members.map((m, i) => [m, wrong || i >= rem ? base : base + 1]));
      return { amount: s.amount, members, shares };
    },
  } satisfies OpDef<SP, { m: string }>);
const spOpts: RunOptions = {
  init: () => ({ amount: 1000, members: [], shares: {} }),
  gen: (_d, r) => ({ target: 't', payload: { m: r.pick(['p', 'q', 'r']) } }),
  checks: [splitIntent({ relevant: () => true, read: (s: SP) => (s.members.length === 0 && s.amount === 0 ? undefined : s) })],
};

const intentFails = (def: OpDef, opts: RunOptions): string[] => failingProperties(def, opts, RUNS).filter((n) => n.startsWith('intent:'));

describe('intent properties', () => {
  it('delta: correct passes, read-modify-write fails', () => {
    expect(intentFails(inc(false), deltaOpts)).toEqual([]);
    expect(intentFails(inc(true), deltaOpts)).toContain('intent:delta');
  });
  it('set: a stamp-ordered write passes, a non-set fails', () => {
    expect(intentFails(setLww, setOpts)).toEqual([]);
    expect(intentFails(setToggle, setOpts)).toContain('intent:set');
  });
  it('add-remove: add survives a concurrent remove; remove-wins fails', () => {
    expect(intentFails(arDef(false), arOpts)).toEqual([]);
    expect(intentFails(arDef(true), arOpts)).toContain('intent:add-remove');
  });
  it('max: highest unobserved report passes', () => {
    expect(intentFails(mxDef, mxOpts)).toEqual([]);
  });
  it('split: shares sum to the amount; an even floor split fails', () => {
    expect(intentFails(spDef(false), spOpts)).toEqual([]);
    expect(intentFails(spDef(true), spOpts)).toContain('intent:split');
  });
});
