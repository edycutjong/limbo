// ReplicaBody (skeleton): one replica's list and expenses as plain text. Rows, twins and
// controls arrive in tasks 12 to 17; this keeps the seed order visible and the card mounted.
import type { ReactNode } from 'react';
import { useLimbo, type Id } from '../../../../skeleton/src/limbo/index.ts';
import { formatCents } from '../money.ts';
import type { State } from '../model.ts';

export function ReplicaBody(p: { id: Id }): ReactNode {
  const { replica } = useLimbo(p.id);
  const s = replica.state() as State;
  return (
    <div className="bc-body">
      <ul className="bc-list" aria-label="Packing list">
        {s.order.map((id) => (
          <li key={id} data-limbo-row data-item={id}>
            {s.items[id]!.name}
          </li>
        ))}
      </ul>
      <ul className="bc-expenses" aria-label="Shared expenses">
        {Object.values(s.expenses).map((e) => (
          <li key={e.id}>{`${e.label} ${formatCents(e.amountCents)}`}</li>
        ))}
      </ul>
    </div>
  );
}
