import { describe, expect, it } from 'vitest';
import type { Op } from '../../../../skeleton/src/core/types.ts';
import type { Severity } from '../model.ts';
import def, { reportPayload, severityOf } from './sector.report.op.ts';

const mk = (r: string, n: number, l: number, severity: Severity, deps: Record<string, number> = {}, target = 's'): Op =>
  ({ id: `${r}:${n}`, op: 'sector.report', target, payload: reportPayload({}, target, severity), stamp: { l, r, n }, deps });
const run = (...ops: Op[]): unknown => ops.reduce((s, o) => def.apply!(s, o), {} as unknown);

describe('sector.report', () => {
  it('shows none for a sector never reported', () => {
    expect(severityOf({}, 's')).toBe('none');
  });
  it('shows the more severe of two concurrent reports, in either order', () => {
    const a = mk('a', 1, 1, 'critical');
    const b = mk('b', 1, 1, 'minor');
    expect(severityOf(run(a, b), 's')).toBe('critical');
    expect(severityOf(run(b, a), 's')).toBe('critical');
  });
  it('lets a re-inspection that saw the earlier report lower the severity', () => {
    const a = mk('a', 1, 1, 'critical');
    const b = mk('b', 1, 2, 'minor', { a: 1 });
    expect(severityOf(run(a, b), 's')).toBe('minor');
  });
  it('keeps a concurrent higher report over a re-inspection that did not see it', () => {
    const a = mk('a', 1, 1, 'critical');
    const b = mk('b', 1, 2, 'minor', { a: 1 });
    const c = mk('c', 1, 1, 'major');
    expect(severityOf(run(a, c, b), 's')).toBe('major');
  });
  it('is idempotent and does not mutate its input', () => {
    const a = mk('a', 1, 1, 'major');
    const s1 = run(a);
    const snap = JSON.stringify(s1);
    expect(JSON.stringify(def.apply!(s1, a))).toBe(snap);
    expect(JSON.stringify(s1)).toBe(snap);
  });
  it('keeps sectors separate', () => {
    expect(severityOf(run(mk('a', 1, 1, 'major', {}, 's1')), 's2')).toBe('none');
  });
});
