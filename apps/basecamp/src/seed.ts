// BASECAMP seed: the deterministic op script authored by replica `seed` (R2).
// No clock, randomness or locale: the same script gives byte-identical ops on every replica.
import { allocKey } from '../../../skeleton/src/core/causal.ts';
import type { Op } from '../../../skeleton/src/core/types.ts';
import { makeSeedOps } from '../../../skeleton/src/sync/replica.ts';
import { ops as defs } from './ops/registry.gen.ts';

export const LIST_NAME = 'Lake camp · Sat–Sun';

export const SEED_ITEMS: readonly { id: string; name: string; units: number }[] = [
  { id: 'tent', name: 'Tent (2-person)', units: 1 },
  { id: 'stove', name: 'Stove (the last one)', units: 1 },
  { id: 'gas', name: 'Gas canister ×2', units: 2 },
  { id: 'filter', name: 'Water filter', units: 1 },
  { id: 'headlamps', name: 'Headlamps ×4', units: 4 },
  { id: 'firstaid', name: 'First-aid kit', units: 1 },
  { id: 'mats', name: 'Sleeping mats ×4', units: 4 },
  { id: 'rope', name: 'Rope (10 m)', units: 1 },
  { id: 'cooler', name: 'Cooler', units: 1 },
  { id: 'coffee', name: 'Coffee + filters', units: 1 },
];

type Step = { name: string; target: string; payload: unknown };

/** One `item.add` per item, keys allocated by replica `seed` in list order. */
export function itemScript(): Step[] {
  let prev: string | null = null;
  return SEED_ITEMS.map((it) => {
    const key = allocKey(prev, null, 'seed');
    prev = key;
    return { name: 'item.add', target: it.id, payload: { name: it.name, units: it.units, key } };
  });
}

export const expenseScript = (): Step[] => [
  {
    name: 'expense.add',
    target: 'campsite',
    payload: { label: 'Campsite fee', amountCents: 4800, payer: 'sari', members: ['sari', 'budi', 'citra', 'dewi'] },
  },
  {
    name: 'expense.add',
    target: 'gas-snacks',
    payload: { label: 'Gas + snacks', amountCents: 2500, payer: 'budi', members: ['sari', 'budi', 'citra'] },
  },
];

export const seedScript = (): Step[] => [
  ...itemScript(),
  { name: 'item.claim', target: 'gas', payload: { who: 'citra' } },
  { name: 'item.claim', target: 'filter', payload: { who: 'dewi' } },
  { name: 'item.tick', target: 'coffee', payload: { ticked: true } },
  ...expenseScript(),
];

export function buildSeedOps(): Op[] {
  return makeSeedOps(defs, seedScript());
}

export const seedOps: readonly Op[] = buildSeedOps();
