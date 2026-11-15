// Self-test mutant: Lamport LWW on severity (a concurrent lower report can win). Must FAIL.
type S = { v?: Record<string, { sev: string; l: number; r: string }> };
export default { name: 'sector.report', merge: 'causal-lww', intent: { kind: 'max', field: 'severity', order: [] },
  apply: (s: S, op: { target: string; payload: { severity: string }; stamp: { l: number; r: string } }): S => {
    const c = s.v?.[op.target];
    const win = !c || op.stamp.l > c.l || (op.stamp.l === c.l && op.stamp.r > c.r);
    return win ? { ...s, v: { ...(s.v ?? {}), [op.target]: { sev: op.payload.severity, l: op.stamp.l, r: op.stamp.r } } } : s;
  } };
export const reportPayload = (_s: S, _t: string, severity: string) => ({ severity });
export const severityOf = (s: S, t: string) => s.v?.[t]?.sev ?? 'none';
