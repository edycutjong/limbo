import { describe, expect, it } from 'vitest';
import type { Op } from '../../../../skeleton/src/core/types.ts';
import type { Severity } from '../model.ts';
import def, { reportPayload, severityOf } from './sector.report.op.ts';

let n = 0;
function report(r: string, l: number, severity: Severity, deps: Record<string, number> = {}, target = 's1'): Op {
  n += 1;
  return { id: `${r}:${n}`, op: 'sector.report', target, payload: reportPayload({}, target, severity), stamp: { l, r, n }, deps };
}
const run = (...ops: Op[]): unknown => ops.reduce<unknown>((s, o) => def.apply!(s, o), {});

describe('sector.report', () => {
  it('shows none for a sector never reported (R2.4)', () => {
    expect(severityOf({}, 's1')).toBe('none');
  });

  it('shows a single report (R2.1)', () => {
    expect(severityOf(run(report('a', 1, 'minor')), 's1')).toBe('minor');
  });

  it('concurrent reports show the more severe, in either order (R2.2, R2.4)', () => {
    const x = report('a', 1, 'critical');
    const y = report('b', 2, 'minor'); // higher stamp, but did not see x
    expect(severityOf(run(x, y), 's1')).toBe('critical');
    expect(severityOf(run(y, x), 's1')).toBe('critical');
  });

  it('a re-inspection that saw the earlier report may lower it (R2.3)', () => {
    const x = report('a', 1, 'critical');
    const y = report('b', 2, 'minor', { [x.stamp.r]: x.stamp.n });
    expect(severityOf(run(x, y), 's1')).toBe('minor');
    expect(severityOf(run(y, x), 's1')).toBe('minor');
  });

  it('a concurrent report still counts next to a lowering re-inspection', () => {
    const x = report('a', 1, 'critical');
    const y = report('b', 2, 'none', { a: x.stamp.n });
    const z = report('c', 1, 'major');
    expect(severityOf(run(x, y, z), 's1')).toBe('major');
  });

  it('is idempotent and does not mutate its input', () => {
    const x = report('a', 1, 'major');
    const s1 = run(x);
    const frozen = JSON.stringify(s1);
    const s2 = def.apply!(s1, x);
    expect(JSON.stringify(s2)).toBe(frozen);
    expect(JSON.stringify(s1)).toBe(frozen);
  });

  it('keeps sectors separate', () => {
    const s = run(report('a', 1, 'major', {}, 's1'), report('a', 2, 'minor', {}, 's2'));
    expect([severityOf(s, 's1'), severityOf(s, 's2')]).toEqual(['major', 'minor']);
  });
});
