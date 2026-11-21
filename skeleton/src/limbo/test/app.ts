// The stub app of design §8: five ops, one materialize, one conflict describer. Test code, not budget.
import { render } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';
import { claimOne, causalLww, resurrect, type ClaimPayload, type LifeOp } from '../../core/merges.ts';
import type { Op, OpDef } from '../../core/types.ts';
import { createPair, type Pair } from '../../sync/pair.ts';

export const defs: OpDef[] = [
  { name: 'note.set', merge: 'causal-lww', intent: { kind: 'set', field: 'text' } },
  { name: 'note.add', merge: 'commutes', intent: { kind: 'create' } },
  { name: 'note.delete', merge: 'resurrect', intent: { kind: 'life' } },
  { name: 'note.restore', merge: 'resurrect', intent: { kind: 'life' } },
  { name: 'note.claim', merge: 'claim-one', intent: { kind: 'claim' } },
];

export interface Note {
  id: string;
  text: string | undefined;
  life: 'alive' | 'deleted' | 'twin';
  winner: string | undefined;
  losers: string[];
  setTwins: number;
}
export interface StubState {
  notes: Note[];
}
/** A conflict a user should see. `kind` names the merge that surfaced it. */
export interface Descriptor {
  id: string;
  kind: 'resurrect' | 'claim-one';
  target: string;
}

const LIFE: Record<string, LifeOp['kind']> = {
  'note.add': 'create',
  'note.restore': 'restore',
  'note.delete': 'delete',
  'note.set': 'edit',
};

export function materialize(ops: readonly Op[]): StubState {
  const targets = [...new Set(ops.map((o) => o.target))].sort();
  const notes = targets.map((id): Note => {
    const mine = ops.filter((o) => o.target === id);
    const life = resurrect(mine.filter((o) => o.op in LIFE).map((op) => ({ kind: LIFE[op.op]!, op })));
    const text = causalLww(mine.filter((o) => o.op === 'note.set') as Op<string>[]);
    const claims = claimOne(mine.filter((o) => o.op === 'note.claim') as Op<ClaimPayload>[], [], 1, life.life);
    return {
      id,
      text: text.value,
      life: life.life,
      winner: claims.winners[0]?.payload.who,
      losers: claims.losers.map((c) => c.payload.who),
      setTwins: text.twins.length,
    };
  });
  return { notes };
}

export const twinCount = (s: StubState): number =>
  s.notes.reduce((n, x) => n + (x.life === 'twin' ? 1 : 0) + x.losers.length + x.setTwins, 0);

export function describeConflicts(s: StubState): Descriptor[] {
  return s.notes.flatMap((n): Descriptor[] => [
    ...(n.life === 'twin' ? [{ id: `${n.id}:life`, kind: 'resurrect' as const, target: n.id }] : []),
    ...n.losers.map((who) => ({ id: `${n.id}:claim:${who}`, kind: 'claim-one' as const, target: n.id })),
  ]);
}

let uid = 0;
/** A real pair over the stub app: fake-indexeddb stores and a manual scheduler (call `pair.settle()`). */
export function makeStubPair(): Promise<Pair<StubState>> {
  return createPair<StubState>({
    app: `stub-${uid++}`,
    defs,
    materialize,
    twinCount,
    seedOps: [],
    schedule: () => undefined,
  });
}

/** Renders `ui` for a pair. Task 4 wraps this in `LimboShell`. */
export function renderApp(pair: Pair<StubState>, ui: ReactNode = null): ReturnType<typeof render> {
  void pair;
  return render(createElement('div', { 'data-testid': 'app' }, ui));
}
