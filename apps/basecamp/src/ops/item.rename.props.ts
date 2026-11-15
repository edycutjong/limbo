// Properties for item.rename: generator and the kit `set` intent oracle on `name`.
import { basecampPayloads, conflictGen } from '../../../../kit/props/arbitraries/index.ts';
import { setIntent } from '../../../../kit/props/intent/index.ts';
import type { RunOptions } from '../../../../kit/props/run.ts';
import type { RenamePayload, RenameState } from './item.rename.op.ts';

export const opts: RunOptions = {
  gen: conflictGen({
    payloads: { 'item.rename': basecampPayloads['item.rename']! },
  }),
  checks: [
    setIntent({
      write: (o) => (o.op === 'item.rename' ? (o.payload as RenamePayload).name : undefined),
      read: (s: RenameState, target) => s.names?.[target]?.name,
    }),
  ],
};
