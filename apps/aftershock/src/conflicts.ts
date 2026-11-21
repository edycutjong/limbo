// AFTERSHOCK conflict descriptors (design §5). Pure; reads only the materialized state.
// Severity (max-lattice) and needs (add-wins set) lose nothing, so they surface no twin (R5.3).
import type { ConflictDescriptor } from '../../../skeleton/src/limbo/index.ts';
import type { State } from './model.ts';

const cmp = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0); // UTF-16 code-unit order

/** One descriptor per surfaced twin, ordered by (target, rule, id). */
export function describeConflicts(s: State): ConflictDescriptor[] {
  const out: ConflictDescriptor[] = [];
  for (const sector of Object.values(s.sectors)) {
    const { id } = sector;
    if (sector.noteValues.length > 1) {
      out.push({ id: `${id}:note`, target: id, rule: 'causal-lww', caption: 'Two different notes' });
    }
    for (const c of sector.counts) {
      if (c.values.length > 1) {
        out.push({ id: `${id}:count:${c.who}`, target: id, rule: 'causal-lww', caption: `Two different counts for ${c.who}` });
      }
    }
  }
  return out.sort((a, b) => cmp(a.target, b.target) || cmp(a.rule, b.rule) || cmp(a.id, b.id));
}

export const twinCount = (s: State): number => describeConflicts(s).length;
