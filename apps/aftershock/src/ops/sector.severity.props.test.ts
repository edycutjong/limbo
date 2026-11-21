// Companion property for severity: sector.report and sector.clear run together.
// This covers what a per-op run of `sector.clear` cannot: a clear needs reports to act on, and a run that holds only
// clears (or only reports) never shows a clear meeting a concurrent report. Here `simulate` mixes both ops over a
// small pool of targets, and the kit `max` oracle (which reads raw `deps` and stamps only, not `severityOf`) checks
// every replica. A local `clearAll` variant, a clear that ignores `deps`, must fail the same oracle.
import { describe, expect, it } from 'vitest';
import { maxIntent } from '../../../../kit/props/intent/index.ts';
import { config } from '../../../../kit/props/config.ts';
import { canonical } from '../../../../skeleton/src/core/causal.ts';
import { simulate, type Rand } from '../../../../skeleton/src/core/simulate.ts';
import type { Op, OpDef } from '../../../../skeleton/src/core/types.ts';
import clearDef from './sector.clear.op.ts';
import reportDef from './sector.report.op.ts';
import { severityOf, type ReportPayload, type SeverityState } from './sector.state.ts';

const ORDER = ['safe', 'damaged', 'unsafe'] as const;
const TARGETS = ['A1', 'B2', 'C3'];

const gen = (def: OpDef, rand: Rand): { target: string; payload: unknown } => ({
  target: rand.pick(TARGETS),
  payload: def.name === 'sector.report' ? { severity: rand.pick(ORDER) } : {},
});

const oracle = (read: (s: SeverityState, target: string) => string | undefined) =>
  maxIntent({
    order: ORDER,
    report: (o) => (o.op === 'sector.report' ? (o.payload as ReportPayload).severity : undefined),
    isClear: (o) => o.op === 'sector.clear',
    read,
  });

/** Wrong variant: a clear removes every report on its target, whatever it had seen. */
const clearAll: OpDef<SeverityState, Record<string, never>> = {
  name: 'sector.clear',
  merge: 'commutes',
  intent: { kind: 'max', field: 'severity', order: [...ORDER] },
  apply: (s, op) => {
    const clears = { ...(s.clears ?? {}), [op.id]: op };
    const reports = s.reports ?? {};
    const live = Object.values(reports).filter((r) => r.target === op.target && !Object.values(clears).some((c) => c.target === r.target));
    return { ...s, clears, severity: { ...(s.severity ?? {}), [op.target]: severityOf(live, []) } };
  },
};

const run = (defs: OpDef[], i: number) =>
  simulate({ defs, replicas: config.replicas, seed: config.seed + i, steps: 14, gen: (d, r) => gen(d, r) });

function failures(defs: OpDef[]): number {
  const check = oracle((s, t) => s.severity?.[t]);
  let bad = 0;
  for (let i = 0; i < config.orderings; i++) {
    const res = run(defs, i);
    if (check.check(res, { def: defs[0]!, init: () => ({}) }) !== true) bad++;
  }
  return bad;
}

const mk = <P>(r: string, n: number, l: number, deps: Record<string, number>, payload: P): Op<P> => ({
  id: `${r}:${n}`,
  op: 'x',
  target: 'C3',
  payload,
  stamp: { l, r, n },
  deps,
});

describe('severity companion (sector.report + sector.clear)', () => {
  it('real ops satisfy the max oracle in every run', () => {
    expect(failures([reportDef, clearDef])).toBe(0);
  });

  it('the clearAll variant fails the oracle in at least one run', () => {
    expect(failures([reportDef, clearAll as unknown as OpDef])).toBeGreaterThan(0);
  });

  it('the runs contain a clear that meets a concurrent report', () => {
    let seen = 0;
    for (let i = 0; i < config.orderings && seen === 0; i++) {
      const { ops } = run([reportDef, clearDef], i);
      const cs = ops.filter((o) => o.op === 'sector.clear');
      const rs = ops.filter((o) => o.op === 'sector.report');
      if (cs.some((c) => rs.some((r) => r.target === c.target && (c.deps[r.stamp.r] ?? 0) < r.stamp.n && (r.deps[c.stamp.r] ?? 0) < c.stamp.n))) seen++;
    }
    expect(seen).toBeGreaterThan(0);
  });

  it('a clear that saw unsafe lowers the severity; a concurrent unsafe is not cleared', () => {
    const unsafe = mk<ReportPayload>('a', 1, 1, {}, { severity: 'unsafe' });
    const damaged = mk<ReportPayload>('b', 1, 1, {}, { severity: 'damaged' });
    const concurrentUnsafe = mk<ReportPayload>('c', 1, 1, {}, { severity: 'unsafe' });
    const clear = mk('b', 2, 2, { a: 1, b: 1 }, {});
    expect(severityOf([unsafe, damaged], [])).toBe('unsafe');
    expect(severityOf([unsafe, damaged], [clear])).toBeUndefined();
    expect(severityOf([unsafe, damaged, concurrentUnsafe], [clear])).toBe('unsafe');
    expect(canonical(severityOf([concurrentUnsafe, unsafe, damaged], [clear]))).toBe(canonical('unsafe'));
  });
});
