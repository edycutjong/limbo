#!/usr/bin/env node
// Kiro-share metric: product commits (touching skeleton/ or apps/) that carry a `Kiro-Session: sess_...` trailer.
// Reads git history only (read-only git log / rev-parse). Writes evidence/kiro/share.json, or prints with --check.
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

const git = (args) =>
  execFileSync('git', args, { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 }).replace(/\r\n/g, '\n');

const RS = '\x1e';
const US = '\x1f';
const TRAILER = /^Kiro-Session:[ \t]*sess_\S+[ \t]*$/m;
const PRODUCT = /^(skeleton|apps)\//;

export function computeShare() {
  const head = git(['rev-parse', 'HEAD']).trim();
  const raw = git(['log', '--no-merges', '--name-only', `--format=${RS}%H${US}%s${US}%B${US}`, head]);
  const product = [];
  for (const rec of raw.split(RS)) {
    if (!rec.trim()) continue;
    const [sha, subject, body, files = ''] = rec.split(US);
    const paths = files.split('\n').map((p) => p.trim()).filter(Boolean);
    if (!paths.some((p) => PRODUCT.test(p))) continue;
    product.push({ sha, subject, kiro: TRAILER.test(body) });
  }
  const kiroCommits = product.filter((c) => c.kiro).length;
  return {
    generated_from: head,
    product_commits: product.length,
    kiro_commits: kiroCommits,
    share: product.length === 0 ? 0 : Number((kiroCommits / product.length).toFixed(4)),
    claude_direct_commits: product.filter((c) => !c.kiro).map(({ sha, subject }) => ({ sha, subject })),
  };
}

if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith('kiro-share.mjs')) {
  const result = computeShare();
  const json = JSON.stringify(result, null, 2) + '\n';
  if (process.argv.includes('--check')) {
    process.stdout.write(json);
  } else {
    const root = git(['rev-parse', '--show-toplevel']).trim();
    const out = join(root, 'evidence', 'kiro', 'share.json');
    mkdirSync(dirname(out), { recursive: true });
    writeFileSync(out, json);
    process.stdout.write(
      `wrote evidence/kiro/share.json: ${result.kiro_commits}/${result.product_commits} (share ${result.share})\n`,
    );
  }
}
