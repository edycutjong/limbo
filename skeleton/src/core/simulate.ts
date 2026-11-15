import { canonical, causalBuffer, createOp, newReplica, observe } from './causal.ts';
import type { Op, OpDef } from './types.ts';

// Seeded PRNG (mulberry32). The simulator is the only place that draws random numbers; reducers never do.
export interface Rand {
  /** Integer in [0, n). */
  int(n: number): number;
  chance(p: number): boolean;
  pick<T>(xs: readonly T[]): T;
}

function makeRand(seed: number): Rand {
  let a = seed >>> 0;
  const next = (): number => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    int: (n) => Math.floor(next() * n),
    chance: (p) => next() < p,
    pick: (xs) => xs[Math.floor(next() * xs.length)]!,
  };
}

const HOUR = 3_600_000;

/**
 * Run `fn` with `Date.now` and `performance.now` shifted by `offsetMs`.
 * Both are restored in `finally`, so a throw cannot leak the skew.
 */
export function withSkew<T>(offsetMs: number, fn: () => T): T {
  const dateNow = Date.now;
  const perfNow = performance.now;
  Date.now = () => dateNow.call(Date) + offsetMs;
  performance.now = () => perfNow.call(performance) + offsetMs;
  try {
    return fn();
  } finally {
    Date.now = dateNow;
    performance.now = perfNow;
  }
}

export interface Step {
  replica: string;
  opId: string;
  /** Canonical state of the replica after this delivery. */
  stateAfter: string;
  /** The op had already been applied or held, so the buffer dropped it. */
  duplicate: boolean;
}

export interface SimInput {
  defs: readonly OpDef[];
  replicas: number;
  seed: number;
  /** Number of ops in the script. Default 12. */
  steps?: number;
  /** Probability that an op is delivered a second time. Default 0.3. */
  dupRate?: number;
  /** Initial state per replica. Default `{}`. */
  init?: () => unknown;
  /** Picks the target and payload of a generated op. Default target `t`, payload `{}`. */
  gen?: (def: OpDef, rand: Rand) => { target: string; payload: unknown };
}

export interface SimResult {
  seed: number;
  /** Canonical state per replica after its whole delivery. */
  states: Record<string, string>;
  trace: Step[];
  /** The script: every op, in creation order. */
  ops: Op[];
  /** Delivery order per replica (op ids, duplicates included). */
  orders: Record<string, string[]>;
}

/** Random topological order of `ops` under `deps`, with some ops inserted twice. */
function deliveryOrder(ops: readonly Op[], rand: Rand, dupRate: number): string[] {
  const vv: Record<string, number> = {};
  const left = [...ops];
  const order: Op[] = [];
  while (left.length > 0) {
    const ready = left.filter(
      (o) => (vv[o.stamp.r] ?? 0) === o.stamp.n - 1 && Object.keys(o.deps).every((r) => (vv[r] ?? 0) >= (o.deps[r] ?? 0)),
    );
    const o = rand.pick(ready); // never empty: the script is causally closed
    left.splice(left.indexOf(o), 1);
    vv[o.stamp.r] = o.stamp.n;
    order.push(o);
  }
  const ids = order.map((o) => o.id);
  const out = [...ids];
  const dupAt = (id: string): void => {
    const from = out.indexOf(id) + 1;
    out.splice(from + rand.int(out.length - from + 1), 0, id);
  };
  ids.forEach((id) => {
    if (rand.chance(dupRate)) dupAt(id);
  });
  if (ids.length > 0 && out.length === ids.length) dupAt(rand.pick(ids)); // at least one duplicate
  return out;
}

export function simulate(input: SimInput): SimResult {
  const { defs, replicas: count, seed } = input;
  const rand = makeRand(seed);
  const init = input.init ?? (() => ({}));
  const gen = input.gen ?? (() => ({ target: 't', payload: {} }));
  const byName = new Map(defs.map((d) => [d.name, d] as const));
  const ids = Array.from({ length: count }, (_, i) => String.fromCharCode(97 + i));
  // Distinct non-zero skew per replica: ±(1..6) h, plus a sub-hour step so two replicas never coincide.
  const skew = ids.map((_, i) => (rand.chance(0.5) ? 1 : -1) * ((1 + rand.int(6)) * HOUR + i));

  // 1. Script generation. A step sees only what its replica has applied, which makes concurrency.
  const reps = ids.map((r) => newReplica(r));
  const bufs = reps.map((rep) => causalBuffer(rep.vv));
  const offered = reps.map(() => new Set<string>());
  const ops: Op[] = [];
  const steps = input.steps ?? 12;
  for (let s = 0; s < steps; s++) {
    const syncs = rand.int(3);
    for (let k = 0; k < syncs; k++) {
      const to = rand.int(count);
      const pending = ops.filter((o) => !offered[to]!.has(o.id));
      if (pending.length === 0) continue;
      const o = rand.pick(pending);
      offered[to]!.add(o.id);
      for (const a of bufs[to]!.offer(o)) observe(reps[to]!, a);
    }
    const i = rand.int(count);
    const def = rand.pick(defs);
    const { target, payload } = gen(def, rand);
    const op = withSkew(skew[i]!, () => createOp(reps[i]!, def, target, payload));
    offered[i]!.add(op.id);
    ops.push(op);
  }

  // 2. Delivery: every op reaches every replica in its own random causal order, some twice.
  const dupRate = input.dupRate ?? 0.3;
  const byId = new Map(ops.map((o) => [o.id, o] as const));
  const trace: Step[] = [];
  const states: Record<string, string> = {};
  const orders: Record<string, string[]> = {};
  ids.forEach((r, i) => {
    const order = deliveryOrder(ops, rand, dupRate);
    orders[r] = order;
    const buf = causalBuffer();
    let state: unknown = init();
    let last = canonical(state);
    for (const id of order) {
      const op = byId.get(id)!;
      const applied = buf.offer(op);
      for (const a of applied) {
        const def = byName.get(a.op);
        if (def?.apply) state = withSkew(skew[i]!, () => def.apply!(state, a));
      }
      last = canonical(state);
      trace.push({ replica: r, opId: id, stateAfter: last, duplicate: applied.length === 0 && buf.held().every((h) => h.id !== id) });
    }
    states[r] = last;
  });
  return { seed, states, trace, ops, orders };
}

/**
 * Print each replica's state after each delivery and name the first step where two replicas
 * that hold the same set of applied ops have different states. Only same-set states are comparable.
 */
export function explainTrace(ce: { trace: readonly Step[]; seed?: number }): string {
  const per = new Map<string, Step[]>();
  for (const s of ce.trace) (per.get(s.replica) ?? per.set(s.replica, []).get(s.replica)!).push(s);
  const lines: string[] = [];
  if (ce.seed !== undefined) lines.push(`seed ${ce.seed}`);
  for (const [r, steps] of per) {
    lines.push(`replica ${r}:`);
    steps.forEach((s, i) => lines.push(`  step ${i}: ${s.opId}${s.duplicate ? ' (duplicate)' : ''} -> ${s.stateAfter}`));
  }
  // Applied-set key per replica per step.
  const keyed = [...per].map(([r, steps]) => {
    const seen = new Set<string>();
    return {
      r,
      rows: steps.map((s) => {
        if (!s.duplicate) seen.add(s.opId);
        return { key: [...seen].sort().join(','), state: s.stateAfter };
      }),
    };
  });
  const longest = Math.max(0, ...keyed.map((k) => k.rows.length));
  for (let i = 0; i < longest; i++) {
    for (const a of keyed) {
      const ra = a.rows[i];
      if (!ra) continue;
      for (const b of keyed) {
        if (b.r <= a.r) continue;
        const rb = b.rows.find((row) => row.key === ra.key);
        if (rb && rb.state !== ra.state) {
          lines.push(`first difference at step ${i}: replicas ${a.r} and ${b.r} hold {${ra.key}} but differ:`);
          lines.push(`  ${a.r}: ${ra.state}`);
          lines.push(`  ${b.r}: ${rb.state}`);
          return lines.join('\n');
        }
      }
    }
  }
  lines.push('no difference between replicas that hold the same ops');
  return lines.join('\n');
}
