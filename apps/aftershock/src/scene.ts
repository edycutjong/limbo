// AFTERSHOCK survey scene: the six scripted partition edits and the two goldens (R10, R11, R12).
//
// ASSUMPTION: fresh databases. Replica `a` then makes ids `a#1:n` and replica `b` makes `b#1:n`
// (createReplica's namespace is `${id}#${k}` with k = 1 on a new database), and the seed holds 18 ops,
// so the first partition edit on each side carries `l = 19`, the counts `l = 20` and the notes `l = 21`.
// The resolve by A is `a#1:4` with `l = 22`. After a manual detour or a reset-less reload the ids and
// counters differ, the on-screen op ids no longer equal a golden's `opIds`, and the page prints no
// golden line (R12.3). That is the intended behaviour. Demo data only.
//
// The golden `state` values are written by hand from the stated expectations (C3 unsafe, counts sari 2
// and budi 3, total 5, one note, no needs, zero twins), not produced by `materialize` at runtime.
// `canonical` only serialises the hand-written object. scene.test.ts compares them with `materialize`
// over shuffled orders.
import { canonical } from '../../../skeleton/src/core/causal.ts';
import type { Op } from '../../../skeleton/src/core/types.ts';
import type { Golden } from '../../../skeleton/src/limbo/shuffle-test.tsx';
import type { Replica } from '../../../skeleton/src/sync/replica.ts';
import { reportSector, setCount, setNote } from './actions.ts';
import type { State } from './model.ts';

export interface SceneStep {
  replica: 'a' | 'b';
  run(r: Replica<State>): Op;
}

/** The six partition edits, alternating A then B: report, count, note on sector C3. */
export const surveyScript: readonly SceneStep[] = [
  { replica: 'a', run: (r) => reportSector(r, 'C3', 'damaged') },
  { replica: 'b', run: (r) => reportSector(r, 'C3', 'unsafe') },
  { replica: 'a', run: (r) => setCount(r, 'C3', 2) },
  { replica: 'b', run: (r) => setCount(r, 'C3', 3) },
  { replica: 'a', run: (r) => setNote(r, 'C3', 'cracked stairwell') },
  { replica: 'b', run: (r) => setNote(r, 'C3', 'gas smell, east wall') },
];

/** Op ids of the fresh-database run: seed ops, the six partition edits, the resolve. */
export const SEED_OP_IDS: readonly string[] = Array.from({ length: 18 }, (_, i) => `seed:${i + 1}`);
export const PARTITION_OP_IDS: readonly string[] = ['a#1:1', 'a#1:2', 'a#1:3', 'b#1:1', 'b#1:2', 'b#1:3'];
export const RESOLVE_OP_IDS: readonly string[] = ['a#1:4'];

interface CountSpec {
  who: string;
  value: number;
}

interface SectorSpec {
  severity: string;
  counts?: CountSpec[];
  needs?: string[];
  note?: string;
  reports?: number;
}

/** One sector in the shape of `Sector`, with no twin values. Every field is stated, none computed. */
function sector(id: string, s: SectorSpec): Record<string, unknown> {
  const counts = s.counts ?? [];
  return {
    id,
    severity: s.severity,
    reports: s.reports ?? 1,
    counts: counts.map((c) => ({ who: c.who, value: c.value, values: [] })),
    total: counts.reduce((sum, c) => sum + c.value, 0),
    needs: s.needs ?? [],
    note: s.note,
    noteValues: [],
  };
}

function seedSectors(): Record<string, Record<string, unknown>> {
  return {
    A1: sector('A1', { severity: 'safe', counts: [{ who: 'sari', value: 2 }] }),
    A3: sector('A3', { severity: 'safe', counts: [{ who: 'budi', value: 1 }], needs: ['shelter'] }),
    B1: sector('B1', { severity: 'safe' }),
    B2: sector('B2', {
      severity: 'damaged',
      counts: [
        { who: 'sari', value: 1 },
        { who: 'rina', value: 3 },
      ],
      needs: ['water'],
    }),
    C1: sector('C1', { severity: 'safe' }),
    D1: sector('D1', { severity: 'safe' }),
    D2: sector('D2', { severity: 'safe' }),
    E1: sector('E1', { severity: 'safe' }),
    E3: sector('E3', { severity: 'damaged', counts: [{ who: 'rina', value: 2 }], needs: ['medical'] }),
    F1: sector('F1', { severity: 'safe' }),
  };
}

/** The seed alone: 10 reported sectors, C3 absent. */
const seedState = { sectors: seedSectors() };

/** The finished scene: C3 unsafe (two reports, max), sari 2 and budi 3 (total 5), one note, no twin. */
const sceneState = {
  sectors: {
    ...seedSectors(),
    C3: sector('C3', {
      severity: 'unsafe',
      reports: 2,
      counts: [
        { who: 'sari', value: 2 },
        { who: 'budi', value: 3 },
      ],
      note: 'gas smell, east wall',
    }),
  },
};

export const goldens: readonly Golden[] = [
  { opIds: [...SEED_OP_IDS], state: canonical(seedState) },
  { opIds: [...SEED_OP_IDS, ...PARTITION_OP_IDS, ...RESOLVE_OP_IDS], state: canonical(sceneState) },
];
