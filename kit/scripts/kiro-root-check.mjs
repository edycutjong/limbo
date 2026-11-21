#!/usr/bin/env node
// Fails if `/.kiro` is not a tracked, non-empty folder at the repository root, if git ignores it or any file in it,
// or if any .gitignore mentions it. The Kiroween rules disqualify a repo that hides `/.kiro`.
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const problems = [];
const git = (...a) => execFileSync('git', a, { cwd: root, encoding: 'utf8' });

if (!existsSync(join(root, '.kiro')) || !statSync(join(root, '.kiro')).isDirectory()) problems.push('.kiro/ is missing at the repository root');
const tracked = git('ls-files', '.kiro').split('\n').filter(Boolean);
if (tracked.length === 0) problems.push('.kiro/ has no tracked files');
for (const need of ['specs', 'hooks', 'steering', 'agents']) {
  if (!tracked.some((f) => f.startsWith(`.kiro/${need}/`))) problems.push(`.kiro/${need}/ has no tracked files`);
}
try {
  const ignored = git('check-ignore', '--no-index', '.kiro', ...tracked).trim();
  if (ignored) problems.push(`git ignores: ${ignored.split('\n').join(', ')}`);
} catch {
  // exit 1 = nothing ignored, which is what we want
}
const walk = (dir) => readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
  if (e.name === 'node_modules' || e.name === '.git') return [];
  const p = join(dir, e.name);
  return e.isDirectory() ? walk(p) : e.name === '.gitignore' ? [p] : [];
});
for (const f of walk(root)) if (/^\s*[^#\s]*\.kiro(\/|\s*$)/m.test(readFileSync(f, 'utf8'))) problems.push(`${f.slice(root.length + 1)} ignores .kiro or a path inside it`);

if (problems.length) {
  console.error(`FAIL /.kiro root check:\n- ${problems.join('\n- ')}`);
  process.exit(1);
}
console.log(`OK /.kiro root check: ${tracked.length} tracked files, none ignored, no .gitignore mentions it`);
