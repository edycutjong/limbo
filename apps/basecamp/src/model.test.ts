// Model tests (task 6): expense fold, claims with units, lifeInfo, values. Hand-built causal histories.
import { describe, expect, it } from 'vitest';
import type { Op } from '../../../skeleton/src/core/types.ts';
import { materialize } from './model.ts';

function op(r: string, n: number, l: number, deps: Record<string, number>, name: string, target: string, payload: unknown): Op {
  return { id: `${r}:${n}`, op: name, target, payload, stamp: { l, r, n }, deps };
}

const shuffles = <T>(xs: T[]): T[][] => {
  // fixed shuffles: reverse, rotations
  const out: T[][] = [xs, [...xs].reverse()];
  for (let i = 1; i < xs.length; i++) out.push([...xs.slice(i), ...xs.slice(0, i)]);
  return out;
};

const addExpense = (members: string[], amountCents = 2500) =>
  op('s', 1, 1, {}, 'expense.add', 'e', { label: 'Gas', amountCents, payer: 'sari', members });

describe('expense fold', () => {
  it('G20: 2500 over three members gives 834 / 833 / 833', () => {
    const e = materialize([addExpense(['sari', 'budi', 'dewi'])]).expenses.e!;
    expect(e.shares).toEqual({ budi: 834, dewi: 833, sari: 833 });
    expect(e.unallocated).toBe(0);
  });

  it('G21: no members leaves the whole amount unallocated', () => {
    const e = materialize([addExpense([])]).expenses.e!;
    expect(e.shares).toEqual({});
    expect(e.unallocated).toBe(2500);
  });

  it('concurrent add of Dewi and set to 2600 gives four members, 650 each, in every order', () => {
    const ops = [
      addExpense(['sari', 'budi', 'citra'], 1200),
      op('a', 1, 2, { s: 1 }, 'expense.addMember', 'e', { member: 'dewi' }),
      op('b', 1, 2, { s: 1 }, 'expense.setAmount', 'e', { amountCents: 2600 }),
    ];
    const first = JSON.stringify(materialize(ops).expenses);
    for (const o of shuffles(ops)) {
      const e = materialize(o).expenses.e!;
      expect(JSON.stringify(materialize(o).expenses)).toBe(first);
      expect(e.members).toEqual(['budi', 'citra', 'dewi', 'sari']);
      expect(Object.values(e.shares)).toEqual([650, 650, 650, 650]);
      expect(Object.values(e.shares).reduce((a, b) => a + b, 0)).toBe(2600);
      expect(e.values).toEqual([]);
    }
  });

  it('concurrent amounts list both values', () => {
    const e = materialize([
      addExpense(['sari']),
      op('a', 1, 2, { s: 1 }, 'expense.setAmount', 'e', { amountCents: 100 }),
      op('b', 1, 2, { s: 1 }, 'expense.setAmount', 'e', { amountCents: 200 }),
    ]).expenses.e!;
    expect(e.values).toEqual([
      { by: 'a', value: 100 },
      { by: 'b', value: 200 },
    ]);
    expect(e.amountCents).toBe(200);
  });

  it('an expense target with no expense.add is absent', () => {
    const s = materialize([op('a', 1, 1, {}, 'expense.setAmount', 'e', { amountCents: 5 })]);
    expect(s.expenses).toEqual({});
  });
});

const item = (units = 1) => op('s', 1, 1, {}, 'item.add', 'i', { name: 'gas', key: 'a0', units });
const claim = (r: string, who: string) => op(r, 1, 2, { s: 1 }, 'item.claim', 'i', { who });

describe('claims with units', () => {
  it('units 2 and two claims give two winners and no loser', () => {
    const it = materialize([item(2), claim('a', 'sari'), claim('b', 'budi')]).items.i!;
    expect(it.claims.winners.map((w) => w.who)).toEqual(['sari', 'budi']);
    expect(it.claims.losers).toEqual([]);
    expect(it.winners).toEqual(['sari', 'budi']);
  });

  it('units 1 and two claims give a loser, with op id and stamp', () => {
    const it = materialize([item(1), claim('a', 'sari'), claim('b', 'budi')]).items.i!;
    expect(it.claims.winners).toEqual([{ who: 'sari', op: 'a:1', stamp: { l: 2, r: 'a', n: 1 } }]);
    expect(it.claims.losers.map((l) => l.who)).toEqual(['budi']);
    expect(it.losers).toEqual(['budi']);
  });
});

describe('lifeInfo and values', () => {
  it('names the active deleter and the resurrecting editor', () => {
    const it = materialize([
      item(),
      op('a', 1, 2, { s: 1 }, 'item.tick', 'i', { ticked: true }),
      op('b', 1, 2, { s: 1 }, 'item.delete', 'i', {}),
    ]).items.i!;
    expect(it.life).toBe('twin');
    expect(it.lifeInfo).toEqual({ deletedBy: ['b'], editedBy: [{ by: 'a', kind: 'tick', op: 'a:1' }] });
  });

  it('has no lifeInfo while alive', () => {
    expect(materialize([item()]).items.i!.lifeInfo).toBeUndefined();
  });

  it('values lists both names on a concurrent rename, and nothing otherwise', () => {
    const ops = [
      item(),
      op('a', 1, 2, { s: 1 }, 'item.rename', 'i', { name: 'stove' }),
      op('b', 1, 2, { s: 1 }, 'item.rename', 'i', { name: 'burner' }),
    ];
    const it = materialize(ops).items.i!;
    expect(it.values.name).toEqual([
      { by: 'a', value: 'stove' },
      { by: 'b', value: 'burner' },
    ]);
    expect(it.fieldTwins).toEqual(['name']);
    expect(it.values.ticked).toEqual([]);
    expect(materialize([item()]).items.i!.values.name).toEqual([]);
  });
});
