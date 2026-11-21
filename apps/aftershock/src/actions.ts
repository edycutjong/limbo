// AFTERSHOCK actions (R13): one function per user action. Each creates one op through
// `replica.local`, so `deps` is the replica's current vv and a resolve op observes every op the
// replica holds on that target. Every action writes an explicit value: none reads state to compute
// a delta or a flip. No clock, randomness or locale is read here.
import type { Op } from '../../../skeleton/src/core/types.ts';
import type { Replica } from '../../../skeleton/src/sync/replica.ts';
import { memberOfReplica } from './members.ts';
import type { State } from './model.ts';
import type { Severity } from './sectors.ts';

type R = Replica<State>;

/** The member id this replica acts as; replicas without a member act as themselves. */
export const memberOf = (r: R): string => memberOfReplica(r.id);

export const reportSector = (r: R, sector: string, severity: Severity): Op => r.local('sector.report', sector, { severity });

/** Re-inspection: a clear that covers the reports this replica holds, then a fresh report. */
export function reinspectSector(r: R, sector: string, severity: Severity): Op[] {
  const clear = r.local('sector.clear', sector, {});
  return [clear, r.local('sector.report', sector, { severity })];
}

/** Set this surveyor's own count for a sector (target `<sector>#<member>`). */
export const setCount = (r: R, sector: string, count: number): Op => r.local('sector.count', `${sector}#${memberOf(r)}`, { count });

/** Every press is one add; pressing twice makes two adds, never an add and a remove. */
export const addNeed = (r: R, sector: string, need: string): Op => r.local('sector.need', sector, { need });

export const removeNeed = (r: R, sector: string, need: string): Op => r.local('sector.unneed', sector, { need });

export const setNote = (r: R, sector: string, note: string): Op => r.local('sector.note', sector, { note });

/** Resolve a note twin: a new write that covers every note the replica holds. */
export const pickNote = (r: R, sector: string, note: string): Op => r.local('sector.note', sector, { note });

/** Resolve a count twin of one surveyor: a new write on that surveyor's register. */
export const pickCount = (r: R, sector: string, who: string, count: number): Op => r.local('sector.count', `${sector}#${who}`, { count });
