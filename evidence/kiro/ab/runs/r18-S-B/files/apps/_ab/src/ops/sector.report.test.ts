import { describe, expect, it } from 'vitest';
import type { Op } from '../../../../skeleton/src/core/types.ts';
import def, { reportPayload, severityOf, type ReportPayload } from './sector.report.op.ts';
import type { Severity } from '../model.ts';

let seq = 0;
function mk(r: string, n: number, l: number, severity: Severity, deps: Record<string, number> = {}): Op<ReportPayload> {
  seq++;
  return { id: `${r}:${n}`, op: 'sector.report', target: 's1', payload: reportPayload({}, 's1', severity), stamp: { l, r, n }, deps };
}
const run = (...ops: Op<ReportPayload>[]) => ops.reduce((s, o) => def.apply!(s, o as Op), {} as unknown);

describe('sector.report', () => {
  it('shows none for a never-reported sector', () => {
    expect(severityOf({}, 's1')).toBe('none');
  });
  it('concurrent reports show the more severe, in either order', () => {
    const a = mk('a', 1, 1, 'major');
    const b = mk('b', 1, 1, 'minor');
    expect(severityOf(run(a, b), 's1')).toBe('major');
    expect(severityOf(run(b, a), 's1')).toBe('major');
  });
  it('a re-inspection that saw the earlier report may lower it', () => {
    const a = mk('a', 1, 1, 'critical');
    const b = mk('b', 1, 2, 'minor', { a: 1 });
    expect(severityOf(run(a, b), 's1')).toBe('minor');
    expect(severityOf(run(b, a), 's1')).toBe('minor');
  });
  it('a lowering report does not hide a concurrent severe report it did not see', () => {
    const a = mk('a', 1, 1, 'critical');
    const b = mk('b', 1, 2, 'minor', { a: 1 });
    const c = mk('c', 1, 1, 'major');
    expect(severityOf(run(a, b, c), 's1')).toBe('major');
  });
  it('apply is idempotent and does not mutate its input', () => {
    const a = mk('a', 1, 1, 'major');
    const s0 = run(a);
    const snap = JSON.stringify(s0);
    expect(JSON.stringify(def.apply!(s0, a as Op))).toBe(snap);
    expect(JSON.stringify(s0)).toBe(snap);
  });
});
