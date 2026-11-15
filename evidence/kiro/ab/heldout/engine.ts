// LIMBO A/B held-out scorer: an independent script engine (pilot experiment, kiro-plan §9).
// Written by the orchestrator before run 1; kept outside both arms' workspaces during the runs.
// It reuses only the frozen skeleton's op creation and causal buffer (createOp / causalBuffer / covers) and
// the clock skew helper; it does NOT use the kit's simulator, arbitraries, intents or seeds.
// Payloads are built by the op module from the creating replica's CURRENT state (as a UI would), and every
// replica's selector is checked after EVERY delivery against an oracle computed from the applied op set.
import { causalBuffer, canonical, covers, createOp, newReplica, observe } from '../skeleton/src/core/causal.ts';
import { withSkew } from '../skeleton/src/core/simulate.ts';
import type { Op, OpDef } from '../skeleton/src/core/types.ts';

export interface R { int(n: number): number; pick<T>(a: readonly T[]): T; chance(p: number): boolean }
export function rng(seed: number): R {
  let a = seed >>> 0;
  const next = (): number => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return { int: (n) => Math.floor(next() * n), pick: (xs) => xs[Math.floor(next() * xs.length)]!, chance: (p) => next() < p };
}

export interface Applied<A> { op: Op; action: A }
export interface Subject<A> {
  def: OpDef;
  targets: readonly string[];
  draw(r: R): A;
  payload(state: unknown, target: string, a: A): unknown;
  read(state: unknown, target: string): unknown;
  expected(applied: readonly Applied<A>[], target: string): unknown;
}

const HOUR = 3_600_000;
const eq = (x: unknown, y: unknown): boolean => canonical(x) === canonical(y);

/** One random script over `replicas` replicas; returns null on pass or a failure message. */
export function runScript<A>(s: Subject<A>, seed: number, replicas = 3, steps = 2 + (seed % 13)): string | null {
  const r = rng(seed);
  const ids = Array.from({ length: replicas }, (_, i) => String.fromCharCode(97 + i));
  const skew = ids.map((_, i) => (r.chance(0.5) ? 1 : -1) * ((1 + r.int(6)) * HOUR + 7919 * (i + 1)));
  const reps = ids.map((id) => newReplica(id));
  const bufs = reps.map((rep) => causalBuffer(rep.vv));
  const states: unknown[] = ids.map(() => ({}));
  const actions = new Map<string, A>();
  const ops: Op[] = [];
  const apply = (i: number, op: Op): void => {
    states[i] = withSkew(skew[i]!, () => s.def.apply!(states[i], op));
  };
  try {
    // 1. Script: each new op's payload comes from its replica's current state; random partial syncs make concurrency.
    for (let k = 0; k < steps; k++) {
      for (let j = r.int(3); j > 0; j--) {
        const to = r.int(replicas);
        const pending = ops.filter((o) => (bufs[to]!.vv[o.stamp.r] ?? 0) < o.stamp.n);
        if (pending.length === 0) continue;
        for (const a of bufs[to]!.offer(r.pick(pending))) { observe(reps[to]!, a); apply(to, a); }
      }
      const i = r.int(replicas);
      const target = r.pick(s.targets);
      const action = s.draw(r);
      const payload = withSkew(skew[i]!, () => s.payload(states[i], target, action));
      const op = withSkew(skew[i]!, () => createOp(reps[i]!, s.def, target, payload));
      actions.set(op.id, action);
      ops.push(op);
      apply(i, op);
    }
    // 2. Replay: every op reaches every replica in its own random causal order (with duplicates).
    for (let i = 0; i < replicas; i++) {
      const order = topo(ops, r);
      const buf = causalBuffer();
      let state: unknown = {};
      const applied: Applied<A>[] = [];
      for (const id of order) {
        for (const a of buf.offer(ops.find((o) => o.id === id)!)) {
          state = withSkew(skew[i]!, () => s.def.apply!(state, a));
          applied.push({ op: a, action: actions.get(a.id)! });
        }
        for (const t of s.targets) {
          const got = s.read(state, t);
          const want = s.expected(applied, t);
          if (!eq(got, want)) {
            return `seed ${seed}: replica ${ids[i]} after ${applied.map((x) => x.op.id).join(',')} target ${t}: read ${canonical(got)}, expected ${canonical(want)}`;
          }
        }
      }
    }
  } catch (e) {
    return `seed ${seed}: threw ${(e as Error)?.message ?? String(e)}`;
  }
  return null;
}

function topo(ops: readonly Op[], r: R): string[] {
  const vv: Record<string, number> = {};
  const left = [...ops];
  const out: string[] = [];
  while (left.length > 0) {
    const ready = left.filter((o) => (vv[o.stamp.r] ?? 0) === o.stamp.n - 1 && Object.keys(o.deps).every((k) => (vv[k] ?? 0) >= (o.deps[k] ?? 0)));
    const o = r.pick(ready);
    left.splice(left.indexOf(o), 1);
    vv[o.stamp.r] = o.stamp.n;
    out.push(o.id);
    if (r.chance(0.2)) out.splice(out.length - 1 - r.int(out.length), 0, o.id); // an early duplicate is dropped or held by the buffer
  }
  return out;
}

/** Run `n` scripts from `seed0`; returns the failures (first `keep` messages) and the count. */
export function runMany<A>(s: Subject<A>, seed0: number, n: number, keep = 3): { failed: number; samples: string[] } {
  const samples: string[] = [];
  let failed = 0;
  for (let k = 0; k < n; k++) {
    const m = runScript(s, (seed0 + k) >>> 0);
    if (m) { failed++; if (samples.length < keep) samples.push(m); }
  }
  return { failed, samples };
}

// Oracles (written from the intent text, not from any implementation).
export const SEVERITIES = ['none', 'minor', 'major', 'critical'] as const;
export type Severity = (typeof SEVERITIES)[number];
/** Sum of every applied adjustment on the target: concurrent +1/-1 are never lost. */
export const qtyOracle = (applied: readonly Applied<{ by: number }>[], t: string): number =>
  applied.filter((x) => x.op.target === t).reduce((n, x) => n + x.action.by, 0);
/** Highest severity among the reports nobody has seen superseded: a concurrent report never lowers, a re-inspection that saw it may. */
export const severityOracle = (applied: readonly Applied<{ severity: Severity }>[], t: string): Severity => {
  const mine = applied.filter((x) => x.op.target === t);
  const frontier = mine.filter((x) => !mine.some((y) => y.op.id !== x.op.id && covers(y.op, x.op)));
  let best = 0;
  for (const x of frontier) best = Math.max(best, SEVERITIES.indexOf(x.action.severity));
  return SEVERITIES[best]!;
};
