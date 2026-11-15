// The op contract (steering: local-first.md). Types only.

export type ReplicaId = string;
/** l = Lamport counter, n = per-replica counter. Total order by (l, r, n). */
export type Stamp = { l: number; r: ReplicaId; n: number };
/** Highest contiguous n applied per replica. */
export type VV = Record<ReplicaId, number>;

export interface Op<P = unknown> {
  id: string; // `${r}:${n}`
  op: string;
  target: string;
  payload: P;
  stamp: Stamp;
  deps: VV;
}

export type Intent =
  | { kind: 'set'; field: string }
  | { kind: 'delta'; field: string }
  | { kind: 'add-remove'; field: string }
  | { kind: 'max'; field: string; order: string[] }
  | { kind: 'claim' }
  | { kind: 'life' }
  | { kind: 'split' }
  | { kind: 'move' }
  | { kind: 'create' };

export type Merge = 'commutes' | 'causal-lww' | 'resurrect' | 'claim-one' | 'sum-split' | 'ordered-move';

export interface OpDef<S = unknown, P = unknown> {
  name: string;
  merge: Merge;
  intent: Intent;
  apply?: (s: S, op: Op<P>) => S;
  invariant?: (s: S) => true | string;
}
