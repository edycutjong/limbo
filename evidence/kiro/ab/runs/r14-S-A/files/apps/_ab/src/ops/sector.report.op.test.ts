import { describe, expect, it } from 'vitest';
import { causalBuffer, createOp, newReplica, observe } from '../../../../skeleton/src/core/causal.ts';
import { simulate } from '../../../../skeleton/src/core/simulate.ts';
import type { Op } from '../../../../skeleton/src/core/types.ts';
import { SEVERITIES, type Severity } from '../model.ts';
import def, { reportPayload, severityOf } from './sector.report.op.ts';

const make = (r: string) => {
  const rep = newReplica(r);
  const buf = causalBuffer(rep.vv);
  return {
    report(state: unknown, sector: string, sev: Severity): Op {
      return createOp(rep, def, sector, reportPayload(state, sector, sev));
    },
    receive(op: Op) {
      for (const a of buf.offer(op)) observe(rep, a);
    },
  };
};
const run = (ops: Op[]) => ops.reduce((s, o) => def.apply!(s, o), {} as unknown);

describe('sector.report', () => {
  it('shows none for a sector never reported', () => {
    expect(severityOf({}, 'x')).toBe('none');
  });

  it('shows a single report', () => {
    const a = make('a');
    expect(severityOf(run([a.report({}, 's', 'major')]), 's')).toBe('major');
  });

  it('concurrent reports show the more severe, in either order', () => {
    const a = make('a');
    const b = make('b');
    const x = a.report({}, 's', 'minor');
    const y = b.report({}, 's', 'critical');
    expect(severityOf(run([x, y]), 's')).toBe('critical');
    expect(severityOf(run([y, x]), 's')).toBe('critical');
  });

  it('a re-inspection that saw the earlier report may lower it', () => {
    const a = make('a');
    const b = make('b');
    const x = a.report({}, 's', 'critical');
    b.receive(x);
    const y = b.report({}, 's', 'minor');
    expect(severityOf(run([x, y]), 's')).toBe('minor');
    expect(severityOf(run([y, x]), 's')).toBe('minor');
  });

  it('a concurrent lower report does not hide a higher one after a re-inspection', () => {
    const a = make('a');
    const b = make('b');
    const c = make('c');
    const x = a.report({}, 's', 'critical');
    b.receive(x);
    const lowered = b.report({}, 's', 'minor');
    const other = c.report({}, 's', 'major'); // concurrent with both
    expect(severityOf(run([x, lowered, other]), 's')).toBe('major');
    expect(severityOf(run([other, x, lowered]), 's')).toBe('major');
  });

  it('ignores duplicates and does not mutate its input', () => {
    const a = make('a');
    const x = a.report({}, 's', 'minor');
    const s1 = def.apply!({}, x);
    const snap = JSON.stringify(s1);
    const s2 = def.apply!(s1, x);
    expect(JSON.stringify(s1)).toBe(snap);
    expect(severityOf(s2, 's')).toBe('minor');
  });

  it('replicas converge under random concurrency, reordering and duplicates', () => {
    for (let seed = 1; seed <= 60; seed++) {
      const res = simulate({
        defs: [def],
        replicas: 3,
        seed,
        steps: 14,
        gen: (_d, rand) => ({ target: rand.pick(['s1', 's2']), payload: reportPayload({}, 's', rand.pick(SEVERITIES)) }),
      });
      expect(new Set(Object.values(res.states)).size).toBe(1);
    }
  });
});
