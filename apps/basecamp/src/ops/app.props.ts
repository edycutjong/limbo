// BASECAMP hook for the mixed-script properties: the app's real fold plus the role of each op in it.
// Not an op file. The suite finds this file by name (`apps/<app>/src/ops/app.props.ts`).
import type { AppProps } from '../../../../kit/props/mixed.ts';
import type { Op } from '../../../../skeleton/src/core/types.ts';
import { materialize, type State } from '../model.ts';

const who = (name: string) => (o: Op): string | undefined => (o.op === name ? (o.payload as { who: string }).who : undefined);
const items = (s: unknown): State['items'] => (s as State).items ?? {};

const LIFE: Record<string, 'create' | 'restore' | 'delete' | 'edit'> = {
  'item.add': 'create',
  'item.restore': 'restore',
  'item.delete': 'delete',
  'item.rename': 'edit',
  'item.tick': 'edit',
  'item.claim': 'edit',
};

export const app: AppProps = {
  materialize,
  life: {
    kind: (o) => LIFE[o.op],
    read: (s, t) => items(s)[t]?.life ?? 'alive',
  },
  claim: {
    claim: who('item.claim'),
    release: who('item.release'),
    units: (p) => (p as { units: number }).units,
    winners: (s, t) => items(s)[t]?.winners ?? [],
    losers: (s, t) => items(s)[t]?.losers ?? [],
  },
  move: {
    read: (s) => (s as State).order ?? [],
    key: (o) => (o.op === 'item.add' || o.op === 'item.move' ? (o.payload as { key: string }).key : undefined),
  },
};
