// Shared sector state for sector.report, sector.clear (severity) and sector.need, sector.unneed (needs). Not an op file.
// Severity is a max-lattice with an observing clear: the value is the highest report that no clear has seen.
// Needs are an add-wins set: a need is present iff some add of it is not covered by an unneed of it.
// Both are pure functions of the op set (ops kept by id), so order and duplicates cannot change them.
import { covers } from '../../../../skeleton/src/core/causal.ts';
import type { Op } from '../../../../skeleton/src/core/types.ts';
import { SEVERITIES, type Severity } from '../sectors.ts';

export interface ReportPayload {
  severity: Severity;
}
export type ClearPayload = Record<string, never>;

export interface SeverityState {
  reports?: Record<string, Op<ReportPayload>>;
  clears?: Record<string, Op<ClearPayload>>;
  /** Derived, by target. */
  severity?: Record<string, Severity | undefined>;
}

const rank = (s: unknown): number => SEVERITIES.indexOf(s as Severity);

/**
 * Highest severity among the reports of one target that no clear of that target covers.
 * `undefined` when there are none. `covers(c, r)` means the clear had applied the report when it was made,
 * so a concurrent report survives and a later one is never covered.
 */
export function severityOf(
  reports: readonly Op<ReportPayload>[],
  clears: readonly Op<unknown>[],
): Severity | undefined {
  let best = -1;
  for (const r of reports) {
    if (clears.some((c) => c.target === r.target && covers(c, r))) continue;
    best = Math.max(best, rank(r.payload.severity));
  }
  return best < 0 ? undefined : SEVERITIES[best];
}

/** Record one severity op by id and re-derive the severity of its target. */
export function applySeverityOp(s: SeverityState, op: Op<ReportPayload | ClearPayload>, kind: 'report' | 'clear'): SeverityState {
  const reports = kind === 'report' ? { ...(s.reports ?? {}), [op.id]: op as Op<ReportPayload> } : (s.reports ?? {});
  const clears = kind === 'clear' ? { ...(s.clears ?? {}), [op.id]: op as Op<ClearPayload> } : (s.clears ?? {});
  const of = <P>(m: Record<string, Op<P>>) => Object.values(m).filter((o) => o.target === op.target);
  return { ...s, reports, clears, severity: { ...(s.severity ?? {}), [op.target]: severityOf(of(reports), of(clears)) } };
}

/** Every recorded report carries a known severity. */
export function severityInvariant(s: SeverityState): true | string {
  for (const r of Object.values(s.reports ?? {})) {
    if (rank(r.payload.severity) < 0) return `report ${r.id} has an unknown severity`;
  }
  return true;
}

export interface NeedPayload {
  need: string;
}
export interface NeedAdd {
  need: string;
  op: Op;
}

/** Needs present (sorted by UTF-16 code unit, no duplicates). An add concurrent with an unneed survives. */
export function present(adds: readonly NeedAdd[], removes: readonly NeedAdd[]): string[] {
  const out = new Set<string>();
  for (const a of adds) {
    if (!removes.some((r) => r.need === a.need && covers(r.op, a.op))) out.add(a.need);
  }
  return [...out].sort();
}

export interface NeedOpsState {
  needAdds?: Record<string, Op<NeedPayload>>;
  needRemoves?: Record<string, Op<NeedPayload>>;
  needs?: Record<string, string[]>;
}

/** Record one need op by id and re-derive the present needs of its target. */
export function applyNeedOp(s: NeedOpsState, op: Op<NeedPayload>, kind: 'add' | 'remove'): NeedOpsState {
  const needAdds = kind === 'add' ? { ...(s.needAdds ?? {}), [op.id]: op } : (s.needAdds ?? {});
  const needRemoves = kind === 'remove' ? { ...(s.needRemoves ?? {}), [op.id]: op } : (s.needRemoves ?? {});
  const of = (m: Record<string, Op<NeedPayload>>) =>
    Object.values(m).filter((o) => o.target === op.target).map((o) => ({ need: o.payload.need, op: o }));
  return { ...s, needAdds, needRemoves, needs: { ...(s.needs ?? {}), [op.target]: present(of(needAdds), of(needRemoves)) } };
}

/** Every recorded need is a string. */
export function needInvariant(s: NeedOpsState): true | string {
  for (const o of [...Object.values(s.needAdds ?? {}), ...Object.values(s.needRemoves ?? {})]) {
    if (typeof o.payload.need !== 'string') return `op ${o.id} has a non-string need`;
  }
  return true;
}
