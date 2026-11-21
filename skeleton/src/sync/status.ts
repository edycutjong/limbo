// Pure sync-state derivation, FIXED event and exchange log (spec skeleton-sync R10 to R13). Types only from core.
import type { Op, OpDef, Stamp, VV } from '../core/types.ts';

export type LinkState = 'up' | 'down' | 'connecting';
export type Axis = 'FOGGED' | 'DEVELOPING' | 'LIVE';
export type Conflict = 'CLEAR' | 'CONFLICT';

export interface SyncInput {
  link: LinkState;
  unacked: number;
  behind: number;
  buffered: number;
  twins: number;
}
export interface SyncView extends SyncInput {
  axis: Axis;
  conflict: Conflict;
  chip: string;
}

export function deriveSync(i: SyncInput): SyncView {
  const axis: Axis =
    i.link !== 'up' ? 'FOGGED' : i.unacked + i.behind > 0 || i.buffered > 0 ? 'DEVELOPING' : 'LIVE';
  const conflict: Conflict = i.twins >= 1 ? 'CONFLICT' : 'CLEAR';
  const base =
    axis === 'LIVE'
      ? 'Live'
      : axis === 'FOGGED'
        ? i.unacked > 0
          ? `Offline — ${i.unacked} waiting`
          : 'Offline'
        : i.unacked + i.behind > 0
          ? `Syncing ${i.unacked + i.behind}…`
          : 'Syncing…';
  const chip = conflict === 'CONFLICT' ? `${base} · ${i.twins} conflict${i.twins === 1 ? '' : 's'}` : base;
  return { ...i, axis, conflict, chip };
}

/** Ops in `log` whose dot peerAckVV does not cover, skipping seed ops and ops authored by the peer. */
export function countUnacked(log: readonly Op[], peerAck: VV, peerId: string | undefined): number {
  let n = 0;
  for (const o of log) {
    const author = o.stamp.r.split('#')[0];
    if (author === 'seed' || author === peerId) continue;
    if ((peerAck[o.stamp.r] ?? 0) < o.stamp.n) n++;
  }
  return n;
}

/** Sum over dot namespaces of max(0, peerVV - vv). 0 while no hello has arrived (`peerVV` undefined). */
export function countBehind(vv: VV, peerVV: VV | undefined): number {
  if (peerVV === undefined) return 0;
  let n = 0;
  for (const r of Object.keys(peerVV)) n += Math.max(0, (peerVV[r] ?? 0) - (vv[r] ?? 0));
  return n;
}

export interface FixedState {
  dirty: boolean;
  visible: boolean;
  axis: Axis;
  conflict: Conflict;
}
export const initialFixed: FixedState = { dirty: false, visible: false, axis: 'LIVE', conflict: 'CLEAR' };

/** FIXED fires once on entering LIVE and CLEAR after a FOGGED or CONFLICT. No clock. */
export function nextFixed(prev: FixedState, view: Pick<SyncView, 'axis' | 'conflict'>): { state: FixedState; fired: boolean } {
  const dirty = prev.dirty || view.axis === 'FOGGED' || view.conflict === 'CONFLICT';
  const { axis, conflict } = view;
  if (axis === 'LIVE' && conflict === 'CLEAR') {
    const fired = dirty && !prev.visible;
    return { state: { dirty: fired ? false : dirty, visible: fired || prev.visible, axis, conflict }, fired };
  }
  return { state: { dirty, visible: false, axis, conflict }, fired: false };
}

export interface Crossing {
  side: string;
  name: string;
  merge: string;
  stamp: Stamp;
  deps: VV;
}
export interface ExchangeLog {
  cross(side: string, ops: readonly Op[]): void;
  settle(bothSettled: boolean): void;
  last(): Crossing[][];
  open(): Crossing[];
}

/** Callers pass only newly applied ops; the log records exactly what it is given. */
export function createExchangeLog(defs: readonly OpDef[]): ExchangeLog {
  let open: Crossing[] = [];
  let done: Crossing[][] = [];
  return {
    cross(side, ops) {
      for (const o of ops) {
        const merge = defs.find((d) => d.name === o.op)?.merge ?? 'unknown';
        open.push({ side, name: o.op, merge, stamp: o.stamp, deps: o.deps });
      }
    },
    settle(bothSettled) {
      if (!bothSettled || open.length === 0) return;
      done = [...done, open].slice(-3);
      open = [];
    },
    last: () => done.map((e) => [...e]),
    open: () => [...open],
  };
}
