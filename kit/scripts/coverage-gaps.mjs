#!/usr/bin/env node
// Lists every uncovered statement, branch and function from coverage/coverage-final.json as file:line,
// so a missing test can be written against the exact gap. Run after `pnpm test:coverage`.
import { readFileSync } from 'node:fs';

const data = JSON.parse(readFileSync('coverage/coverage-final.json', 'utf8'));
const root = `${process.cwd()}/`;
let n = 0;
for (const [file, f] of Object.entries(data)) {
  const rel = file.replace(root, '');
  const out = [];
  for (const [id, hits] of Object.entries(f.s)) if (hits === 0) out.push(`  statement  line ${f.statementMap[id].start.line}`);
  for (const [id, hits] of Object.entries(f.b)) {
    hits.forEach((h, i) => {
      if (h === 0) out.push(`  branch     line ${f.branchMap[id].locations[i]?.start.line ?? f.branchMap[id].loc.start.line} (${f.branchMap[id].type} #${i})`);
    });
  }
  for (const [id, hits] of Object.entries(f.f)) if (hits === 0) out.push(`  function   line ${f.fnMap[id].loc.start.line} ${f.fnMap[id].name}`);
  if (out.length) {
    console.log(rel);
    console.log(out.join('\n'));
    n += out.length;
  }
}
console.log(n === 0 ? 'No coverage gaps.' : `${n} gaps`);
process.exit(n === 0 ? 0 : 1);
