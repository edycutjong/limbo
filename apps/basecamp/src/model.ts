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
import type { Op } from '../../../skeleton/src/core/types.ts';

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
}

export interface State {
  items: Record<string, Item>;
  /** Non-deleted item ids in display order. */
  order: string[];
}

interface AddPayload {
  name: string;
  key: string;
  units: number;
}

const byStamp = (a: Op, b: Op): number =>
  a.stamp.l !== b.stamp.l ? a.stamp.l - b.stamp.l : a.stamp.r !== b.stamp.r ? (a.stamp.r < b.stamp.r ? -1 : 1) : a.stamp.n - b.stamp.n;

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
  const moveItems: { id: string; writes: Op<KeyPayload>[] }[] = [];

  for (const id of [...byTarget.keys()].sort()) {
    const group = byTarget.get(id)!;
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
    };
    moveItems.push({ id, writes: keyWrites });
  }

  const order = orderedMove(moveItems)
    .map((p) => p.id)
    .filter((id) => items[id]!.life !== 'deleted');
  return { items, order };
}
