// Self-test: plain qty += by (correct under the causal buffer's exactly-once delivery; must PASS).
type S = { q?: Record<string, number> };
export default { name: 'item.adjustQty', merge: 'commutes', intent: { kind: 'delta', field: 'qty' },
  apply: (s: S, op: { target: string; payload: { by: number } }): S => ({ ...s, q: { ...(s.q ?? {}), [op.target]: (s.q?.[op.target] ?? 0) + op.payload.by } }) };
export const adjustQtyPayload = (_s: S, _t: string, by: number) => ({ by });
export const qtyOf = (s: S, t: string) => s.q?.[t] ?? 0;
