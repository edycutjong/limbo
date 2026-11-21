import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import * as limbo from './index.ts';
import * as skeleton from '../index.ts';

const root = new URL('..', import.meta.url).pathname;
function walk(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)],
  );
}

describe('limbo entry', () => {
  it('exports exactly the layer names', () => {
    expect(Object.keys(limbo).sort()).toEqual(
      ['Fog', 'FixedStamp', 'Inspector', 'LimboShell', 'ReplicaPair', 'ShuffleTest', 'StatusChip', 'Twin', 'Wisps', 'runShuffle', 'useLimbo'].sort(),
    );
  });

  it('keeps skeleton/src/index.ts at 15 value exports with no React', () => {
    expect(Object.keys(skeleton)).toHaveLength(15);
    expect(readFileSync(join(root, 'index.ts'), 'utf8')).not.toMatch(/['"]react(-dom)?(\/[^'"]*)?['"]|\.tsx['"]|limbo\//);
  });

  it('imports yjs only in sync/store.ts', () => {
    const offenders = walk(root)
      .filter((f) => /\.tsx?$/.test(f) && !/\.test\.tsx?$/.test(f))
      .filter((f) => /from\s+['"](yjs|y-indexeddb)['"]/.test(readFileSync(f, 'utf8')))
      .map((f) => f.slice(root.length));
    expect(offenders).toEqual(['sync/store.ts']);
  });
});
