// AFTERSHOCK seed: the deterministic op script authored by replica `seed` (R2). Demo data only.
// No clock, randomness or locale: the same script gives byte-identical ops on every replica.
import type { Op } from '../../../skeleton/src/core/types.ts';
import { makeSeedOps } from '../../../skeleton/src/sync/replica.ts';
import { ops as defs } from './ops/registry.gen.ts';
import type { Severity } from './sectors.ts';

export const SURVEY_NAME = 'Block 7 survey';

type Step = { name: string; target: string; payload: unknown };

/** Reported sectors in sector order; `C3` is left out on purpose so the survey scene starts from an empty sector. */
export const SEED_REPORTS: readonly { id: string; severity: Severity }[] = [
  { id: 'A1', severity: 'safe' },
  { id: 'A3', severity: 'safe' },
  { id: 'B1', severity: 'safe' },
  { id: 'B2', severity: 'damaged' },
  { id: 'C1', severity: 'safe' },
  { id: 'D1', severity: 'safe' },
  { id: 'D2', severity: 'safe' },
  { id: 'E1', severity: 'safe' },
  { id: 'E3', severity: 'damaged' },
  { id: 'F1', severity: 'safe' },
];

export const SEED_COUNTS: readonly { target: string; count: number }[] = [
  { target: 'A1#sari', count: 2 },
  { target: 'A3#budi', count: 1 },
  { target: 'B2#rina', count: 3 },
  { target: 'B2#sari', count: 1 },
  { target: 'E3#rina', count: 2 },
];

export const SEED_NEEDS: readonly { target: string; need: string }[] = [
  { target: 'B2', need: 'water' },
  { target: 'E3', need: 'medical' },
  { target: 'A3', need: 'shelter' },
];

export const seedScript = (): Step[] => [
  ...SEED_REPORTS.map((r) => ({ name: 'sector.report', target: r.id, payload: { severity: r.severity } })),
  ...SEED_COUNTS.map((c) => ({ name: 'sector.count', target: c.target, payload: { count: c.count } })),
  ...SEED_NEEDS.map((n) => ({ name: 'sector.need', target: n.target, payload: { need: n.need } })),
];

export function makeSeed(): Op[] {
  return makeSeedOps(defs, seedScript());
}

export const seedOps: readonly Op[] = makeSeed();
