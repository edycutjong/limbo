// Scorer self-test only: reference sector.report (max over the reports no one has seen superseded).
type Rep = { sev: string; r: string; n: number; deps: Record<string, number> };
type S = { rep?: Record<string, Record<string, Rep>> };
const ORDER = ['none', 'minor', 'major', 'critical'];
const def = {
  name: 'sector.report', merge: 'commutes', intent: { kind: 'max', field: 'severity', order: ORDER },
  apply(s: S, op: { id: string; target: string; payload: { severity: string }; stamp: { r: string; n: number }; deps: Record<string, number> }): S {
    const e: Rep = { sev: op.payload.severity, r: op.stamp.r, n: op.stamp.n, deps: op.deps };
    return { ...s, rep: { ...(s.rep ?? {}), [op.target]: { ...(s.rep?.[op.target] ?? {}), [op.id]: e } } };
  },
};
export default def;
export const reportPayload = (_s: S, _t: string, severity: string) => ({ severity });
export const severityOf = (s: S, t: string) => {
  const all = Object.values(s.rep?.[t] ?? {});
  const front = all.filter((x) => !all.some((y) => y !== x && (y.deps[x.r] ?? 0) >= x.n));
  return ORDER[Math.max(0, ...front.map((x) => ORDER.indexOf(x.sev)))];
};
