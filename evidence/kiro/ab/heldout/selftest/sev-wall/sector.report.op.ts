// Self-test mutant: wall-clock LWW (each replica's own Date.now). Must FAIL.
type S = { v?: Record<string, { sev: string; at: number }> };
export default { name: 'sector.report', merge: 'causal-lww', intent: { kind: 'max', field: 'severity', order: [] },
  apply: (s: S, op: { target: string; payload: { severity: string } }): S => {
    const at = Date.now(); const c = s.v?.[op.target];
    return !c || at >= c.at ? { ...s, v: { ...(s.v ?? {}), [op.target]: { sev: op.payload.severity, at } } } : s;
  } };
export const reportPayload = (_s: S, _t: string, severity: string) => ({ severity });
export const severityOf = (s: S, t: string) => s.v?.[t]?.sev ?? 'none';
