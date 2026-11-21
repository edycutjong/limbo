// BASECAMP lake scene: the four scripted partition edits and the two goldens (R10.3, R12.2).
//
// ASSUMPTION: fresh databases. Replica `a` then makes ids `a#1:n` and replica `b` makes `b#1:n`
// (createReplica's namespace is `${id}#${k}` with k = 1 on a new database), and the seed holds 15 ops,
// so the first partition edit on each side carries `l = 16` and the claims `l = 17`. After a manual
// detour or a reset-less reload the ids and counters differ, the on-screen op ids no longer equal a
// golden's `opIds`, and the page prints no golden line (R12.3). That is the intended behaviour.
//
// The golden `state` values are written by hand from the stated expectations (tent alive and ticked,
// stove won by `sari`, zero twins), not produced by `materialize` at runtime. `canonical` only
// serialises the hand-written object. scene.test.ts compares them with `materialize` over shuffled orders.
import { canonical } from '../../../skeleton/src/core/causal.ts';
import type { Op } from '../../../skeleton/src/core/types.ts';
import type { Golden } from '../../../skeleton/src/limbo/shuffle-test.tsx';
import type { Replica } from '../../../skeleton/src/sync/replica.ts';
import { claimItem, deleteItem, tickItem } from './actions.ts';
import type { State } from './model.ts';

export interface SceneStep {
  replica: 'a' | 'b';
  run(r: Replica<State>): Op;
}

/** The four partition edits, in order: A ticks the tent, B deletes it, A claims the stove, B claims it. */
export const lakeScript: readonly SceneStep[] = [
  { replica: 'a', run: (r) => tickItem(r, 'tent', true) },
  { replica: 'b', run: (r) => deleteItem(r, 'tent') },
  { replica: 'a', run: (r) => claimItem(r, 'stove') },
  { replica: 'b', run: (r) => claimItem(r, 'stove') },
];

/** Op ids of the fresh-database run: seed ops, the four partition edits, the two resolves. */
export const SEED_OP_IDS: readonly string[] = Array.from({ length: 15 }, (_, i) => `seed:${i + 1}`);
export const PARTITION_OP_IDS: readonly string[] = ['a#1:1', 'a#1:2', 'b#1:1', 'b#1:2'];
export const RESOLVE_OP_IDS: readonly string[] = ['a#1:3', 'b#1:3'];

type Claimant = { who: string; op: string; stamp: { l: number; n: number; r: string } };

interface ItemSpec {
  name: string;
  pos: string;
  units?: number;
  ticked?: boolean;
  winners?: Claimant[];
}

/** One item in the shape of `Item`, with no twins and no loser. Every field is stated, none computed. */
function item(id: string, s: ItemSpec): Record<string, unknown> {
  const winners = s.winners ?? [];
  return {
    id,
    name: s.name,
    ticked: s.ticked ?? false,
    units: s.units ?? 1,
    life: 'alive',
    pos: s.pos,
    twins: { fields: [] },
    fieldTwins: [],
    winners: winners.map((w) => w.who),
    losers: [],
    claims: { winners, losers: [] },
    values: { name: [], ticked: [] },
  };
}

const ORDER = ['tent', 'stove', 'gas', 'filter', 'headlamps', 'firstaid', 'mats', 'rope', 'cooler', 'coffee'];

const EXPENSES = {
  campsite: {
    id: 'campsite',
    label: 'Campsite fee',
    payer: 'sari',
    amountCents: 4800,
    members: ['budi', 'citra', 'dewi', 'sari'],
    shares: { budi: 1200, citra: 1200, dewi: 1200, sari: 1200 },
    unallocated: 0,
    values: [],
  },
  'gas-snacks': {
    id: 'gas-snacks',
    label: 'Gas + snacks',
    payer: 'budi',
    amountCents: 2500,
    members: ['budi', 'citra', 'sari'],
    shares: { budi: 834, citra: 833, sari: 833 },
    unallocated: 0,
    values: [],
  },
};

const citraGas: Claimant = { who: 'citra', op: 'seed:11', stamp: { l: 11, n: 11, r: 'seed' } };
const dewiFilter: Claimant = { who: 'dewi', op: 'seed:12', stamp: { l: 12, n: 12, r: 'seed' } };
/** Sari's stove claim: `l = 17`, replica `a#1`, her second op. Budi's tied claim is released by `b#1:3`. */
const sariStove: Claimant = { who: 'sari', op: 'a#1:2', stamp: { l: 17, n: 2, r: 'a#1' } };

function items(tentTicked: boolean, stove: Claimant[]): Record<string, unknown> {
  return {
    tent: item('tent', { name: 'Tent (2-person)', pos: 'a001r01d01d01c1', ticked: tentTicked }),
    stove: item('stove', { name: 'Stove (the last one)', pos: 'a101r01d01d01c1', winners: stove }),
    gas: item('gas', { name: 'Gas canister ×2', pos: 'a201r01d01d01c1', units: 2, winners: [citraGas] }),
    filter: item('filter', { name: 'Water filter', pos: 'a301r01d01d01c1', winners: [dewiFilter] }),
    headlamps: item('headlamps', { name: 'Headlamps ×4', pos: 'a401r01d01d01c1', units: 4 }),
    firstaid: item('firstaid', { name: 'First-aid kit', pos: 'a501r01d01d01c1' }),
    mats: item('mats', { name: 'Sleeping mats ×4', pos: 'a601r01d01d01c1', units: 4 }),
    rope: item('rope', { name: 'Rope (10 m)', pos: 'a701r01d01d01c1' }),
    cooler: item('cooler', { name: 'Cooler', pos: 'a801r01d01d01c1' }),
    coffee: item('coffee', { name: 'Coffee + filters', pos: 'a901r01d01d01c1', ticked: true }),
  };
}

/** The seed alone: coffee ticked, gas claimed by citra, filter by dewi, two expenses, ten items in list order. */
const seedState = { items: items(false, []), order: ORDER, expenses: EXPENSES };

/** The finished lake scene: tent alive and ticked, stove won by sari, no twin of any kind. */
const lakeState = { items: items(true, [sariStove]), order: ORDER, expenses: EXPENSES };

export const goldens: readonly Golden[] = [
  { opIds: [...SEED_OP_IDS], state: canonical(seedState) },
  { opIds: [...SEED_OP_IDS, ...PARTITION_OP_IDS, ...RESOLVE_OP_IDS], state: canonical(lakeState) },
];
