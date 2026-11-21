import { describe, expect, it } from 'vitest';
import type { Op } from '../../../../skeleton/src/core/types.ts';
import type { Severity } from '../sectors.ts';
import { applyNeedOp, applySeverityOp, needInvariant, present, severityInvariant, severityOf, type ReportPayload } from './sector.state.ts';

function mk<P>(r: string, n: number, l: number, deps: Record<string, number>, payload: P, target = 'C3'): Op<P> {
  return { id: `${r}:${n}`, op: 'x', target, payload, stamp: { l, r, n }, deps };
}
const rep = (r: string, n: number, l: number, severity: Severity, deps: Record<string, number> = {}) =>
  mk<ReportPayload>(r, n, l, deps, { severity });
const clear = (r: string, n: number, l: number, deps: Record<string, number>) => mk(r, n, l, deps, {});

describe('severityOf', () => {
  it('is the max of several reports', () => {
    expect(severityOf([rep('a', 1, 1, 'safe'), rep('b', 1, 1, 'unsafe'), rep('c', 1, 1, 'damaged')], [])).toBe('unsafe');
  });
  it('a later, lower report does not hide a higher one it has seen', () => {
    const hi = rep('a', 1, 1, 'unsafe');
    expect(severityOf([hi, rep('a', 2, 2, 'safe', { a: 1 })], [])).toBe('unsafe');
  });
  it('a clear that saw a report removes it', () => {
    const r = rep('a', 1, 1, 'unsafe');
    expect(severityOf([r], [clear('b', 1, 2, { a: 1 })])).toBeUndefined();
  });
  it('a concurrent report survives the clear', () => {
    const seen = rep('a', 1, 1, 'damaged');
    const concurrent = rep('b', 1, 1, 'unsafe');
    expect(severityOf([seen, concurrent], [clear('c', 1, 2, { a: 1 })])).toBe('unsafe');
  });
  it('a report made after the clear is kept', () => {
    const old = rep('a', 1, 1, 'unsafe');
    const c = clear('b', 1, 2, { a: 1 });
    const after = rep('a', 2, 3, 'safe', { a: 1, b: 1 });
    expect(severityOf([old, after], [c])).toBe('safe');
  });
  it('all cleared gives undefined', () => {
    const r1 = rep('a', 1, 1, 'damaged');
    const r2 = rep('b', 1, 1, 'unsafe');
    expect(severityOf([r1, r2], [clear('c', 1, 2, { a: 1, b: 1 })])).toBeUndefined();
  });
  it('ignores clears of another target', () => {
    const r = rep('a', 1, 1, 'unsafe');
    expect(severityOf([r], [mk('b', 1, 2, { a: 1 }, {}, 'D1')])).toBe('unsafe');
  });
  it('duplicates and order do not change it', () => {
    const r1 = rep('a', 1, 1, 'damaged');
    const r2 = rep('b', 1, 1, 'unsafe');
    const c = clear('c', 1, 2, { a: 1 });
    const ops = [r1, r2, c];
    const fold = (order: number[]) => {
      let s = {};
      for (const i of order) {
        const o = ops[i]!;
        s = applySeverityOp(s, o as Op<ReportPayload>, i === 2 ? 'clear' : 'report');
      }
      return (s as { severity: Record<string, Severity | undefined> }).severity['C3'];
    };
    expect(fold([0, 1, 2])).toBe('unsafe');
    expect(fold([2, 1, 0])).toBe('unsafe');
    expect(fold([1, 2, 0, 2, 1, 0, 0])).toBe('unsafe');
  });
});

describe('present and applyNeedOp', () => {
  it('an unneed that observed the add removes it; a concurrent one does not', () => {
    const a = mk('a', 1, 1, {}, { need: 'water' });
    const seen = mk('b', 1, 2, { a: 1 }, { need: 'water' });
    const conc = mk('c', 1, 1, {}, { need: 'water' });
    expect(present([{ need: 'water', op: a }], [{ need: 'water', op: seen }])).toEqual([]);
    expect(present([{ need: 'water', op: a }], [{ need: 'water', op: conc }])).toEqual(['water']);
  });
  it('applyNeedOp is idempotent and sorted', () => {
    const o1 = mk('a', 1, 1, {}, { need: 'water' });
    const o2 = mk('a', 2, 2, { a: 1 }, { need: 'food' });
    let s = applyNeedOp({}, o1, 'add');
    s = applyNeedOp(applyNeedOp(s, o2, 'add'), o2, 'add');
    expect(s.needs?.['C3']).toEqual(['food', 'water']);
  });
});

describe('severityInvariant and needInvariant', () => {
  it('accept an empty state', () => {
    expect(severityInvariant({})).toBe(true);
    expect(needInvariant({})).toBe(true);
  });
  it('severityInvariant names a report with an unknown severity', () => {
    const r = rep('a', 1, 1, 'bogus' as Severity);
    expect(severityInvariant({ reports: { [r.id]: r } })).toBe('report a:1 has an unknown severity');
    expect(severityInvariant({ reports: { [r.id]: rep('a', 1, 1, 'safe') } })).toBe(true);
  });
  it('needInvariant names a non-string need among adds and among removes', () => {
    const bad = mk('a', 1, 1, {}, { need: 5 as unknown as string });
    expect(needInvariant({ needAdds: { [bad.id]: bad } })).toBe('op a:1 has a non-string need');
    expect(needInvariant({ needRemoves: { [bad.id]: bad } })).toBe('op a:1 has a non-string need');
    const ok = mk('a', 2, 1, {}, { need: 'water' });
    expect(needInvariant({ needAdds: { [ok.id]: ok }, needRemoves: { [ok.id]: ok } })).toBe(true);
  });
});
