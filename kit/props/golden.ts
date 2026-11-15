// Golden history helpers (R14): loader, own topological enumerator, partial matcher.
// Kit-owned and independent of `simulate`. Not a reducer file: no clock, no randomness.
// Convergence is measured, property-tested.
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Op } from '../../skeleton/src/core/types.ts';

export const GOLDEN_DIR = join(dirname(fileURLToPath(import.meta.url)), 'golden');

/** Cap on orders per history, so a malformed file cannot hang the suite. */
export const MAX_ORDERS = 100_000;

/** A golden file as stored: stamps are `[l, r, n]` tuples. */
export interface GoldenFile {
  name: string;
  pending?: string;
  ops: {
    id: string;
    op: string;
    target: string;
    payload: unknown;
    stamp: [number, string, number];
    deps: Record<string, number>;
  }[];
  expect: unknown;
}

export interface Golden extends Omit<GoldenFile, 'ops'> {
  file: string;
  ops: Op[];
}

export function loadGoldens(dir: string = GOLDEN_DIR): Golden[] {
  return readdirSync(dir)
    .filter((f) => /^G\d+.*\.json$/.test(f))
    .sort()
    .map((file) => {
      const raw = JSON.parse(readFileSync(join(dir, file), 'utf8')) as GoldenFile;
      const ops: Op[] = raw.ops.map((o) => ({
        id: o.id,
        op: o.op,
        target: o.target,
        payload: o.payload,
        stamp: { l: o.stamp[0], r: o.stamp[1], n: o.stamp[2] },
        deps: o.deps,
      }));
      return { file, name: raw.name, ...(raw.pending !== undefined ? { pending: raw.pending } : {}), ops, expect: raw.expect };
    });
}

/** An op is deliverable iff every dep dot `${r}:${1..n}` has been applied. */
function ready(op: Op, applied: ReadonlySet<string>): boolean {
  for (const [r, n] of Object.entries(op.deps)) {
    for (let i = 1; i <= n; i++) if (!applied.has(`${r}:${i}`)) return false;
  }
  return true;
}

/**
 * Every causal delivery order of `ops`: from the applied set, pick each undelivered op whose
 * deps are met, and recurse. Duplicate ids collapse. Throws if the history cannot be delivered
 * completely or exceeds MAX_ORDERS.
 */
export function* enumerateOrders(ops: readonly Op[], max: number = MAX_ORDERS): Generator<Op[]> {
  const all = [...new Map(ops.map((o) => [o.id, o] as const)).values()];
  const applied = new Set<string>();
  const order: Op[] = [];
  let yielded = 0;
  function* go(): Generator<Op[]> {
    if (order.length === all.length) {
      if (++yielded > max) throw new Error(`more than ${max} causal orders`);
      yield [...order];
      return;
    }
    for (const o of all) {
      if (applied.has(o.id) || !ready(o, applied)) continue;
      applied.add(o.id);
      order.push(o);
      yield* go();
      order.pop();
      applied.delete(o.id);
    }
  }
  const before = yielded;
  yield* go();
  if (yielded === before && all.length > 0) throw new Error('history has no complete causal order (unmet deps)');
}

/**
 * Count complete causal orders and distinct applied sets reached, memoising on the applied set
 * (orders from a set depend only on the set).
 */
export function countOrders(ops: readonly Op[]): { orders: number; sets: number } {
  const all = [...new Map(ops.map((o) => [o.id, o] as const)).values()];
  const memo = new Map<string, number>();
  const ids = (s: ReadonlySet<string>): string => [...s].sort().join('|');
  function go(applied: Set<string>): number {
    if (applied.size === all.length) return 1;
    const key = ids(applied);
    const hit = memo.get(key);
    if (hit !== undefined) return hit;
    let total = 0;
    for (const o of all) {
      if (applied.has(o.id) || !ready(o, applied)) continue;
      applied.add(o.id);
      total += go(applied);
      applied.delete(o.id);
    }
    memo.set(key, total);
    return total;
  }
  const orders = go(new Set());
  return { orders, sets: memo.size };
}

/**
 * Partial match: objects match if every key of `expected` matches; arrays and scalars match
 * exactly (arrays by position). Returns `true` or a path-qualified reason.
 */
export function partialMatch(actual: unknown, expected: unknown, path = '$'): true | string {
  if (Array.isArray(expected)) {
    if (!Array.isArray(actual)) return `${path}: expected array ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`;
    if (actual.length !== expected.length) {
      return `${path}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`;
    }
    for (let i = 0; i < expected.length; i++) {
      const r = partialMatch(actual[i], expected[i], `${path}[${i}]`);
      if (r !== true) return r;
    }
    return true;
  }
  if (expected !== null && typeof expected === 'object') {
    if (actual === null || typeof actual !== 'object' || Array.isArray(actual)) {
      return `${path}: expected object, got ${JSON.stringify(actual)}`;
    }
    for (const [k, v] of Object.entries(expected)) {
      const r = partialMatch((actual as Record<string, unknown>)[k], v, `${path}.${k}`);
      if (r !== true) return r;
    }
    return true;
  }
  return actual === expected ? true : `${path}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`;
}
