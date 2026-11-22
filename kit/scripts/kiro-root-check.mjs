#!/usr/bin/env node
// Fails if `/.kiro` is not a tracked, non-empty folder at the repository root, if git ignores it or any file in it,
// or if any .gitignore mentions it. The Kiroween rules disqualify a repo that hides `/.kiro`.
import { execFileSync, spawnSync } from 'node:child_process';
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
const walk = (dir) => readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
  if (e.name === 'node_modules' || e.name === '.git') return [];
  const p = join(dir, e.name);
  return e.isDirectory() ? walk(p) : e.name === '.gitignore' ? [p] : [];
});
// Every file under .kiro on disk, tracked or not, goes to check-ignore (an ignored untracked file would never reach a commit).
const onDisk = existsSync(join(root, '.kiro'))
  ? readdirSync(join(root, '.kiro'), { recursive: true, withFileTypes: true })
      .filter((e) => e.isFile() && e.name !== '.DS_Store')
      .map((e) => join(e.parentPath ?? e.path, e.name).slice(root.length + 1))
  : [];
const candidates = [...new Set(['.kiro', ...tracked, ...onDisk])];
const ci = spawnSync('git', ['check-ignore', '--no-index', '--stdin'], { cwd: root, encoding: 'utf8', input: candidates.join('\n') + '\n' });
if (ci.status === 0) problems.push(`git ignores: ${ci.stdout.trim().split('\n').join(', ')}`);
else if (ci.status !== 1) problems.push(`git check-ignore failed (exit ${ci.status}): ${(ci.stderr || ci.error?.message || '').trim()}`);
for (const f of walk(root)) if (/^\s*[^#!\s]*\.kiro(?:[\/*?[]|\s*$)/m.test(readFileSync(f, 'utf8'))) problems.push(`${f.slice(root.length + 1)} ignores .kiro or a path inside it`);

if (problems.length) {
  console.error(`FAIL /.kiro root check:\n- ${problems.join('\n- ')}`);
  process.exit(1);
}
console.log(`OK /.kiro root check: ${tracked.length} tracked files, none ignored, no .gitignore mentions it`);
