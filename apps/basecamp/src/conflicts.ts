// BASECAMP conflict descriptors (design §6). Pure; reads only the materialized state.
// Concurrent item.move writes are not twins (R9.3): ordered-move places them deterministically.
import type { ConflictDescriptor } from '../../../skeleton/src/limbo/index.ts';
import type { State } from './model.ts';

const cmp = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0); // UTF-16 code-unit order

/** One descriptor per surfaced twin, ordered by (target, rule, id). Deleted items surface nothing. */
export function describeConflicts(s: State): ConflictDescriptor[] {
  const out: ConflictDescriptor[] = [];
  for (const item of Object.values(s.items)) {
    if (item.life === 'deleted') continue;
    const { id } = item;
    if (item.life === 'twin') {
      out.push({ id: `${id}:life`, target: id, rule: 'resurrect', caption: 'Deleted and edited at the same time' });
    }
    for (const who of item.losers) {
      out.push({ id: `${id}:claim:${who}`, target: id, rule: 'claim-one', caption: `${who}'s claim lost` });
    }
    if (item.fieldTwins.includes('name')) {
      out.push({ id: `${id}:name`, target: id, rule: 'causal-lww', caption: 'Two different names' });
    }
    if (item.fieldTwins.includes('ticked')) {
      out.push({ id: `${id}:ticked`, target: id, rule: 'causal-lww', caption: 'Ticked and not ticked' });
    }
  }
  for (const e of Object.values(s.expenses)) {
    if (e.values.length > 1) {
      out.push({ id: `${e.id}:amount`, target: e.id, rule: 'causal-lww', caption: 'Two different amounts' });
    }
  }
  return out.sort((a, b) => cmp(a.target, b.target) || cmp(a.rule, b.rule) || cmp(a.id, b.id));
}

export const twinCount = (s: State): number => describeConflicts(s).length;
