import { readFileSync } from 'node:fs';
import { relative } from 'node:path';
import { runHook, root, findOpFiles, opFacts, lastPropsResult } from './lib.mjs';

runHook('session-context', 'SessionStart', () => {
  const r = root();
  const lines = ['LIMBO context', 'Registered ops (name | merge | intent):'];
  const files = findOpFiles(r);
  for (const f of files) {
    const x = opFacts(readFileSync(f, 'utf8'));
    lines.push(`- ${x.name ?? '?'} | ${x.merge ?? '?'} | ${x.intent ?? '?'}  (${relative(r, f)})`);
  }
  if (!files.length) lines.push('- none yet');
  const last = lastPropsResult();
  lines.push(`Last properties result: ${last ? `${last.result} (${last.hook}, ${last.ts})` : 'none recorded'}`);
  process.stdout.write(lines.join('\n') + '\n');
  return { result: 'context', detail: `${files.length} ops` };
});
