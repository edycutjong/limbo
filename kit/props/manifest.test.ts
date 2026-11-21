import { describe, expect, it } from 'vitest';
import type { Intent, OpDef } from '../../skeleton/src/core/types.ts';
import { checkManifest, loadManifest } from './run.ts';

const EXPECTED: Record<string, Intent['kind']> = {
  'item.add': 'create',
  'item.tick': 'set',
  'item.rename': 'set',
  'item.delete': 'life',
  'item.restore': 'life',
  'item.claim': 'claim',
  'item.release': 'claim',
  'item.move': 'move',
  'item.adjustQty': 'delta',
  'expense.add': 'split',
  'expense.setAmount': 'split',
  'expense.addMember': 'split',
  'expense.removeMember': 'split',
  'sector.report': 'max',
  'sector.clear': 'max',
  'sector.count': 'set',
  'sector.need': 'add-remove',
  'sector.unneed': 'add-remove',
  'sector.note': 'set',
};
const VALID_KINDS: readonly string[] = ['set', 'delta', 'add-remove', 'max', 'claim', 'life', 'split', 'move', 'create'];

function def(name: string, intent: Intent): OpDef {
  return { name, merge: 'commutes', intent } as unknown as OpDef;
}

describe('intents.json (R13)', () => {
  const manifest = loadManifest();

  it('holds exactly the 19 names with the required kinds', () => {
    expect(manifest).toBeDefined();
    const kinds = Object.fromEntries(Object.entries(manifest ?? {}).map(([n, i]) => [n, i.kind]));
    expect(Object.keys(EXPECTED)).toHaveLength(19);
    expect(kinds).toEqual(EXPECTED);
  });

  it('every kind is a valid Intent kind', () => {
    for (const i of Object.values(manifest ?? {})) expect(VALID_KINDS).toContain(i.kind);
  });

  it('harness accepts a matching op and fails a wrong or missing entry (R10.6, R10.7)', () => {
    expect(checkManifest(def('item.tick', { kind: 'set', field: 'ticked' }), manifest)).toBe(true);
    expect(checkManifest(def('item.tick', { kind: 'delta', field: 'ticked' }), manifest)).toMatch(/declares intent/);
    expect(checkManifest(def('item.unknown', { kind: 'set', field: 'x' }), manifest)).toMatch(/missing from intents.json/);
  });
});
