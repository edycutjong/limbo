import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import * as skeleton from './index.ts';

const here = new URL('.', import.meta.url).pathname;
function sources(dir: string): string[] {
  return readdirSync(join(here, dir)).filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts')).map((f) => join(dir, f));
}
function allSources(): string[] {
  return [...sources('core'), ...sources('sync')];
}

describe('index exports', () => {
  it('exports exactly the 15 expected value names', () => {
    expect(Object.keys(skeleton).sort()).toEqual(
      [
        'acquireIdentity', 'attachLink', 'canonical', 'causalBuffer', 'compareStamp', 'concurrent', 'covers',
        'createInPageLink', 'createOp', 'createPair', 'createReplica', 'deriveSync', 'explainTrace', 'merges', 'simulate',
      ].sort(),
    );
  });

  it('keeps yjs and y-indexeddb inside store.ts', () => {
    const offenders = allSources().filter(
      (f) => f !== join('sync', 'store.ts') && /from\s+['"](yjs|y-indexeddb)['"]|require\(['"](yjs|y-indexeddb)/.test(readFileSync(join(here, f), 'utf8')),
    );
    expect(offenders).toEqual([]);
  });

  it('keeps banned APIs out of sync/', () => {
    const banned = /BroadcastChannel|SharedWorker|Date\.now|Math\.random/;
    const offenders = sources('sync').filter((f) => banned.test(readFileSync(join(here, f), 'utf8')));
    expect(offenders).toEqual([]);
  });
});
