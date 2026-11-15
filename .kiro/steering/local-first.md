---
inclusion: always
---
# The op contract

```ts
type ReplicaId = string;                              // random at creation, never inside a reducer; the in-page pair uses fixed ids `a` / `b`
type Stamp = { l: number; r: ReplicaId; n: number };  // l = Lamport counter, n = per-replica counter; total order by (l, r, n)
type VV = Record<ReplicaId, number>;                  // version vector: highest contiguous n applied per replica
interface Op<P = unknown> { id: string /* `${r}:${n}` */; op: string; target: string; payload: P; stamp: Stamp; deps: VV }
type Intent =
  | { kind: 'set'; field: string }                    // field := value (ticks are this, never a toggle)
  | { kind: 'delta'; field: string }                  // field += n (counts, quantities)
  | { kind: 'add-remove'; field: string }             // set membership; an add concurrent with a remove survives
  | { kind: 'max'; field: string; order: string[] }   // monotone until an observing clear (severity)
  | { kind: 'claim' } | { kind: 'life' } | { kind: 'split' } | { kind: 'move' } | { kind: 'create' };
type Merge = 'commutes' | 'causal-lww' | 'resurrect' | 'claim-one' | 'sum-split' | 'ordered-move';
interface OpDef<S, P> { name: string; merge: Merge; intent: Intent; apply?: (s: S, op: Op<P>) => S; invariant?: (s: S) => true | string }
```

Creating an op (outside any reducer): `l = 1 + max(l seen)`, `n = ++counter`, `deps = current VV`.
`covers(x, y)` iff `x.deps[y.stamp.r] >= y.stamp.n`. x and y are concurrent iff neither covers the other.
Stamps compare by `l`, then `r` (UTF-16 code-unit order, never `localeCompare`), then `n`.
Among concurrent ops the stamp order is a deterministic tie-break, not "who was first".

## Rules

1. No wall clock, randomness, locale or replica-local state in a reducer. `Date.now`, `new Date`, `performance.now`, `Math.random`, `crypto.randomUUID`, `toLocale*` are banned in op files. Use causal context (`deps`, `stamp`) only.
2. Every op either `commutes` (and ships a property proving it) or names a rule, AND declares its `intent`. The intent must match the op's entry in `kit/props/intents.json`.
3. LWW is a choice, not a default. Write the intent in one sentence first ("two people adding a canister offline must both count").
4. Never toggle. Set an explicit value.
5. Money is integer cents. Splits use the `sum-split` rule.
6. `apply` must be idempotent.
7. A conflict the user should see becomes a twin, never a silent drop.

Wording: convergence is "measured, property-tested", never "proven" or "guaranteed".

Merge implementations: #[[file:skeleton/src/core/merges.ts]] (exists after the merge-kit spec).
