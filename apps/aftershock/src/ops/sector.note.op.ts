// sector.note: sets a sector's note to an explicit text (never an edit script).
// Intent: a note someone has seen another note overwrite must lose to the later one; concurrent different notes
// surface as a twin for the user to pick, equal notes collapse.
// Merge: causal-lww. State keeps every write by op id and re-derives the value, so order and duplicates cannot change it.
import { causalLww } from '../../../../skeleton/src/core/merges.ts';
import type { Op, OpDef } from '../../../../skeleton/src/core/types.ts';
import { MAX_NOTE } from '../sectors.ts';

export interface NotePayload {
  note: string;
}

export interface NoteState {
  notes?: Record<string, { writes: Record<string, Op<NotePayload>>; note: string | undefined }>;
}

const def: OpDef<NoteState, NotePayload> = {
  name: 'sector.note',
  merge: 'causal-lww',
  intent: { kind: 'set', field: 'note' },
  apply(s, op: Op<NotePayload>) {
    const cur = s.notes?.[op.target];
    const writes = { ...(cur?.writes ?? {}), [op.id]: op };
    const note = causalLww(Object.values(writes)).value?.note;
    return { ...s, notes: { ...(s.notes ?? {}), [op.target]: { writes, note } } };
  },
  invariant(s) {
    for (const [t, v] of Object.entries(s.notes ?? {})) {
      if (typeof v.note !== 'string' || v.note.length > MAX_NOTE) return `target ${t} has an invalid note`;
      for (const w of Object.values(v.writes)) {
        if (typeof w.payload.note !== 'string' || w.payload.note.length > MAX_NOTE) return `write ${w.id} is not a string of at most ${MAX_NOTE} characters`;
      }
    }
    return true;
  },
};

export default def as unknown as OpDef;
