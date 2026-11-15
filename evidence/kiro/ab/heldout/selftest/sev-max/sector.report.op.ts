// Self-test mutant: max over every report ever (a re-inspection can never lower it). Must FAIL.
const O = ['none', 'minor', 'major', 'critical'];
type S = { v?: Record<string, number> };
export default { name: 'sector.report', merge: 'commutes', intent: { kind: 'max', field: 'severity', order: O },
  apply: (s: S, op: { target: string; payload: { severity: string } }): S => ({ ...s, v: { ...(s.v ?? {}), [op.target]: Math.max(s.v?.[op.target] ?? 0, O.indexOf(op.payload.severity)) } }) };
export const reportPayload = (_s: S, _t: string, severity: string) => ({ severity });
export const severityOf = (s: S, t: string) => O[s.v?.[t] ?? 0];
