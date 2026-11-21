// ReplicaBody: one replica's body. Placeholder grid and sector card arrive in tasks 14 and 15.
import type { ReactNode } from 'react';
import { useLimbo, type Id } from '../../../../skeleton/src/limbo/index.ts';
import type { Replica } from '../../../../skeleton/src/sync/replica.ts';
import type { State } from '../model.ts';

export const EMPTY_TEXT = 'No sectors reported yet. Tap a sector to report.';

export function ReplicaBody(p: { id: Id; selected?: string | undefined }): ReactNode {
  const { replica } = useLimbo(p.id);
  const s = (replica as Replica<State>).state();
  const reported = Object.values(s.sectors).filter((x) => x.severity !== undefined).length;
  return (
    <div className="as-body">
      {reported === 0 && <p className="as-empty">{EMPTY_TEXT}</p>}
      <p className="as-selected" data-selected>
        {p.selected ? `Sector ${p.selected}` : 'No sector selected.'}
      </p>
    </div>
  );
}
