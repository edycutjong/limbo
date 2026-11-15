// Scorer self-test only (never given to either arm): reference adjustQty, one entry per op.
type S = { q?: Record<string, Record<string, number>> };
const def = {
  name: 'item.adjustQty', merge: 'commutes', intent: { kind: 'delta', field: 'qty' },
  apply(s: S, op: { id: string; target: string; payload: { by: number } }): S {
    return { ...s, q: { ...(s.q ?? {}), [op.target]: { ...(s.q?.[op.target] ?? {}), [op.id]: op.payload.by } } };
  },
};
export default def;
export const adjustQtyPayload = (_s: S, _t: string, by: number) => ({ by });
export const qtyOf = (s: S, t: string) => Object.values(s.q?.[t] ?? {}).reduce((a, b) => a + b, 0);
