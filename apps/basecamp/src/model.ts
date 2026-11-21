// BASECAMP model: folds an op set into item views. Pure; reads only causal context (stamp, deps).
// Convergence of this fold is "measured, property-tested" by the goldens and the op properties.
import { causalBuffer } from '../../../skeleton/src/core/causal.ts';
import {
  causalLww,
  claimOne,
  orderedMove,
  resurrect,
  type ClaimPayload,
  type KeyPayload,
  type Life,
  type LifeOp,
} from '../../../skeleton/src/core/merges.ts';
import type { Op, Stamp } from '../../../skeleton/src/core/types.ts';
import { authorOf } from './members.ts';
import {
  amountOf,
  firstAdd,
  initialMembers,
  present,
  sharesOf,
  type AddPayload as ExpenseAddPayload,
  type AmountPayload,
  type MemberAdd,
  type MemberPayload,
  type MemberRemove,
} from './ops/expense.state.ts';

export interface ClaimInfo {
  who: string;
  op: string;
  stamp: Stamp;
}

export type EditKind = 'tick' | 'rename' | 'claim' | 'restore' | 'add';

export interface Item {
  id: string;
  name: string;
  ticked: boolean;
  units: number;
  life: Life;
  /** Fields whose concurrent frontier writes differ (field twins). */
  twins: { fields: string[] };
  /** Same field names as `twins.fields`; the shape the golden `expect` uses. */
  fieldTwins: string[];
  /** Claimants that won, in ascending stamp order. */
  winners: string[];
  /** Eligible claimants that lost (loser twins). */
  losers: string[];
  /** Winning fractional key. */
  pos: string;
  /** Winners and losers with their claim op and stamp, in `claimOne` order. */
  claims: { winners: ClaimInfo[]; losers: ClaimInfo[] };
  /** Present when an active delete exists: who deleted, and which edits resurrect against it. Authors are replica ids. */
  lifeInfo?: { deletedBy: string[]; editedBy: { by: string; kind: EditKind; op: string }[] };
  /** Frontier values per field, only while the field is twinned (empty otherwise). Ascending stamp. */
  values: { name: { by: string; value: string }[]; ticked: { by: string; value: boolean }[] };
}

export interface Expense {
  id: string;
  label: string;
  payer: string;
  amountCents: number;
  /** Present members, sorted by UTF-16 code unit. */
  members: string[];
  /** `sum-split` of the amount over the members. */
  shares: Record<string, number>;
  /** The whole amount when there are no members, else 0. */
  unallocated: number;
  /** Frontier amounts, only while the amount is twinned (empty otherwise). Ascending stamp. */
  values: { by: string; value: number }[];
}

export interface State {
  items: Record<string, Item>;
  /** Non-deleted item ids in display order. */
  order: string[];
  /** Expenses with an `expense.add` op, keyed by target. */
  expenses: Record<string, Expense>;
}

interface AddPayload {
  name: string;
  key: string;
  units: number;
}

const byStamp = (a: Op, b: Op): number =>
  a.stamp.l !== b.stamp.l ? a.stamp.l - b.stamp.l : a.stamp.r !== b.stamp.r ? (a.stamp.r < b.stamp.r ? -1 : 1) : a.stamp.n - b.stamp.n;

const EDIT_KIND: Record<string, EditKind> = {
  'item.add': 'add',
  'item.restore': 'restore',
  'item.rename': 'rename',
  'item.tick': 'tick',
  'item.claim': 'claim',
};

const claimInfo = (o: Op<ClaimPayload>): ClaimInfo => ({ who: o.payload.who, op: o.id, stamp: o.stamp });

/** Frontier values of a field, only when twinned: winner and twins, ascending stamp. */
function frontier<P, V>(r: { winner: Op<P> | undefined; twins: Op<P>[] }, value: (p: P) => V): { by: string; value: V }[] {
  if (r.winner === undefined || r.twins.length === 0) return [];
  return [r.winner, ...r.twins].sort(byStamp).map((o) => ({ by: authorOf(o), value: value(o.payload) }));
}

function expenseOf(id: string, group: Op[]): Expense | undefined {
  const first = firstAdd(group.filter((o) => o.op === 'expense.add') as Op<ExpenseAddPayload>[]);
  if (first === undefined) return undefined;
  const amount = amountOf(first, group.filter((o) => o.op === 'expense.setAmount') as Op<AmountPayload>[]);
  const adds: MemberAdd[] = [
    ...initialMembers(first),
    ...(group.filter((o) => o.op === 'expense.addMember') as Op<MemberPayload>[]).map((o) => ({ member: o.payload.member, op: o })),
  ];
  const removes: MemberRemove[] = (group.filter((o) => o.op === 'expense.removeMember') as Op<MemberPayload>[]).map((o) => ({
    member: o.payload.member,
    op: o,
  }));
  const members = present(adds, removes);
  const amountCents = amount.value?.amountCents ?? first.payload.amountCents;
  return {
    id,
    label: first.payload.label,
    payer: first.payload.payer,
    amountCents,
    members,
    ...sharesOf(amountCents, members),
    values: frontier(amount, (p) => p.amountCents),
  };
}

const EDIT_OPS = new Set(['item.add', 'item.restore', 'item.rename', 'item.tick', 'item.claim']);

function lifeKind(op: Op): LifeOp['kind'] | undefined {
  switch (op.op) {
    case 'item.add':
      return 'create';
    case 'item.restore':
      return 'restore';
    case 'item.delete':
      return 'delete';
    default:
      return EDIT_OPS.has(op.op) ? 'edit' : undefined;
  }
}

/** Apply ops through a fresh causal buffer (any order, duplicates ignored), then merge per item. */
export function materialize(ops: readonly Op[]): State {
  const buf = causalBuffer();
  const applied: Op[] = [];
  for (const o of ops) applied.push(...buf.offer(o));

  const byTarget = new Map<string, Op[]>();
  for (const o of applied) {
    const list = byTarget.get(o.target);
    if (list) list.push(o);
    else byTarget.set(o.target, [o]);
  }

  const items: Record<string, Item> = {};
  const expenses: Record<string, Expense> = {};
  const moveItems: { id: string; writes: Op<KeyPayload>[] }[] = [];

  for (const id of [...byTarget.keys()].sort()) {
    const group = byTarget.get(id)!;
    const expense = expenseOf(id, group.filter((o) => o.op.startsWith('expense.')));
    if (expense !== undefined) expenses[id] = expense;
    const adds = group.filter((o) => o.op === 'item.add').sort(byStamp) as Op<AddPayload>[];
    const first = adds[0];
    if (first === undefined) continue; // no create op seen for this target

    const life = resurrect(
      group.flatMap((o) => {
        const kind = lifeKind(o);
        return kind === undefined ? [] : [{ kind, op: o }];
      }),
    );

    const nameWrites = [
      ...adds.map((o) => ({ ...o, payload: { name: o.payload.name } })),
      ...(group.filter((o) => o.op === 'item.rename') as Op<{ name: string }>[]),
    ];
    const name = causalLww(nameWrites);
    const tick = causalLww(group.filter((o) => o.op === 'item.tick') as Op<{ ticked: boolean }>[]);
    const keyWrites = [
      ...adds.map((o) => ({ ...o, payload: { key: o.payload.key } })),
      ...(group.filter((o) => o.op === 'item.move') as Op<KeyPayload>[]),
    ];
    const pos = causalLww(keyWrites);

    const units = first.payload.units;
    const claim = claimOne(
      group.filter((o) => o.op === 'item.claim') as Op<ClaimPayload>[],
      group.filter((o) => o.op === 'item.release') as Op<ClaimPayload>[],
      units,
      life.life,
    );

    const fields: string[] = [];
    if (name.twins.length > 0) fields.push('name');
    if (tick.twins.length > 0) fields.push('ticked');
    if (pos.twins.length > 0) fields.push('pos');

    items[id] = {
      id,
      name: name.value?.name ?? first.payload.name,
      ticked: tick.value?.ticked ?? false,
      units,
      life: life.life,
      twins: { fields },
      fieldTwins: fields,
      winners: claim.winners.map((w) => w.payload.who),
      losers: claim.losers.map((l) => l.payload.who),
      pos: pos.value?.key ?? first.payload.key,
      claims: { winners: claim.winners.map(claimInfo), losers: claim.losers.map(claimInfo) },
      ...(life.active.length === 0
        ? {}
        : {
            lifeInfo: {
              deletedBy: life.active.map(authorOf),
              editedBy: life.resurrecting.map((o) => ({ by: authorOf(o), kind: EDIT_KIND[o.op] ?? 'add', op: o.id })),
            },
          }),
      values: { name: frontier(name, (p) => p.name), ticked: frontier(tick, (p) => p.ticked) },
    };
    moveItems.push({ id, writes: keyWrites });
  }

  const order = orderedMove(moveItems)
    .map((p) => p.id)
    .filter((id) => items[id]!.life !== 'deleted');
  return { items, order, expenses };
}
