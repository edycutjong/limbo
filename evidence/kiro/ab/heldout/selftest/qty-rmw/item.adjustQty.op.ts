// Self-test mutant: read-modify-write (payload carries the new absolute qty; Lamport LWW). Must FAIL.
type W = { qty: number; l: number; r: string };
type S = { q?: Record<string, W> };
const qtyOf = (s: S, t: string) => s.q?.[t]?.qty ?? 0;
export default { name: 'item.adjustQty', merge: 'causal-lww', intent: { kind: 'delta', field: 'qty' },
  apply: (s: S, op: { target: string; payload: { qty: number }; stamp: { l: number; r: string } }): S => {
    const cur = s.q?.[op.target];
    const win = !cur || op.stamp.l > cur.l || (op.stamp.l === cur.l && op.stamp.r > cur.r);
    return win ? { ...s, q: { ...(s.q ?? {}), [op.target]: { qty: op.payload.qty, l: op.stamp.l, r: op.stamp.r } } } : s;
  } };
export const adjustQtyPayload = (s: S, t: string, by: number) => ({ qty: qtyOf(s, t) + by });
export { qtyOf };
