import { describe, expect, it } from 'vitest';
import type { Op, OpDef } from '../core/types.ts';
import {
  countBehind,
  countUnacked,
  createExchangeLog,
  deriveSync,
  initialFixed,
  nextFixed,
  type FixedState,
  type LinkState,
  type SyncView,
} from './status.ts';

const inp = (link: LinkState, unacked: number, behind: number, buffered: number, twins = 0) => ({
  link,
  unacked,
  behind,
  buffered,
  twins,
});

describe('deriveSync axis', () => {
  const rows: [LinkState, number, number, number, string][] = [
    ['down', 0, 0, 0, 'FOGGED'],
    ['down', 3, 2, 1, 'FOGGED'],
    ['connecting', 0, 0, 0, 'FOGGED'],
    ['up', 1, 0, 0, 'DEVELOPING'],
    ['up', 0, 2, 0, 'DEVELOPING'],
    ['up', 0, 0, 1, 'DEVELOPING'],
    ['up', 0, 0, 0, 'LIVE'],
  ];
  for (const [l, u, b, h, axis] of rows) {
    it(`${l} unacked=${u} behind=${b} buffered=${h} -> ${axis}`, () => {
      expect(deriveSync(inp(l, u, b, h)).axis).toBe(axis);
    });
  }
  it('conflict axis', () => {
    expect(deriveSync(inp('up', 0, 0, 0, 0)).conflict).toBe('CLEAR');
    expect(deriveSync(inp('up', 0, 0, 0, 1)).conflict).toBe('CONFLICT');
    expect(deriveSync(inp('up', 0, 0, 0, 4)).conflict).toBe('CONFLICT');
  });
});

describe('chip text', () => {
  const chip = (...a: Parameters<typeof inp>) => deriveSync(inp(...a)).chip;
  it('matches the spec strings exactly', () => {
    expect(chip('up', 0, 0, 0)).toBe('Live');
    expect(chip('down', 3, 0, 0)).toBe('Offline — 3 waiting');
    expect(chip('down', 0, 0, 0)).toBe('Offline');
    expect(chip('up', 1, 1, 0)).toBe('Syncing 2…');
    expect(chip('up', 0, 0, 2)).toBe('Syncing…');
    expect(chip('up', 0, 0, 0, 1)).toBe('Live · 1 conflict');
    expect(chip('up', 0, 0, 0, 2)).toBe('Live · 2 conflicts');
    expect(chip('up', 2, 0, 0, 1)).toBe('Syncing 2… · 1 conflict');
    expect(chip('down', 3, 0, 0, 2)).toBe('Offline — 3 waiting · 2 conflicts');
    expect(chip('connecting', 0, 0, 0, 1)).toBe('Offline · 1 conflict');
  });
});

describe('nextFixed', () => {
  const v = (axis: SyncView['axis'], conflict: SyncView['conflict']) => ({ axis, conflict });
  const run = (views: ReturnType<typeof v>[]) => {
    let s: FixedState = initialFixed;
    const out: { fired: boolean; visible: boolean }[] = [];
    for (const x of views) {
      const r = nextFixed(s, x);
      s = r.state;
      out.push({ fired: r.fired, visible: s.visible });
    }
    return out;
  };
  it('fires once after FOGGED then LIVE/CLEAR, stays visible, no re-fire', () => {
    const o = run([v('FOGGED', 'CLEAR'), v('LIVE', 'CLEAR'), v('LIVE', 'CLEAR')]);
    expect(o.map((x) => x.fired)).toEqual([false, true, false]);
    expect(o[2]!.visible).toBe(true);
  });
  it('fires after CONFLICT then CLEAR', () => {
    const o = run([v('LIVE', 'CONFLICT'), v('LIVE', 'CLEAR')]);
    expect(o.map((x) => x.fired)).toEqual([false, true]);
  });
  it('does not fire from start LIVE or from DEVELOPING alone', () => {
    expect(run([v('LIVE', 'CLEAR')])[0]!.fired).toBe(false);
    expect(run([v('DEVELOPING', 'CLEAR'), v('LIVE', 'CLEAR')]).some((x) => x.fired)).toBe(false);
  });
  it('hides on leaving either axis and fires again after a new dirty trip', () => {
    const o = run([v('FOGGED', 'CLEAR'), v('LIVE', 'CLEAR'), v('DEVELOPING', 'CLEAR'), v('LIVE', 'CLEAR')]);
    expect(o.map((x) => x.visible)).toEqual([false, true, false, false]);
    expect(o.map((x) => x.fired)).toEqual([false, true, false, false]);
    const p = run([v('FOGGED', 'CLEAR'), v('LIVE', 'CLEAR'), v('LIVE', 'CONFLICT'), v('LIVE', 'CLEAR')]);
    expect(p.map((x) => x.visible)).toEqual([false, true, false, true]);
    expect(p.map((x) => x.fired)).toEqual([false, true, false, true]);
  });
});

const mk = (r: string, n: number, op = 'x'): Op => ({
  id: `${r}:${n}`,
  op,
  target: 't',
  payload: null,
  stamp: { l: n, r, n },
  deps: {},
});

describe('exchange log', () => {
  const defs: OpDef[] = [
    { name: 'tick', merge: 'causal-lww', intent: { kind: 'set', field: 'ticked' } },
    { name: 'qty', merge: 'commutes', intent: { kind: 'delta', field: 'qty' } },
  ];
  it('records name, merge, stamp, deps; closes on settle only', () => {
    const log = createExchangeLog(defs);
    const o = { ...mk('a#1', 1, 'tick'), deps: { seed: 2 } };
    log.cross('a', [o]);
    log.settle(false);
    expect(log.last()).toEqual([]);
    expect(log.open()).toEqual([{ side: 'a', name: 'tick', merge: 'causal-lww', stamp: o.stamp, deps: { seed: 2 } }]);
    log.settle(true);
    expect(log.open()).toEqual([]);
    expect(log.last()).toHaveLength(1);
  });
  it('many chunks stay in one exchange', () => {
    const log = createExchangeLog(defs);
    for (let i = 1; i <= 40; i++) log.cross('b', [mk('b#1', i, 'qty')]);
    log.settle(true);
    expect(log.last()).toHaveLength(1);
    expect(log.last()[0]).toHaveLength(40);
  });
  it('settle with nothing open adds nothing; keeps last 3 oldest first', () => {
    const log = createExchangeLog(defs);
    log.settle(true);
    expect(log.last()).toEqual([]);
    for (let i = 1; i <= 4; i++) {
      log.cross('a', [mk('a#1', i, 'qty')]);
      log.settle(true);
    }
    expect(log.last().map((e) => e[0]!.stamp.n)).toEqual([2, 3, 4]);
  });
});

describe('counting', () => {
  it('countUnacked skips seed and peer ops, honours coverage', () => {
    const log = [mk('seed', 1), mk('a#1', 1), mk('a#1', 2), mk('a#2', 1), mk('b#1', 1)];
    expect(countUnacked(log, {}, 'b')).toBe(3);
    expect(countUnacked(log, { 'a#1': 1 }, 'b')).toBe(2);
    expect(countUnacked(log, { 'a#1': 2, 'a#2': 1 }, 'b')).toBe(0);
  });
  it('countBehind sums gaps once, 0 without hello', () => {
    expect(countBehind({ seed: 2 }, undefined)).toBe(0);
    expect(countBehind({ seed: 2, 'a#1': 1 }, { seed: 2, 'a#1': 4, 'b#1': 2 })).toBe(5);
    expect(countBehind({ 'a#1': 5 }, { 'a#1': 3 })).toBe(0);
  });
});
