import { describe, expect, it } from 'vitest';
import type { Op } from '../../../../skeleton/src/core/types.ts';
import def, { reportPayload, severityOf } from './sector.report.op.ts';

const mk = (r: string, n: number, l: number, deps: Record<string, number>, severity: string): Op => ({
  id: `${r}:${n}`,
  op: 'sector.report',
  target: 's1',
  payload: reportPayload({}, 's1', severity as never),
  stamp: { l, r, n },
  deps,
});
const run = (ops: Op[]) => ops.reduce<unknown>((s, o) => def.apply!(s, o), {});

describe('sector.report', () => {
  const a = mk('a', 1, 1, {}, 'critical');
  const b = mk('b', 1, 1, {}, 'minor');

  it('shows none for a never-reported sector', () => {
    expect(severityOf({}, 's1')).toBe('none');
  });

  it('shows the reported severity', () => {
    expect(severityOf(run([b]), 's1')).toBe('minor');
  });

  it('concurrent reports show the more severe, in either order', () => {
    expect(severityOf(run([a, b]), 's1')).toBe('critical');
    expect(severityOf(run([b, a]), 's1')).toBe('critical');
  });

  it('a re-inspection that saw the earlier reports can lower severity', () => {
    const re = mk('c', 1, 2, { a: 1, b: 1 }, 'minor');
    for (const order of [[a, b, re], [re, b, a], [b, re, a]]) expect(severityOf(run(order), 's1')).toBe('minor');
  });

  it('a re-inspection only covering one report does not hide the concurrent one', () => {
    const re = mk('c', 1, 2, { b: 1 }, 'none');
    expect(severityOf(run([a, b, re]), 's1')).toBe('critical');
  });

  it('is idempotent and does not mutate its input', () => {
    const s0 = run([a]);
    const snap = JSON.stringify(s0);
    const s1 = def.apply!(s0, a);
    expect(JSON.stringify(s0)).toBe(snap);
    expect(severityOf(s1, 's1')).toBe('critical');
    expect(def.invariant!(s1)).toBe(true);
  });
});
