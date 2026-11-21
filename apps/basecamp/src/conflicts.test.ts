// Conflict descriptor tests (task 7). Hand-built causal histories.
import { describe, expect, it } from 'vitest';
import type { Op } from '../../../skeleton/src/core/types.ts';
import { describeConflicts, twinCount } from './conflicts.ts';
import { materialize } from './model.ts';

function op(r: string, n: number, l: number, deps: Record<string, number>, name: string, target: string, payload: unknown): Op {
  return { id: `${r}:${n}`, op: name, target, payload, stamp: { l, r, n }, deps };
}

const item = (target = 'i', n = 1) => op('s', n, n, n > 1 ? { s: n - 1 } : {}, 'item.add', target, { name: 'tent', key: 'a0', units: 1 });
const conflicts = (ops: Op[]) => describeConflicts(materialize(ops));

describe('describeConflicts', () => {
  it('no conflicts on a quiet history', () => {
    expect(conflicts([item()])).toEqual([]);
  });

  it('life twin: resurrect', () => {
    const c = conflicts([
      item(),
      op('a', 1, 2, { s: 1 }, 'item.tick', 'i', { ticked: true }),
      op('b', 1, 2, { s: 1 }, 'item.delete', 'i', {}),
    ]);
    expect(c.map((d) => [d.id, d.target, d.rule])).toEqual([['i:life', 'i', 'resurrect']]);
  });

  it('claim loser: one claim-one descriptor per loser', () => {
    const c = conflicts([
      item(),
      op('a', 1, 2, { s: 1 }, 'item.claim', 'i', { who: 'sari' }),
      op('b', 1, 2, { s: 1 }, 'item.claim', 'i', { who: 'budi' }),
    ]);
    expect(c.map((d) => [d.id, d.rule])).toEqual([['i:claim:budi', 'claim-one']]);
  });

  it('name and ticked field twins: causal-lww', () => {
    const c = conflicts([
      item(),
      op('a', 1, 2, { s: 1 }, 'item.rename', 'i', { name: 'x' }),
      op('b', 1, 2, { s: 1 }, 'item.rename', 'i', { name: 'y' }),
      op('a', 2, 3, { s: 1, a: 1 }, 'item.tick', 'i', { ticked: true }),
      op('b', 2, 3, { s: 1, b: 1 }, 'item.tick', 'i', { ticked: false }),
    ]);
    expect(c.map((d) => [d.id, d.rule])).toEqual([
      ['i:name', 'causal-lww'],
      ['i:ticked', 'causal-lww'],
    ]);
  });

  it('expense amount twin: causal-lww', () => {
    const c = conflicts([
      op('s', 1, 1, {}, 'expense.add', 'e', { label: 'Gas', amountCents: 2500, payer: 'sari', members: ['sari'] }),
      op('a', 1, 2, { s: 1 }, 'expense.setAmount', 'e', { amountCents: 100 }),
      op('b', 1, 2, { s: 1 }, 'expense.setAmount', 'e', { amountCents: 200 }),
    ]);
    expect(c.map((d) => [d.id, d.target, d.rule])).toEqual([['e:amount', 'e', 'causal-lww']]);
  });

  it('equal concurrent values are not twins', () => {
    expect(
      conflicts([
        item(),
        op('a', 1, 2, { s: 1 }, 'item.rename', 'i', { name: 'x' }),
        op('b', 1, 2, { s: 1 }, 'item.rename', 'i', { name: 'x' }),
      ]),
    ).toEqual([]);
  });

  it('ignores concurrent move twins', () => {
    const s = materialize([
      item(),
      op('a', 1, 2, { s: 1 }, 'item.move', 'i', { key: 'a1a' }),
      op('b', 1, 2, { s: 1 }, 'item.move', 'i', { key: 'a1b' }),
    ]);
    expect(s.items.i!.fieldTwins).toEqual(['pos']);
    expect(describeConflicts(s)).toEqual([]);
  });

  it('twinCount equals the number of descriptors', () => {
    const s = materialize([
      item(),
      op('a', 1, 2, { s: 1 }, 'item.tick', 'i', { ticked: true }),
      op('b', 1, 2, { s: 1 }, 'item.delete', 'i', {}),
      op('a', 2, 3, { s: 1, a: 1 }, 'item.claim', 'i', { who: 'sari' }),
      op('b', 2, 3, { s: 1, b: 1 }, 'item.claim', 'i', { who: 'budi' }),
    ]);
    expect(twinCount(s)).toBe(describeConflicts(s).length);
    expect(twinCount(s)).toBeGreaterThan(1);
  });

  it('ids are stable and equal across orders on two replicas', () => {
    const ops = [
      item(),
      item('j', 2),
      op('a', 1, 3, { s: 1 }, 'item.tick', 'i', { ticked: true }),
      op('b', 1, 3, { s: 1 }, 'item.delete', 'i', {}),
      op('a', 2, 4, { s: 2, a: 1 }, 'item.claim', 'j', { who: 'sari' }),
      op('b', 2, 4, { s: 2, b: 1 }, 'item.claim', 'j', { who: 'budi' }),
    ];
    const one = describeConflicts(materialize(ops));
    const two = describeConflicts(materialize([...ops].reverse()));
    expect(two).toEqual(one);
    expect(describeConflicts(materialize(ops))).toEqual(one);
    expect(one.map((d) => d.id)).toEqual(['i:life', 'j:claim:budi']);
  });
});
