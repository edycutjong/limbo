import { existsSync, readFileSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { runHook, root, opFacts, OP_FILE_RE } from './lib.mjs';

const BANNED = ['Date.now', 'new Date', 'performance.now', 'Math.random', 'crypto.randomUUID', 'toLocale'];

function manifestKind(manifest, name) {
  const m = manifest?.ops ?? manifest;
  let e = Array.isArray(m) ? m.find((x) => x && x.name === name) : m?.[name];
  if (e == null) return undefined;
  if (typeof e === 'string') return e;
  return e.intent?.kind ?? e.kind ?? (typeof e.intent === 'string' ? e.intent : undefined);
}

runHook('op-lint', 'PostFileSave', (ev) => {
  const file = ev.file_path ? resolve(ev.cwd ?? root(), ev.file_path) : '';
  if (!OP_FILE_RE.test(file.replace(/\\/g, '/')) || !existsSync(file)) return { result: 'pass', target: file || null, detail: 'not an op file' };
  const f = opFacts(readFileSync(file, 'utf8'));
  const v = []; // [ruleId, message]
  for (const t of BANNED) if (f.code.includes(t)) v.push(['no-nondeterminism', `banned token ${t}`]);
  if (!f.merge) v.push(['merge-declared', 'no `merge:` declared']);
  if (!f.hasIntent) v.push(['intent-declared', 'no `intent:` declared']);
  else if (!f.intent) v.push(['intent-declared', '`intent:` has no `kind`']);
  if (!f.name) v.push(['op-name', 'no `name:` found']);
  else {
    let manifest = null;
    try { manifest = JSON.parse(readFileSync(join(root(), 'kit', 'props', 'intents.json'), 'utf8')); } catch { /* handled below */ }
    if (!manifest) v.push(['intent-manifest', 'kit/props/intents.json missing or unreadable']);
    else {
      const k = manifestKind(manifest, f.name);
      if (k === undefined) v.push(['intent-manifest', `op '${f.name}' not in kit/props/intents.json`]);
      else if (f.intent && k !== f.intent) v.push(['intent-matches-manifest', `op '${f.name}' declares intent kind '${f.intent}', manifest says '${k}'`]);
    }
  }
  if (f.merge === 'commutes' && !existsSync(join(dirname(file), `${basename(file, '.op.ts')}.props.test.ts`)))
    v.push(['commutes-needs-props', 'merge: commutes requires a .props.test.ts']);
  if (!v.length) return { result: 'pass', target: file };
  for (const [id, msg] of v) process.stderr.write(`op-lint ${basename(file)}: [${id}] ${msg}\n`);
  return { result: 'fail', target: file, detail: [...new Set(v.map((x) => x[0]))].join(','), exit: 1 };
});
