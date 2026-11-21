import { readFileSync } from 'node:fs';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { sumSplit } from '../../../skeleton/src/core/merges.ts';
import { authorOf, displayName, memberOfReplica } from './members.ts';
import { formatCents, parseCents } from './money.ts';

describe('parseCents', () => {
  it('accepts whole, one and two decimals, and a leading $', () => {
    expect(parseCents('26')).toBe(2600);
    expect(parseCents('26.5')).toBe(2650);
    expect(parseCents('26.50')).toBe(2650);
    expect(parseCents('$26.00')).toBe(2600);
  });
  it('rejects an amount too large to be a safe integer of cents', () => {
    expect(parseCents('9'.repeat(20))).toBeNull();
  });
  it('rejects three decimals, negatives, words and empty', () => {
    for (const bad of ['26.555', '-1', 'abc', '', '  ', '$', '1.', '.5']) expect(parseCents(bad)).toBeNull();
  });
});

describe('formatCents', () => {
  it('formats dollars and cents', () => {
    expect(formatCents(0)).toBe('$0.00');
    expect(formatCents(5)).toBe('$0.05');
    expect(formatCents(834)).toBe('$8.34');
    expect(formatCents(2600)).toBe('$26.00');
    expect(formatCents(100000)).toBe('$1000.00');
  });
  it('throws on a negative, fractional or non-finite amount', () => {
    for (const bad of [-1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, 2 ** 60]) expect(() => formatCents(bad)).toThrow(/bad amount/);
  });
  it('shares of sum-split over formatted cents add up to the amount', () => {
    for (const [cents, k] of [[1000, 3], [2500, 3], [1, 4], [0, 2]] as const) {
      const members = ['a', 'b', 'c', 'd'].slice(0, k);
      const shares = sumSplit(cents, members);
      expect(Object.values(shares).reduce((x, y) => x + y, 0)).toBe(cents);
      expect(Object.values(shares).every(Number.isInteger)).toBe(true);
      expect(parseCents(formatCents(cents))).toBe(cents);
    }
  });
  it('round trips over integers', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 100_000_000 }), (n) => {
        expect(parseCents(formatCents(n))).toBe(n);
      }),
    );
  });
});

describe('money source', () => {
  it('uses no toLocale, Intl or division', () => {
    const src = readFileSync(new URL('./money.ts', import.meta.url), 'utf8');
    const code = src
      .split('\n')
      .filter((l) => !l.trim().startsWith('//') && !l.trim().startsWith('/**'))
      .join('\n')
      .replace(/\/(?:\\.|[^/\n])+\/[a-z]*\s*;/g, ''); // drop regex literal
    expect(code).not.toMatch(/toLocale|Intl/);
    expect(code).not.toMatch(/\/(?!\/)/);
  });
});

describe('members', () => {
  it('maps replicas and authors', () => {
    expect(memberOfReplica('a#1')).toBe('sari');
    expect(memberOfReplica('b')).toBe('budi');
    expect(memberOfReplica('seed')).toBeUndefined();
    expect(displayName('citra')).toBe('Citra');
    expect(displayName('dewi')).toBe('Dewi');
    expect(displayName('zed')).toBe('zed');
    expect(authorOf({ stamp: { l: 1, r: 'a#1', n: 1 } })).toBe('a');
    expect(memberOfReplica('b#7')).toBe('budi');
    expect(authorOf({ stamp: { l: 1, r: 'seed', n: 1 } })).toBe('seed');
  });
});
