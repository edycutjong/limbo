// Golden histories runner (R14). For each history, enumerate every causal delivery order with our
// own enumerator (no `simulate`), materialize each, and partial-match `expect`.
// Without `materialize` (task 9) the histories report `skipped:no-ops`. Pending histories
// (G20, G21) are skipped with their reason and never counted as passing.
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { describe, expect, it } from 'vitest';
import type { Op } from '../../skeleton/src/core/types.ts';
import { enumerateOrders, loadGoldens, partialMatch } from './golden.ts';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const MODEL = join(ROOT, 'apps', 'basecamp', 'src', 'model.ts');

type Materialize = (ops: readonly Op[]) => unknown;

async function loadMaterialize(): Promise<Materialize | undefined> {
  if (!existsSync(MODEL)) return undefined;
  const mod = (await import(pathToFileURL(MODEL).href)) as { materialize?: Materialize };
  return mod.materialize;
}

const materialize = await loadMaterialize();

describe('golden histories', () => {
  for (const g of loadGoldens()) {
    const title = g.name;
    if (g.pending !== undefined) {
      it.skip(`${title}: pending (${g.pending}; not counted as passing)`, () => {});
      continue;
    }
    if (materialize === undefined) {
      it.skip(`${title}: skipped:no-ops (no materialize yet; not counted as passing)`, () => {});
      continue;
    }
    it(`${title}: every causal order matches expect`, () => {
      let count = 0;
      for (const order of enumerateOrders(g.ops)) {
        count++;
        const r = partialMatch(materialize(order), g.expect);
        expect(r, `${title}: order ${order.map((o) => o.id).join(' ')}`).toBe(true);
      }
      expect(count).toBeGreaterThan(0);
    });
  }
});
