---
inclusion: fileMatch
fileMatchPattern: ["**/ops/**", "skeleton/src/core/**"]
---
# Ops guide: four wrong ops

Each converges, and each converges on the wrong answer. Convergence alone does not catch them. The kit-owned intent properties do.

## 1. Toggle tick

Wrong:
```ts
apply: (s, op) => ({ ...s, ticked: !s.ticked })
```
Why: two people tick the same item offline. Both apply a flip, so the item ends unticked. Every replica agrees on that wrong value.
Caught by the `set` intent property: concurrent writes of the same value give that value.
Right:
```ts
// intent: set ticked. merge: causal-lww
apply: (s, op) => ({ ...s, ticked: op.payload.ticked })
```

## 2. Read-modify-write quantity

Wrong:
```ts
payload: { qty: seen + 1 }          // apply: s.qty = op.payload.qty
```
Why: two people each add one canister offline, both write `seen + 1`, and one add is lost.
Caught by the `delta` property: field = initial + sum of deltas.
Right:
```ts
// intent: delta qty. merge: commutes
payload: { by: 1 }                  // apply: s.qty += op.payload.by
```

## 3. `Date.now()` tiebreak

Wrong:
```ts
apply: (s, op) => (op.payload.at > s.at ? { ...s, v: op.payload.v, at: op.payload.at } : s)
```
Why: a replica with a slow clock makes a write that has seen another lose to it. Reducers must not read or carry wall clocks.
Caught by causal dominance under per-replica skewed clocks: a write that has seen another always beats it.
Right: compare `op.stamp` (Lamport `l`, then `r`, then `n`) and use `covers` so a later-seen write wins.

## 4. Float split

Wrong:
```ts
const share = amount / k            // floats
```
Why: shares drift from the total (for example 10.00 / 3 gives 3.33 x 3 = 9.99), so replicas agree on a total that is off.
Caught by the `split` property: sum of shares = amount, in integer cents.
Right:
```ts
const base = Math.floor(cents / k), rem = cents % k;
// first `rem` members (in code-unit order of id) get base + 1, the rest get base
```
