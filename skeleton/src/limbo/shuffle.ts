// Shuffle replay: plain TypeScript, no React or DOM, so a worker can import it.
import { canonical, causalBuffer } from '../core/causal.ts';
import { deliveryOrder, explainTrace, makeRand, type Step } from '../core/simulate.ts';
import type { Op } from '../core/types.ts';

export interface ShuffleInput {
  ops: Op[];
  n: number;
  seed: number;
  dupRate?: number;
}
export interface ShuffleResult {
  /** Orderings actually completed. */
  ran: number;
  /** Final states that differ from the first one. */
  disagree: number;
  /** Distinct final states, the first ordering's state first. */
  states: string[];
  /** `explainTrace` output for the smallest disagreeing set found. */
  trace?: string;
  /** That smallest set (never larger than the input). */
  shrunk?: Op[];
}

type Materialize = (ops: readonly Op[]) => unknown;
const MAX_ATTEMPTS = 200;
const SHRINK_ORDERS = 20;

/** Deliver one random causal order through the causal buffer; return the steps and the final state. */
function replay(ops: readonly Op[], seed: number, dupRate: number, materialize: Materialize, replica: string) {
  const byId = new Map(ops.map((o) => [o.id, o] as const));
  const buf = causalBuffer();
  const applied: Op[] = [];
  const steps: Step[] = [];
  for (const id of deliveryOrder(ops, makeRand(seed), dupRate)) {
    const got = buf.offer(byId.get(id)!);
    applied.push(...got);
    const duplicate = got.length === 0 && buf.held().every((h) => h.id !== id);
    steps.push({ replica, opId: id, stateAfter: canonical(materialize(applied)), duplicate });
  }
  return { steps, state: steps.length > 0 ? steps[steps.length - 1]!.stateAfter : canonical(materialize([])) };
}

/** Two seeds whose final states differ, or undefined. */
function findDisagreement(ops: readonly Op[], seed: number, dupRate: number, m: Materialize) {
  const first = replay(ops, seed, dupRate, m, 'a');
  for (let i = 1; i < SHRINK_ORDERS; i++) {
    const other = replay(ops, seed + i, dupRate, m, 'b');
    if (other.state !== first.state) return { a: first, b: other };
  }
  return undefined;
}

/** `ops` without `drop` and every op that depends on it, so the set stays causally closed. */
function withoutClosure(ops: readonly Op[], drop: Op): Op[] {
  const gone = new Set([drop.id]);
  const dead = (o: Op, g: Op): boolean => (o.stamp.r === g.stamp.r && o.stamp.n > g.stamp.n) || (o.deps[g.stamp.r] ?? 0) >= g.stamp.n;
  for (let grew = true; grew; ) {
    grew = false;
    for (const o of ops) {
      if (gone.has(o.id)) continue;
      if (ops.some((g) => gone.has(g.id) && dead(o, g))) {
        gone.add(o.id);
        grew = true;
      }
    }
  }
  return ops.filter((o) => !gone.has(o.id));
}

export function runShuffle(input: ShuffleInput, materialize: Materialize, onProgress?: (done: number) => void): ShuffleResult {
  const { ops, n, seed } = input;
  const dupRate = input.dupRate ?? 0.3;
  const states: string[] = [];
  let disagree = 0;
  let ran = 0;
  for (let i = 0; i < n; i++) {
    const { state } = replay(ops, seed + i, dupRate, materialize, 'a');
    if (!states.includes(state)) states.push(state);
    if (state !== states[0]) disagree++;
    ran++;
    onProgress?.(ran);
  }
  if (disagree === 0) return { ran, disagree, states };

  let set: Op[] = [...ops];
  let found = findDisagreement(set, seed, dupRate, materialize);
  let attempts = 0;
  for (let again = true; again && found; ) {
    again = false;
    for (const o of [...set]) {
      if (attempts >= MAX_ATTEMPTS) break;
      attempts++;
      const smaller = withoutClosure(set, o);
      if (smaller.length === set.length || smaller.length === 0) continue;
      const f = findDisagreement(smaller, seed, dupRate, materialize);
      if (f) {
        set = smaller;
        found = f;
        again = true;
        break;
      }
    }
  }
  const trace = found ? explainTrace({ trace: [...found.a.steps, ...found.b.steps], seed }) : undefined;
  return { ran, disagree, states, ...(trace !== undefined ? { trace } : {}), shrunk: set };
}
