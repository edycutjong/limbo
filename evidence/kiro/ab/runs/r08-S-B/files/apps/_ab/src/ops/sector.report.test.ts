import { describe, expect, it } from 'vitest';
import type { Op } from '../../../../skeleton/src/core/types.ts';
import def, { reportPayload, severityOf } from './sector.report.op.ts';
import type { Severity } from '../model.ts';

let l = 0;
const mk = (r: string, n: number, severity: Severity, deps: Record<string, number> = {}): Op =>
  ({ id: `${r}:${n}`, op: 'sector.report', target: 's1', payload: reportPayload({}, 's1', severity), stamp: { l: ++l, r, n }, deps });
const run = (ops: Op[]) => ops.reduce((s, o) => def.apply!(s, o), {} as unknown);

describe('sector.report', () => {
  it('shows none for a never-reported sector', () => expect(severityOf({}, 's1')).toBe('none'));
  it('concurrent reports show the more severe, in either order', () => {
    const a = mk('a', 1, 'critical');
    const b = mk('b', 1, 'minor');
    expect(severityOf(run([a, b]), 's1')).toBe('critical');
    expect(severityOf(run([b, a]), 's1')).toBe('critical');
  });
  it('a re-inspection that saw the earlier report may lower it', () => {
    const a = mk('a', 1, 'critical');
    const b = mk('b', 1, 'minor', { a: 1 });
    expect(severityOf(run([a, b]), 's1')).toBe('minor');
  });
  it('apply is idempotent and does not mutate its input', () => {
    const a = mk('a', 1, 'major');
    const s0 = {};
    const s1 = def.apply!(s0, a);
    expect(s0).toEqual({});
    expect(def.apply!(s1, a)).toEqual(s1);
  });
});
