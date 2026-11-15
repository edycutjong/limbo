import { describe, expect, it } from 'vitest';
import { createOp, newReplica } from '../../../../skeleton/src/core/causal.ts';
import type { Op } from '../../../../skeleton/src/core/types.ts';
import type { Severity } from '../model.ts';
import def, { reportPayload, severityOf } from './sector.report.op.ts';

const run = (ops: Op[]) => ops.reduce((s, o) => def.apply!(s, o), {} as unknown);
const report = (r: ReturnType<typeof newReplica>, sector: string, sev: Severity, state: unknown = {}) =>
  createOp(r, def, sector, reportPayload(state, sector, sev)) as Op;
/** Make `to` aware of `op`, as the causal buffer would after applying it. */
const see = (to: ReturnType<typeof newReplica>, op: Op) => {
  to.vv[op.stamp.r] = op.stamp.n;
  to.maxL = Math.max(to.maxL, op.stamp.l);
};

describe('sector.report', () => {
  it('shows none for a never-reported sector', () => {
    expect(severityOf({}, 's1')).toBe('none');
  });

  it('shows a single report', () => {
    const a = newReplica('a');
    expect(severityOf(run([report(a, 's1', 'minor')]), 's1')).toBe('minor');
  });

  it('concurrent reports show the more severe, in either order', () => {
    const a = newReplica('a');
    const b = newReplica('b');
    const x = report(a, 's1', 'critical');
    const y = report(b, 's1', 'minor');
    expect(severityOf(run([x, y]), 's1')).toBe('critical');
    expect(severityOf(run([y, x]), 's1')).toBe('critical');
  });

  it('a re-inspection that saw the earlier report may lower severity', () => {
    const a = newReplica('a');
    const b = newReplica('b');
    const x = report(a, 's1', 'critical');
    see(b, x);
    const y = report(b, 's1', 'minor');
    expect(severityOf(run([x, y]), 's1')).toBe('minor');
  });

  it('a concurrent report does not lose to a lowering re-inspection', () => {
    const a = newReplica('a');
    const b = newReplica('b');
    const c = newReplica('c');
    const x = report(a, 's1', 'critical');
    see(b, x);
    const y = report(b, 's1', 'none');
    const z = report(c, 's1', 'major');
    for (const order of [[x, y, z], [x, z, y], [z, x, y]]) expect(severityOf(run(order), 's1')).toBe('major');
  });

  it('is idempotent and does not mutate its input', () => {
    const a = newReplica('a');
    const x = report(a, 's1', 'major');
    const s0 = run([]);
    const s1 = def.apply!(s0, x);
    expect(s0).toEqual({});
    expect(def.apply!(s1, x)).toBe(s1);
  });

  it('keeps sectors independent', () => {
    const a = newReplica('a');
    const s = run([report(a, 's1', 'major')]);
    expect(severityOf(s, 's2')).toBe('none');
  });
});
