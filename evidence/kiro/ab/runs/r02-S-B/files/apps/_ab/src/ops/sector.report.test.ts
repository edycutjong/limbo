import { describe, expect, it } from 'vitest';
import type { Op } from '../../../../skeleton/src/core/types.ts';
import type { Severity } from '../model.ts';
import def, { reportPayload, severityOf } from './sector.report.op.ts';

function report(r: string, n: number, l: number, severity: Severity, deps: Record<string, number> = {}, target = 's1'): Op {
  return { id: `${r}:${n}`, op: 'sector.report', target, payload: reportPayload({}, target, severity), stamp: { l, r, n }, deps };
}
const run = (ops: Op[]): unknown => ops.reduce((s, o) => def.apply!(s, o), {} as unknown);

describe('sector.report', () => {
  it('shows none for a sector never reported (R2.4)', () => {
    expect(severityOf({}, 's1')).toBe('none');
  });

  it('shows a single report (R2.1)', () => {
    expect(severityOf(run([report('a', 1, 1, 'major')]), 's1')).toBe('major');
  });

  it('concurrent reports show the more severe, in either order (R2.2, R2.4)', () => {
    const a = report('a', 1, 1, 'critical');
    const b = report('b', 1, 1, 'minor');
    expect(severityOf(run([a, b]), 's1')).toBe('critical');
    expect(severityOf(run([b, a]), 's1')).toBe('critical');
  });

  it('a re-inspection that saw the earlier report may lower it (R2.3)', () => {
    const a = report('a', 1, 1, 'critical');
    const b = report('b', 1, 2, 'minor', { a: 1 });
    expect(severityOf(run([a, b]), 's1')).toBe('minor');
    expect(severityOf(run([b, a]), 's1')).toBe('minor');
  });

  it('a concurrent report still counts next to a lowering re-inspection', () => {
    const a = report('a', 1, 1, 'critical');
    const b = report('b', 1, 2, 'minor', { a: 1 });
    const c = report('c', 1, 1, 'major');
    expect(severityOf(run([a, b, c]), 's1')).toBe('major');
  });

  it('is idempotent and does not mutate its input', () => {
    const a = report('a', 1, 1, 'major');
    const s0 = Object.freeze({});
    const s1 = def.apply!(s0, a);
    expect(s0).toEqual({});
    expect(def.apply!(s1, a)).toEqual(s1);
  });

  it('keeps sectors separate', () => {
    const s = run([report('a', 1, 1, 'major', {}, 's1'), report('a', 2, 2, 'minor', { a: 1 }, 's2')]);
    expect(severityOf(s, 's1')).toBe('major');
    expect(severityOf(s, 's2')).toBe('minor');
  });
});
