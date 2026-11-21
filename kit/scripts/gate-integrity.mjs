#!/usr/bin/env node
// gate-integrity: compare the protected gate set with evidence/kiro/gate-manifest.json.
//   --write  hash the set and write the manifest.
//   (none)   re-hash; exit 1 listing added / removed / changed files, exit 0 when equal.
// LIMBO_GATE_ROOT overrides the repository root (used by tests).
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { hashGate } from './gate-list.mjs';

export function manifestPath(root) {
  return join(root, 'evidence/kiro/gate-manifest.json');
}

export function writeManifest(root) {
  const hashes = hashGate(root);
  mkdirSync(dirname(manifestPath(root)), { recursive: true });
  writeFileSync(manifestPath(root), JSON.stringify({ algorithm: 'sha256', files: hashes }, null, 2) + '\n');
  return hashes;
}

/** Differences between the manifest and the current files. */
export function diffGate(root) {
  const mp = manifestPath(root);
  if (!existsSync(mp)) return { missingManifest: true, added: [], removed: [], changed: [] };
  const want = JSON.parse(readFileSync(mp, 'utf8')).files ?? {};
  const have = hashGate(root);
  return {
    missingManifest: false,
    added: Object.keys(have).filter((k) => !(k in want)),
    removed: Object.keys(want).filter((k) => !(k in have)),
    changed: Object.keys(have).filter((k) => k in want && have[k] !== want[k]),
  };
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  const root = process.env.LIMBO_GATE_ROOT || join(dirname(fileURLToPath(import.meta.url)), '..', '..');
  if (process.argv.includes('--write')) {
    const h = writeManifest(root);
    console.log(`gate-integrity: wrote ${Object.keys(h).length} hashes to evidence/kiro/gate-manifest.json`);
  } else {
    const d = diffGate(root);
    if (d.missingManifest) {
      console.error('gate-integrity: evidence/kiro/gate-manifest.json is missing; run with --write');
      process.exit(1);
    }
    const lines = [...d.added.map((f) => `added: ${f}`), ...d.removed.map((f) => `removed: ${f}`), ...d.changed.map((f) => `changed: ${f}`)];
    if (lines.length > 0) {
      console.error(`gate-integrity: protected files differ from the manifest:\n${lines.join('\n')}`);
      process.exit(1);
    }
    console.log('gate-integrity: ok');
  }
}
