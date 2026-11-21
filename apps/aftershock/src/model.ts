// AFTERSHOCK model: folds an op set into sector views. Pure; reads only causal context (stamp, deps).
// Convergence of this fold is "measured, property-tested" by the goldens and the op properties.
import { causalBuffer, compareStamp, covers } from '../../../skeleton/src/core/causal.ts';
import { causalLww } from '../../../skeleton/src/core/merges.ts';
import type { Op } from '../../../skeleton/src/core/types.ts';
import { ROSTER, authorOf } from './members.ts';
import { present, severityOf, type NeedAdd, type NeedPayload, type ReportPayload } from './ops/sector.state.ts';
import type { Severity } from './sectors.ts';

export interface CountEntry {
  who: string;
  value: number;
  /** Frontier values, only while this surveyor's count is twinned (empty otherwise). Ascending stamp. */
  values: { by: string; value: number }[];
}

export interface Sector {
  id: string;
  severity: Severity | undefined;
  /** Reports no clear has covered. */
  reports: number;
  /** Per surveyor, roster order first, then other ids by UTF-16 code unit. Targets without `#` are not listed. */
  counts: CountEntry[];
  /** Sum of every surveyor's current count (a target without `#` counts under who = ''). */
  total: number;
  needs: string[];
  note: string | undefined;
  /** Frontier notes, only while the note is twinned (empty otherwise). Ascending stamp. */
  noteValues: { by: string; value: string }[];
}

export interface State {
  sectors: Record<string, Sector>;
}

const byStamp = (a: Op, b: Op): number => compareStamp(a.stamp, b.stamp);

/** Frontier values of a register, only when twinned: winner and twins, ascending stamp. */
function frontier<P, V>(r: { winner: Op<P> | undefined; twins: Op<P>[] }, value: (p: P) => V): { by: string; value: V }[] {
  if (r.winner === undefined || r.twins.length === 0) return [];
  return [r.winner, ...r.twins].sort(byStamp).map((o) => ({ by: authorOf(o), value: value(o.payload) }));
}

const sectorOf = (target: string): string => target.split('#')[0]!;
const whoOf = (target: string): string => {
  const i = target.indexOf('#');
  return i < 0 ? '' : target.slice(i + 1);
};

const rosterRank = (who: string): number => {
  const i = (ROSTER as readonly string[]).indexOf(who);
  return i < 0 ? ROSTER.length : i;
};

function sectorFold(id: string, group: Op[]): Sector {
  const reports = group.filter((o) => o.op === 'sector.report') as Op<ReportPayload>[];
  const clears = group.filter((o) => o.op === 'sector.clear');

  const byWho = new Map<string, Op<{ count: number }>[]>();
  for (const o of group.filter((o) => o.op === 'sector.count') as Op<{ count: number }>[]) {
    const who = whoOf(o.target);
    const list = byWho.get(who);
    if (list) list.push(o);
    else byWho.set(who, [o]);
  }
  const counts: CountEntry[] = [];
  let total = 0;
  for (const [who, writes] of byWho) {
    const r = causalLww(writes);
    const value = r.value!.count; // writes is never empty, so the join always has a winner
    total += value;
    if (who !== '') counts.push({ who, value, values: frontier(r, (p) => p.count) });
  }
  counts.sort((a, b) => rosterRank(a.who) - rosterRank(b.who) || (a.who < b.who ? -1 : a.who > b.who ? 1 : 0));

  const needOps = (name: string): NeedAdd[] =>
    (group.filter((o) => o.op === name) as Op<NeedPayload>[]).map((o) => ({ need: o.payload.need, op: o }));
  const note = causalLww(group.filter((o) => o.op === 'sector.note') as Op<{ note: string }>[]);

  return {
    id,
    severity: severityOf(reports, clears),
    reports: reports.filter((r) => !clears.some((c) => covers(c, r))).length,
    counts,
    total,
    needs: present(needOps('sector.need'), needOps('sector.unneed')),
    note: note.value?.note,
    noteValues: frontier(note, (p) => p.note),
  };
}

/** Apply ops through a fresh causal buffer (any order, duplicates ignored), then fold per sector. */
export function materialize(ops: readonly Op[]): State {
  const buf = causalBuffer();
  const applied: Op[] = [];
  for (const o of ops) applied.push(...buf.offer(o));

  const bySector = new Map<string, Op[]>();
  for (const o of applied) {
    const id = sectorOf(o.target);
    const list = bySector.get(id);
    if (list) list.push(o);
    else bySector.set(id, [o]);
  }

  const sectors: Record<string, Sector> = {};
  for (const id of [...bySector.keys()].sort()) sectors[id] = sectorFold(id, bySector.get(id)!);
  return { sectors };
}
