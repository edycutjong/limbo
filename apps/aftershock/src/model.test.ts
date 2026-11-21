// Model tests (task 8): sector fold over hand-built causal histories.
import { describe, expect, it } from 'vitest';
import type { Op } from '../../../skeleton/src/core/types.ts';
import { materialize } from './model.ts';

function op(r: string, n: number, l: number, deps: Record<string, number>, name: string, target: string, payload: unknown): Op {
  return { id: `${r}:${n}`, op: name, target, payload, stamp: { l, r, n }, deps };
}

const shuffles = <T>(xs: T[]): T[][] => {
  const out: T[][] = [xs, [...xs].reverse()];
  for (let i = 1; i < xs.length; i++) out.push([...xs.slice(i), ...xs.slice(0, i)]);
  return out;
};

describe('counts', () => {
  it('two surveyors on one sector: total 5, Sari 2 then Budi 3', () => {
    const ops = [
      op('b#1', 1, 1, {}, 'sector.count', 'C3#budi', { count: 3 }),
      op('a#1', 1, 1, {}, 'sector.count', 'C3#sari', { count: 2 }),
    ];
    for (const o of shuffles(ops)) {
      const s = materialize(o).sectors.C3!;
      expect(s.total).toBe(5);
      expect(s.counts.map((c) => `${c.who} ${c.value}`)).toEqual(['sari 2', 'budi 3']);
      expect(s.counts.every((c) => c.values.length === 0)).toBe(true);
    }
  });

  it('roster order puts rina after budi, unknown ids last', () => {
    const ops = [
      op('s', 1, 1, {}, 'sector.count', 'B2#zed', { count: 1 }),
      op('s', 2, 2, { s: 1 }, 'sector.count', 'B2#rina', { count: 3 }),
      op('s', 3, 3, { s: 2 }, 'sector.count', 'B2#sari', { count: 1 }),
    ];
    expect(materialize(ops).sectors.B2!.counts.map((c) => c.who)).toEqual(['sari', 'rina', 'zed']);
  });

  it('the same surveyor\'s two concurrent counts give two values', () => {
    const ops = [
      op('a#1', 1, 1, {}, 'sector.count', 'C3#sari', { count: 2 }),
      op('b#1', 1, 1, {}, 'sector.count', 'C3#sari', { count: 4 }),
    ];
    for (const o of shuffles(ops)) {
      const c = materialize(o).sectors.C3!.counts[0]!;
      expect(c.values).toEqual([
        { by: 'a', value: 2 },
        { by: 'b', value: 4 },
      ]);
      expect(c.value).toBe(4);
    }
  });

  it('a target without # does not throw and still folds', () => {
    const s = materialize([op('a', 1, 1, {}, 'sector.count', 't0', { count: 4 })]).sectors.t0!;
    expect(s.total).toBe(4);
    expect(s.counts).toEqual([]);
  });
});

describe('sectors', () => {
  it('an absent sector is absent', () => {
    expect(materialize([op('a', 1, 1, {}, 'sector.report', 'A1', { severity: 'safe' })]).sectors.C3).toBeUndefined();
  });
});

describe('severity', () => {
  it('is the max for concurrent reports in every shuffled order', () => {
    const ops = [
      op('a', 1, 1, {}, 'sector.report', 'C3', { severity: 'damaged' }),
      op('b', 1, 1, {}, 'sector.report', 'C3', { severity: 'unsafe' }),
      op('c', 1, 1, {}, 'sector.report', 'C3', { severity: 'safe' }),
    ];
    for (const o of shuffles(ops)) {
      const s = materialize(o).sectors.C3!;
      expect(s.severity).toBe('unsafe');
      expect(s.reports).toBe(3);
    }
  });

  it('a clear that saw unsafe lowers to the next report, or undefined', () => {
    const unsafe = op('a', 1, 1, {}, 'sector.report', 'C3', { severity: 'unsafe' });
    const clear = op('a', 2, 2, { a: 1 }, 'sector.clear', 'C3', {});
    expect(materialize([unsafe, clear]).sectors.C3!.severity).toBeUndefined();
    const lower = op('a', 3, 3, { a: 2 }, 'sector.report', 'C3', { severity: 'damaged' });
    for (const o of shuffles([unsafe, clear, lower])) {
      const s = materialize(o).sectors.C3!;
      expect(s.severity).toBe('damaged');
      expect(s.reports).toBe(1);
    }
  });

  it('a concurrent report survives a clear', () => {
    const seen = op('a', 1, 1, {}, 'sector.report', 'C3', { severity: 'damaged' });
    const clear = op('a', 2, 2, { a: 1 }, 'sector.clear', 'C3', {});
    const concurrent = op('b', 1, 1, {}, 'sector.report', 'C3', { severity: 'unsafe' });
    for (const o of shuffles([seen, clear, concurrent])) expect(materialize(o).sectors.C3!.severity).toBe('unsafe');
  });
});

describe('needs', () => {
  it('an add concurrent with an unneed survives; an observed one is removed', () => {
    const add = op('a', 1, 1, {}, 'sector.need', 'B2', { need: 'water' });
    const unneed = op('a', 2, 2, { a: 1 }, 'sector.unneed', 'B2', { need: 'water' });
    const concurrentAdd = op('b', 1, 1, {}, 'sector.need', 'B2', { need: 'water' });
    expect(materialize([add, unneed]).sectors.B2!.needs).toEqual([]);
    for (const o of shuffles([add, unneed, concurrentAdd])) expect(materialize(o).sectors.B2!.needs).toEqual(['water']);
  });
});

describe('notes', () => {
  it('concurrent notes give two values and a pick-one resolves it', () => {
    const n1 = op('a#1', 1, 1, {}, 'sector.note', 'C3', { note: 'cracked stairwell' });
    const n2 = op('b#1', 1, 1, {}, 'sector.note', 'C3', { note: 'gas smell' });
    for (const o of shuffles([n1, n2])) {
      const s = materialize(o).sectors.C3!;
      expect(s.noteValues).toEqual([
        { by: 'a', value: 'cracked stairwell' },
        { by: 'b', value: 'gas smell' },
      ]);
      expect(s.note).toBe('gas smell');
    }
    const pick = op('a#1', 2, 2, { 'a#1': 1, 'b#1': 1 }, 'sector.note', 'C3', { note: 'cracked stairwell' });
    for (const o of shuffles([n1, n2, pick])) {
      const s = materialize(o).sectors.C3!;
      expect(s.noteValues).toEqual([]);
      expect(s.note).toBe('cracked stairwell');
    }
  });
});

describe('twinned frontier order', () => {
  it('lists concurrent notes by Lamport counter first, whatever the replica ids', () => {
    const low = op('z', 1, 1, {}, 'sector.note', 'C3', { note: 'low' });
    const high = op('a', 1, 2, {}, 'sector.note', 'C3', { note: 'high' });
    for (const o of shuffles([low, high])) {
      expect(materialize(o).sectors.C3!.noteValues).toEqual([
        { by: 'z', value: 'low' },
        { by: 'a', value: 'high' },
      ]);
    }
  });

  it('lists three concurrent notes with equal counters by replica id', () => {
    const ops = ['c', 'a', 'b'].map((r) => op(r, 1, 1, {}, 'sector.note', 'C3', { note: `note ${r}` }));
    for (const o of [...shuffles(ops), ...shuffles([...ops].sort((x, y) => (x.id < y.id ? -1 : 1)))]) {
      expect(materialize(o).sectors.C3!.noteValues.map((v) => v.by)).toEqual(['a', 'b', 'c']);
    }
  });
});

describe('twinned frontier from one replica', () => {
  it('orders two uncovering notes of one replica and counter by per-replica counter', () => {
    const first = op('a', 1, 1, {}, 'sector.note', 'C3', { note: 'first' });
    const second = op('a', 2, 1, {}, 'sector.note', 'C3', { note: 'second' });
    for (const o of shuffles([first, second])) {
      expect(materialize(o).sectors.C3!.noteValues.map((v) => v.value)).toEqual(['first', 'second']);
    }
  });
});
