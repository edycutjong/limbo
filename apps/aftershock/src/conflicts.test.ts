// Conflict descriptor tests (task 9): the table of design §5 over hand-built causal histories.
import { describe, expect, it } from 'vitest';
import type { Op } from '../../../skeleton/src/core/types.ts';
import { describeConflicts, twinCount } from './conflicts.ts';
import { materialize } from './model.ts';

function op(r: string, n: number, l: number, deps: Record<string, number>, name: string, target: string, payload: unknown): Op {
  return { id: `${r}:${n}`, op: name, target, payload, stamp: { l, r, n }, deps };
}

const noteTwin = (sector: string, k = 1): Op[] => [
  op(`a#${k}`, 1, 1, {}, 'sector.note', sector, { note: 'cracked stairwell' }),
  op(`b#${k}`, 1, 1, {}, 'sector.note', sector, { note: 'gas smell' }),
];
// k picks a replica pair of its own, so counters stay contiguous (the causal buffer needs n-1 applied first).
const countTwin = (sector: string, who: string, k = 2): Op[] => [
  op(`a#${k}`, 1, 1, {}, 'sector.count', `${sector}#${who}`, { count: 2 }),
  op(`b#${k}`, 1, 1, {}, 'sector.count', `${sector}#${who}`, { count: 4 }),
];

describe('describeConflicts', () => {
  it('no sectors, no descriptors', () => {
    expect(describeConflicts(materialize([]))).toEqual([]);
  });

  it('twinned note: <sector>:note, causal-lww', () => {
    const d = describeConflicts(materialize(noteTwin('C3')));
    expect(d.map(({ id, target, rule }) => ({ id, target, rule }))).toEqual([{ id: 'C3:note', target: 'C3', rule: 'causal-lww' }]);
    expect(d[0]!.caption).not.toBe('');
  });

  it('twinned count: <sector>:count:<who>, causal-lww', () => {
    const d = describeConflicts(materialize(countTwin('C3', 'sari')));
    expect(d.map(({ id, target, rule }) => ({ id, target, rule }))).toEqual([{ id: 'C3:count:sari', target: 'C3', rule: 'causal-lww' }]);
  });

  it('equal concurrent notes and counts are not twins', () => {
    const ops = [
      op('a#1', 1, 1, {}, 'sector.note', 'C3', { note: 'same' }),
      op('b#1', 1, 1, {}, 'sector.note', 'C3', { note: 'same' }),
      op('a#1', 2, 2, { 'a#1': 1 }, 'sector.count', 'C3#sari', { count: 2 }),
      op('b#1', 2, 2, { 'b#1': 1 }, 'sector.count', 'C3#sari', { count: 2 }),
    ];
    expect(describeConflicts(materialize(ops))).toEqual([]);
  });

  it('a resolve that covers both writes clears the twin', () => {
    const resolve = op('a#1', 2, 2, { 'a#1': 1, 'b#1': 1 }, 'sector.note', 'C3', { note: 'gas smell' });
    expect(describeConflicts(materialize([...noteTwin('C3'), resolve]))).toEqual([]);
  });

  it('severity and needs produce nothing, even when concurrent', () => {
    const ops = [
      op('a#1', 1, 1, {}, 'sector.report', 'C3', { severity: 'damaged' }),
      op('b#1', 1, 1, {}, 'sector.report', 'C3', { severity: 'unsafe' }),
      op('a#1', 2, 2, { 'a#1': 1 }, 'sector.need', 'C3', { need: 'water' }),
      op('b#1', 2, 2, { 'b#1': 1 }, 'sector.unneed', 'C3', { need: 'water' }),
      op('b#1', 3, 3, { 'b#1': 2 }, 'sector.clear', 'C3', {}),
    ];
    expect(describeConflicts(materialize(ops))).toEqual([]);
  });

  it('twinCount equals the number of descriptors', () => {
    const ops = [...noteTwin('C3'), ...countTwin('C3', 'sari', 2), ...countTwin('D1', 'budi', 3)];
    const s = materialize(ops);
    expect(describeConflicts(s).length).toBe(3);
    expect(twinCount(s)).toBe(describeConflicts(s).length);
  });

  it('orders by (target, rule, id)', () => {
    const ops = [
      op('a#1', 1, 1, {}, 'sector.note', 'D1', { note: 'x' }),
      op('b#1', 1, 1, {}, 'sector.note', 'D1', { note: 'y' }),
      op('a#1', 2, 2, { 'a#1': 1 }, 'sector.count', 'C3#sari', { count: 1 }),
      op('b#1', 2, 2, { 'b#1': 1 }, 'sector.count', 'C3#sari', { count: 2 }),
      op('a#1', 3, 3, { 'a#1': 2 }, 'sector.count', 'C3#budi', { count: 1 }),
      op('b#1', 3, 3, { 'b#1': 2 }, 'sector.count', 'C3#budi', { count: 2 }),
      op('a#1', 4, 4, { 'a#1': 3 }, 'sector.note', 'C3', { note: 'p' }),
      op('b#1', 4, 4, { 'b#1': 3 }, 'sector.note', 'C3', { note: 'q' }),
    ];
    expect(describeConflicts(materialize(ops)).map((d) => d.id)).toEqual(['C3:count:budi', 'C3:count:sari', 'C3:note', 'D1:note']);
  });

  it('ids are stable and equal on two replicas built from the same ops in different orders', () => {
    const ops = [...noteTwin('C3'), ...countTwin('C3', 'sari', 2), ...countTwin('B2', 'rina', 3)];
    const x = describeConflicts(materialize(ops));
    const y = describeConflicts(materialize([...ops].reverse()));
    const z = describeConflicts(materialize([...ops.slice(2), ...ops.slice(0, 2), ...ops]));
    expect(x.length).toBe(3);
    expect(y).toEqual(x);
    expect(z).toEqual(x);
    expect(describeConflicts(materialize(ops))).toEqual(x);
  });
});
