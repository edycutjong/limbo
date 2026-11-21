// Properties for sector.note: generator and the kit `set` intent oracle on `note`.
import { conflictGen } from '../../../../kit/props/arbitraries/index.ts';
import { setIntent } from '../../../../kit/props/intent/index.ts';
import type { RunOptions } from '../../../../kit/props/run.ts';
import type { NotePayload, NoteState } from './sector.note.op.ts';

export const opts: RunOptions = {
  gen: conflictGen({
    targets: ['C3', 'B2', 'E3'],
    payloads: {
      'sector.note': (_rand, ctx): NotePayload => ({
        note: ctx.pick(['cracked stairwell', 'gas smell, east wall'], ['cracked stairwell', 'gas smell, east wall', 'road blocked', '']),
      }),
    },
  }),
  checks: [
    setIntent({
      write: (o) => (o.op === 'sector.note' ? (o.payload as NotePayload).note : undefined),
      read: (s: NoteState, target) => s.notes?.[target]?.note,
    }),
  ],
};
