import { generateKeyBetween } from 'fractional-indexing';
import type { Op, OpDef, ReplicaId, Stamp, VV } from './types.ts';

/** Total order: l, then r by UTF-16 code unit (string `<`, never localeCompare), then n. */
export function compareStamp(a: Stamp, b: Stamp): number {
  if (a.l !== b.l) return a.l < b.l ? -1 : 1;
  if (a.r !== b.r) return a.r < b.r ? -1 : 1;
  if (a.n !== b.n) return a.n < b.n ? -1 : 1;
  return 0;
}

/** x covers y iff x had already seen y when it was made. */
export function covers(x: Pick<Op, 'deps'>, y: Pick<Op, 'stamp'>): boolean {
  return (x.deps[y.stamp.r] ?? 0) >= y.stamp.n;
}

export function concurrent(x: Op, y: Op): boolean {
  return x.id !== y.id && !covers(x, y) && !covers(y, x);
}

/** Per-replica creation state. Only op creation reads `r` and `counter`. */
export interface Replica {
  r: ReplicaId;
  counter: number;
  maxL: number;
  vv: VV;
}

export function newReplica(r: ReplicaId): Replica {
  return { r, counter: 0, maxL: 0, vv: {} };
}

/** Record a remote or local op as seen: raises the Lamport maximum. Does not touch `vv` (the buffer owns it). */
export function observe(replica: Replica, op: Op): void {
  if (op.stamp.l > replica.maxL) replica.maxL = op.stamp.l;
}

/** Create a local op: l = 1 + max(l seen), n = ++counter, deps = current VV. The new op counts as applied locally. */
export function createOp<P>(replica: Replica, def: Pick<OpDef, 'name'>, target: string, payload: P): Op<P> {
  const l = replica.maxL + 1;
  const n = ++replica.counter;
  const deps: VV = { ...replica.vv };
  const op: Op<P> = { id: `${replica.r}:${n}`, op: def.name, target, payload, stamp: { l, r: replica.r, n }, deps };
  replica.maxL = l;
  replica.vv[replica.r] = n;
  return op;
}

const B62 = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';

// Each UTF-16 code unit becomes three base62 digits (62^3 > 65535), so the encoding is injective.
function base62(s: string): string {
  let out = '';
  for (let i = 0; i < s.length; i++) {
    let c = s.charCodeAt(i);
    let d = '';
    for (let k = 0; k < 3; k++) {
      d = B62[c % 62] + d;
      c = Math.floor(c / 62);
    }
    out += d;
  }
  return out;
}

/** The dot of the op that will carry a key: its replica namespace (with incarnation) and its counter. */
export interface Dot {
  r: ReplicaId;
  n: number;
}

const len3 = (n: number): string => B62[Math.floor(n / 3844) % 62]! + B62[Math.floor(n / 62) % 62]! + B62[n % 62]!;

/**
 * Fractional key between `left` and `right`, made unique by a suffix. Called at op creation only.
 * A string `by` keeps the legacy suffix (replica id before `#`, dashes dropped). A dot gives
 * `k + base62(`${r}:${n}`) + len3 + '1'`, which is injective in the dot and parseable from the end.
 */
export function allocKey(left: string | null, right: string | null, by: ReplicaId | Dot): string {
  let k = generateKeyBetween(left, right);
  while (right !== null && right.startsWith(k)) k = generateKeyBetween(k, right);
  if (typeof by !== 'string') {
    const d = `${by.r}:${by.n}`;
    return k + base62(d) + len3(d.length) + '1';
  }
  return k + base62((by.split('#')[0] ?? '').replaceAll('-', '')) + '1';
}

/** Canonical JSON: keys sorted by code unit, no whitespace, `undefined` dropped, integers only. */
export function canonical(v: unknown): string {
  if (v === null) return 'null';
  switch (typeof v) {
    case 'string':
    case 'boolean':
      return JSON.stringify(v);
    case 'number':
      if (!Number.isInteger(v)) throw new Error(`canonical: non-integer number ${String(v)}`);
      return JSON.stringify(v);
    case 'object': {
      if (Array.isArray(v)) return '[' + v.map((x) => (x === undefined ? 'null' : canonical(x))).join(',') + ']';
      const o = v as Record<string, unknown>;
      const keys = Object.keys(o).filter((k) => o[k] !== undefined).sort();
      return '{' + keys.map((k) => JSON.stringify(k) + ':' + canonical(o[k])).join(',') + '}';
    }
    default:
      throw new Error(`canonical: unsupported type ${typeof v}`);
  }
}

export interface CausalBuffer {
  vv: VV;
  /** Offer an op. Returns the ops that became applicable, in apply order. */
  offer(op: Op): Op[];
  held(): Op[];
}

export function causalBuffer(vv: VV = {}): CausalBuffer {
  const heldOps: Op[] = [];
  const heldIds = new Set<string>();

  const ready = (op: Op): boolean => {
    if ((vv[op.stamp.r] ?? 0) !== op.stamp.n - 1) return false;
    for (const r of Object.keys(op.deps)) if ((vv[r] ?? 0) < (op.deps[r] ?? 0)) return false;
    return true;
  };
  const isApplied = (op: Op): boolean => (vv[op.stamp.r] ?? 0) >= op.stamp.n;

  return {
    vv,
    offer(op) {
      if (isApplied(op) || heldIds.has(op.id)) return [];
      heldOps.push(op);
      heldIds.add(op.id);
      const applied: Op[] = [];
      let progress = true;
      while (progress) {
        progress = false;
        for (let i = 0; i < heldOps.length; i++) {
          const h = heldOps[i]!;
          if (ready(h)) {
            vv[h.stamp.r] = h.stamp.n;
            heldOps.splice(i, 1);
            heldIds.delete(h.id);
            applied.push(h);
            progress = true;
            break;
          }
        }
      }
      return applied;
    },
    held: () => [...heldOps],
  };
}
