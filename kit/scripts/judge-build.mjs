#!/usr/bin/env node
// Renders the /judge page (site/judge.html), its Markdown mirror (JUDGE.md) and the page's in-page instrument bundle
// (site/assets/judge.js) from one source, so the three never drift:
//   - every number is read from a committed file under evidence/, counted from the tree, or computed from HEAD's own code
//     (the instrument's engine states and its recorded shuffle come from site/src/judge.ts, run in Node here);
//   - every repository path the page links is checked to exist and to be tracked by git; a missing one stops the build;
//   - quoted outputs (the verify block, UI labels) are checked against the files they quote.
// `--check` re-renders into memory and fails when any of the three files differs from the committed copy (CI gate).
// Usage: node kit/scripts/judge-build.mjs [--check]
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { gzipSync } from 'node:zlib';
import { build } from 'vite';

const CHECK = process.argv.includes('--check');
const fail = (msg) => {
  console.error(`judge-build: ${msg}`);
  process.exit(1);
};
const assert = (cond, msg) => cond || fail(msg);
const read = (f) => readFileSync(f, 'utf8');
const json = (f) => JSON.parse(read(f));
const jsonl = (f) => read(f).trim().split('\n').map((l) => JSON.parse(l));
const n = (x) => Number(x).toLocaleString('en-US');
const pct = (x) => `${(x * 100).toFixed(2)}%`;
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

const SITE = 'https://limbo.edycu.dev';
const REPO = 'https://github.com/edycutjong/limbo';
const DEVPOST = 'https://devpost.com/software/limbo-offline-merge-skeleton-two-apps';
const VIDEO = 'https://youtu.be/V4m3zTV5MPs';
const EVENT = 'https://kiroween.devpost.com/';
const URLS = {
  basecamp: 'https://basecamp.limbo.edycu.dev/?replicas=2',
  aftershock: 'https://aftershock.limbo.edycu.dev/?replicas=2',
  landing: `${SITE}/`,
  deck: `${SITE}/deck/`,
};
const CLAIM = 'When the connection dies, your app keeps working. When it returns, an item deleted while it was edited comes back as a ghost twin, and a lost claim is shown to its owner.';

// ---------------------------------------------------------------- evidence (read, never typed)
const conv = json('evidence/convergence/full-2026-11-22.json');
const tally = json('evidence/kiro/tally.json');
const ci = json('evidence/ci/latest.json');
const share = json('evidence/kiro/share.json');
const lean = json('evidence/lean.json');
const ab = json('evidence/kiro/ab/results.json');
const sessions = jsonl('evidence/kiro/sessions.jsonl');
const hookRows = jsonl('evidence/kiro/hooks.jsonl');
const CI_LOG = `evidence/ci/local-${json('evidence/ci/latest.json').date.slice(0, 10)}.txt`;
const ciLog = read(CI_LOG);
const g2 = read('evidence/kiro/g2/kiro-closing.txt');
const failures = Object.values(conv.failuresPerProperty).reduce((a, b) => a + b, 0);
const kiroRows = sessions.filter((r) => r.actor === 'kiro');
const handRows = sessions.filter((r) => r.actor !== 'kiro');

// the ledgers agree with their tally (the tally is recomputed by kit/scripts/readme-tally.mjs)
assert(hookRows.length === tally.hook_fires_total, `hooks.jsonl has ${hookRows.length} rows, tally says ${tally.hook_fires_total}`);
assert(sessions.length === tally.sessions_total && kiroRows.length === tally.kiro_sessions && handRows.length === tally.claude_direct_rows, 'sessions.jsonl disagrees with tally.json');
assert(share.product_commits === tally.product_commits && share.kiro_commits === tally.kiro_product_commits && share.share === tally.kiro_share, 'share.json disagrees with tally.json');
assert(share.claude_direct_commits.length === share.product_commits - share.kiro_commits, 'share.json does not list every non-Kiro product commit');
assert(conv.passed === true && failures === 0, 'the committed full-tier run is not a clean pass');
assert(ci.all_passed === true && ci.tree_dirty === false, 'evidence/ci/latest.json is not a clean green run');
const stopBlocks = hookRows.filter((r) => r.hook === 'stop-gate' && r.result === 'block');
assert(stopBlocks.length === tally.agent_stop_blocks_hooklog, 'stop-gate block rows disagree with the tally');
const seeded = stopBlocks.find((r) => r.session_id.startsWith('sess_545bc98d'));
const unplanned = stopBlocks.find((r) => r !== seeded);
assert(seeded && unplanned, 'expected the seeded and the unplanned Stop block');

// counted from the tree now
const ls = (d) => readdirSync(d).sort();
const WORKFLOWS = ls('.github/workflows').filter((f) => f.endsWith('.yml'));
const wfName = (f) => (read(`.github/workflows/${f}`).match(/^name:\s*(.+)$/m) || [])[1];
const SPECS = ls('.kiro/specs').filter((d) => statSync(`.kiro/specs/${d}`).isDirectory());
const specKind = (d) => (existsSync(`.kiro/specs/${d}/bugfix.md`) ? 'bugfix' : 'feature');
const HOOKS = ls('.kiro/hooks').filter((f) => f.endsWith('.json')).map((f) => ({ file: f, ...json(`.kiro/hooks/${f}`).hooks[0] }));
const STEERING = ls('.kiro/steering').filter((f) => f.endsWith('.md')).map((f) => ({ file: f, inclusion: (read(`.kiro/steering/${f}`).match(/^inclusion:\s*(\S+)/m) || [])[1] }));
const AGENTS = ls('.kiro/agents').filter((f) => f.endsWith('.json')).map((f) => json(`.kiro/agents/${f}`));
const BAD = ls('kit/props/bad').filter((f) => f.endsWith('.ts') && !['index.ts', 'shared.ts', 'types.ts'].includes(f));
const PROMPTS = ls('evidence/kiro/prompts').filter((f) => f.endsWith('.md'));
const MERGES = (read('skeleton/src/core/types.ts').match(/export type Merge = ([^;]+);/) || [])[1]?.match(/'[^']+'/g)?.map((s) => s.slice(1, -1)) ?? [];
const OPS = ['basecamp', 'aftershock'].flatMap((app) => ls(`apps/${app}/src/ops`).filter((f) => f.endsWith('.op.ts')).map((f) => ({ app, merge: (read(`apps/${app}/src/ops/${f}`).match(/merge:\s*'([^']+)'/) || [])[1] })));
const mcpTools = (AGENTS.find((a) => a.name === 'limbo-builder')?.allowedTools ?? []).filter((t) => t.startsWith('@limbo-convergence/')).map((t) => t.split('/')[1]);
const agentRuns = kiroRows.reduce((m, r) => ((m[r.agent] = (m[r.agent] ?? 0) + 1), m), {});
const touches = (r, prefixes) => (r.files_changed ?? []).some((f) => prefixes.some((p) => f.startsWith(p)));
const touched = (...prefixes) => ({ kiro: kiroRows.filter((r) => touches(r, prefixes)).length, hand: handRows.filter((r) => touches(r, prefixes)).length });
const handEdits = handRows.filter((r) => (r.files_changed ?? []).length > 0).length;
const handNotes = handRows.length - handEdits;
const handText = handNotes ? `${handRows.length} hand rows (${handEdits} edits made outside Kiro, ${handNotes} attribution ${handNotes === 1 ? 'correction' : 'corrections'})` : `${handRows.length} hand rows (edits made outside Kiro)`;
// Hook-log rows that Kiro started by hand from its shell: a guard-shell row in the same session, at most 10 s earlier, whose
// command runs kit/hooks/<hook>.mjs with node, or was cut off by the logger mid-way through that path ("… | node kit").
// The log truncates commands, so this is a lower bound and the page says "at least".
const runsHookByHand = (g, hook) => {
  const t = g.target ?? '';
  const cut = t.match(/\|\s*node\s+(kit[\w/.-]*)$/);
  return new RegExp(`node\\s+kit/hooks/${hook}\\.mjs`).test(t) || Boolean(cut && `kit/hooks/${hook}.mjs`.startsWith(cut[1]));
};
const manualHookRuns = hookRows.filter((r, i) => r.hook !== 'guard-shell' && hookRows.slice(Math.max(0, i - 12), i).some((g) => g.hook === 'guard-shell' && g.session_id === r.session_id && Date.parse(r.ts) - Date.parse(g.ts) <= 10000 && runsHookByHand(g, r.hook))).length;
assert(manualHookRuns >= 5, `expected at least 5 hand-started hook runs, found ${manualHookRuns}`);
const simulateHand = handRows.filter((r) => (r.files_changed ?? []).includes('skeleton/src/core/simulate.ts')).length;
const aftershockSkeleton = kiroRows.filter((r) => r.spec === 'aftershock' && (r.files_changed ?? []).some((f) => f.startsWith('skeleton/'))).length;
const mcpHand = handRows.find((r) => (r.files_changed ?? []).includes('.kiro/settings/mcp.json'));
const ledgerSpecSessions = SPECS.reduce((a, s) => a + (tally.specs[s] ?? 0), 0);
assert(WORKFLOWS.length === 7, `expected 7 workflows, got ${WORKFLOWS.length}`);
assert(SPECS.length === tally.spec_dirs, `.kiro/specs has ${SPECS.length} specs, tally says ${tally.spec_dirs}`);
assert(ledgerSpecSessions === tally.kiro_executed_spec_tasks, 'per-spec sessions do not sum to the spec-session total');
assert(HOOKS.length === Object.keys(tally.hooks_by_hook).length && HOOKS.every((h) => tally.hooks_by_hook[h.name] !== undefined), 'hook files disagree with the hook log');
assert(STEERING.length === 6 && AGENTS.length === 2, 'expected 6 steering files and 2 custom agents');
assert(BAD.length === 15, `expected 15 wrong ops in kit/props/bad, got ${BAD.length}`);
assert(MERGES.length === 6, 'could not read the six merge rules from skeleton/src/core/types.ts');
assert(OPS.length === lean.basecamp_ops + lean.aftershock_ops && OPS.every((o) => MERGES.includes(o.merge)), 'op files disagree with lean.json or declare an unknown merge');
assert(Object.values(agentRuns).reduce((a, b) => a + b, 0) === tally.kiro_sessions, 'agent split does not sum to the Kiro sessions');
assert(aftershockSkeleton === 0, 'an aftershock spec session changed skeleton/; the Skeleton Crew line would be wrong');
assert(mcpHand, 'expected the claude-direct row for .kiro/settings/mcp.json');
const usedMerges = [...new Set(OPS.map((o) => o.merge))];
assert(usedMerges.length === MERGES.length || (usedMerges.length === MERGES.length - 1 && !usedMerges.includes('sum-split') && read('apps/basecamp/src/ops/expense.state.ts').includes('sumSplit(')), 'the sum-split note on the page would be wrong');
const techMd = read('.kiro/steering/tech.md');
const BUDGET = { files: Number((techMd.match(/At most (\d+) files and ([\d,]+) TS\/TSX lines/) || [])[1]), lines: (techMd.match(/At most \d+ files and ([\d,]+) TS\/TSX lines/) || [])[1], first: (techMd.match(/the provisional ([\d,]+) was exceeded/) || [])[1] };
assert(BUDGET.files && BUDGET.lines && BUDGET.first, 'skeleton budget not found in .kiro/steering/tech.md');
const guardEdits = (read('evidence/kiro/ab/observations.md').match(/Kiro edited the gate in (\d+) of (\d+) arm-B runs/) || []).slice(1).map(Number);
assert(guardEdits.length === 2 && ab.arms.B.stop_blocks > 0, 'A/B observations moved');
const DECK_SLIDES = (read('site/deck/index.html').match(/<section class="slide/g) || []).length;
assert(DECK_SLIDES >= 10, `deck slides not counted (${DECK_SLIDES})`);
const SKEL_DIRS = ls('skeleton/src').filter((d) => statSync(`skeleton/src/${d}`).isDirectory());
const MAX_BLOCKS = Number((read('kit/hooks/stop-gate.mjs').match(/const MAX_BLOCKS = (\d+);/) || [])[1]);
const EXCHANGES = Number((read('skeleton/src/sync/status.ts').match(/\.slice\(-(\d+)\)/) || [])[1]);
const FULL_MIN = Math.round(conv.durationMs / 60000);
const WORDS = ['zero', 'one', 'two', 'three', 'four', 'five'];
assert(MAX_BLOCKS > 0 && EXCHANGES > 0 && FULL_MIN > 0, 'stop-gate MAX_BLOCKS, the exchange-log length or the full-tier duration not found');
const vitestCfg = read('vitest.config.ts');
assert(/lines:\s*100/.test(vitestCfg) && /branches:\s*100/.test(vitestCfg) && /functions:\s*100/.test(vitestCfg) && /statements:\s*100/.test(vitestCfg), 'vitest.config.ts no longer gates coverage at 100%');

// UI labels the path quotes, checked against the app source
const labels = {
  'Cut link': 'skeleton/src/limbo/pair-view.tsx',
  'Restore link': 'skeleton/src/limbo/pair-view.tsx',
  'Play the lake scene': 'apps/basecamp/src/views/ScenePanel.tsx',
  'Play the survey scene': 'apps/aftershock/src/views/ScenePanel.tsx',
  'Run shuffle test': 'skeleton/src/limbo/shuffle-test.tsx',
  '>Keep</Button>': 'apps/basecamp/src/views/ItemTwins.tsx',
  '>OK</Button>': 'apps/basecamp/src/views/ItemTwins.tsx',
  'deleted this while ${editor} ${verb} it · rule: resurrect': 'apps/basecamp/src/views/ItemTwins.tsx',
  'both claimed this · rule: claim-one': 'apps/basecamp/src/views/ItemTwins.tsx',
  '>FIXED<': 'skeleton/src/limbo/marks.tsx',
  'orderings → same state': 'skeleton/src/limbo/shuffle-test.tsx',
  'reported${parts.length': 'apps/aftershock/src/views/SectorCard.tsx',
  "{`Keep ${author(v.by)}'s note`}": 'apps/aftershock/src/views/SectorTwins.tsx',
  'Inspector': 'skeleton/src/limbo/inspector.tsx',
};
for (const [s, f] of Object.entries(labels)) assert(read(f).includes(s), `UI label "${s}" is not in ${f}`);
const LINK_CAPTION = (read('skeleton/src/limbo/pair-view.tsx').match(/LINK_CAPTION = '([^']+)'/) || [])[1];
assert(LINK_CAPTION, 'LINK_CAPTION not found');

// the video: chapters and the transcript, from docs/VIDEO.md (published YouTube chapters + the caption cue times)
const videoMd = read('docs/VIDEO.md');
const toSec = (t) => t.split(':').reduce((a, x) => a * 60 + Number(x), 0);
const section = (h) => (videoMd.split(`## ${h}\n`)[1] || '').split('\n## ')[0];
const CHAPTERS = [...section('Chapters').matchAll(/^- (\d+:\d\d) (.+)$/gm)].map((m) => ({ t: m[1], s: toSec(m[1]), label: m[2], vo: [] }));
const CUES = [...section('Transcript').matchAll(/^- (\d+:\d\d\.\d) (.+)$/gm)].map((m) => ({ s: toSec(m[1]), text: m[2] }));
assert(CHAPTERS.length === 9 && CUES.length > 40, 'docs/VIDEO.md chapters or transcript missing');
for (const c of CUES) [...CHAPTERS].reverse().find((ch) => ch.s <= c.s).vo.push(c.text);
assert(CHAPTERS.every((ch) => ch.vo.length > 0), 'a chapter has no voiceover cue');
const VIDEO_LEN = (videoMd.match(/public, (\d:\d\d)\)/) || [])[1];
assert(VIDEO_LEN === '2:47', 'video length not found in docs/VIDEO.md');
const ONSCREEN = Object.fromEntries([...section('On screen').matchAll(/^- (\d+:\d\d) (.+)$/gm)].map((m) => [m[1], m[2]]));
const KIRO_TAGS = { '1:43': 'the /.kiro tree', '2:00': 'a logged session, replayed' };
assert(ONSCREEN['1:43']?.includes('/.kiro') && ONSCREEN['2:00']?.includes('sess_545bc98d') && ONSCREEN['0:00']?.includes('twin'), 'docs/VIDEO.md On screen section moved');

// the verify block quotes outputs: they must still be in the files they come from
const testsLine = `Tests  ${ci.unit.passed} passed | ${ci.unit.skipped} skipped (${ci.unit.passed + ci.unit.skipped})`;
const e2eLine = `  ${ci.e2e.skipped} skipped\n  ${ci.e2e.passed} passed`;
assert(ciLog.includes(testsLine) && ciLog.includes(e2eLine) && ciLog.includes('RESULT: all steps passed'), `verify block drifted from ${CI_LOG}`);
assert(ci.commit.startsWith(ciLog.match(/commit:\s*([0-9a-f]{7,})/)?.[1] ?? '@@'), 'the CI log and latest.json name different commits');
const failLines = g2.split('\n').filter((l) => l.includes('FAIL  |props|')).map((l) => l.trim().replace(/^FAIL\s+\|props\|\s+/, ''));
const kiroSaid = (g2.match(/`item\.tick\.op\.ts` stores `at: Date\.now\(\)` in its state\./) || [])[0];
assert(failLines.length === 3 && kiroSaid, 'the G2 transcript lines moved');

// ---------------------------------------------------------------- links: every repository path is checked
const tracked = new Set(execFileSync('git', ['ls-files'], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }).split('\n').filter(Boolean));
const linked = new Set();
const isDir = (p) => p.endsWith('/');
function gh(p, label, cls = '') {
  linked.add(p);
  const url = `${REPO}/${isDir(p) ? 'tree' : 'blob'}/main/${p.replace(/\/$/, '')}`;
  return `<a${cls ? ` class="${cls}"` : ''} href="${url}">${esc(label ?? p)}</a>`;
}
const ghc = (sha) => `<a href="${REPO}/commit/${sha}"><code>${sha}</code></a>`;
// A missing path always fails. An existing but untracked one fails under --check (CI, where only tracked files exist) and
// warns otherwise, so a freshly written receipt (kit/scripts/ci-local.mjs) can be rendered and then staged.
function checkLinks() {
  const missing = [...linked].filter((p) => !existsSync(p.replace(/\/$/, '')));
  const untracked = [...linked].filter((p) => {
    const q = p.replace(/\/$/, '');
    return existsSync(q) && (isDir(p) ? ![...tracked].some((t) => t.startsWith(`${q}/`)) : !tracked.has(q));
  });
  if (missing.length) fail(`the page links paths that are missing in the repo:\n- ${missing.join('\n- ')}`);
  if (untracked.length && CHECK) fail(`the page links paths that git does not track:\n- ${untracked.join('\n- ')}`);
  if (untracked.length) console.warn(`judge-build: stage these before committing (linked but untracked): ${untracked.join(', ')}`);
  return linked.size;
}

// ---------------------------------------------------------------- the instrument: bundle + engine states from HEAD's code
const quiet = { logLevel: 'warn', configFile: false };
const entry = resolve('site/src/judge.ts');
const tmp = mkdtempSync(join(tmpdir(), 'limbo-judge-'));
let bundle;
let P;
try {
  await build({ ...quiet, build: { lib: { entry, formats: ['iife'], name: 'LimboJudge', fileName: () => 'judge.js' }, outDir: tmp, emptyOutDir: false, minify: true, target: 'es2020' } });
  bundle = readFileSync(join(tmp, 'judge.js'));
  await build({ ...quiet, build: { lib: { entry, formats: ['es'], fileName: () => 'judge.node.mjs' }, outDir: tmp, emptyOutDir: false, minify: false, target: 'node22' } });
  P = await (await import(pathToFileURL(join(tmp, 'judge.node.mjs')).href)).prerender();
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
const bundleKB = Math.round(bundle.length / 1024);
const bundleGzKB = Math.round(gzipSync(bundle, { level: 9 }).length / 1024);
const bundleV = createHash('sha256').update(bundle).digest('hex').slice(0, 10);
const css = read('site/src/judge.css');
const ogV = createHash('sha256').update(readFileSync('site/assets/og-image.png')).digest('hex').slice(0, 10);

// ---------------------------------------------------------------- page parts
const ICON = {
  open: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/></svg>',
  play: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5v14l11-7z"/></svg>',
  src: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M8 6l-5 6 5 6M16 6l5 6-5 6"/></svg>',
  down: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M12 5v14M6 13l6 6 6-6"/></svg>',
};
const roman = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'];
const PLATES = [
  ['crew', 'Skeleton Crew'],
  ['path', 'The 60-second path'],
  ['run', 'Run it on this page'],
  ['criteria', 'The five criteria'],
  ['kiro', 'Kiro, file by file'],
  ['video', 'The video, by chapter'],
  ['receipts', 'Receipts'],
  ['real', 'Real or simulated'],
  ['verify', 'Verify from a clone'],
  ['limits', 'Honest limits'],
];
const plateNo = (id) => roman[PLATES.findIndex(([k]) => k === id)];
const head = (id, h2, sub) => `<div class="sec-head"><p class="plate-no">plate <b>${plateNo(id)}</b> · ${esc(PLATES.find(([k]) => k === id)[1].toLowerCase())}</p><h2 id="h-${id}">${h2}</h2>${sub}</div>`;

// replica plates (the hero.ts markup); `inert` turns the print into a picture with no controls
const toPrint = (html) =>
  html
    .replace(/<button[^>]*class="lb-tick"[^>]*aria-pressed="(true|false)"[^>]*><\/button>/g, (_, on) => `<span class="lb-tick"${on === 'true' ? ' data-on' : ''} aria-hidden="true"></span>`)
    .replace(/<button[^>]*class="lb-del"[^>]*>[^<]*<\/button>/g, '')
    .replace(/<button[^>]*>([^<]*)<\/button>/g, '<span class="fakebtn">$1</span>');
const NAMES = { a: 'Sari', b: 'Budi' };
function plate(id, c, print, { inert = false } = {}) {
  const list = inert ? toPrint(c.html) : c.html;
  return `<article class="lb-plate" data-replica="${id}" data-axis="${c.axis}" data-conflict="${c.conflict}"${c.fixed ? ' data-fixed' : ''} aria-label="Replica ${id.toUpperCase()}, ${NAMES[id]}">
<header class="lb-imprint"><span class="lb-dot" aria-hidden="true"></span><span class="lb-chip">${esc(c.chip)}</span></header>
<span class="lb-big" aria-hidden="true"><b class="lb-count">${c.waiting.length}</b><i>in limbo</i></span>
<p class="lb-sitter">Replica ${id.toUpperCase()} — ${NAMES[id]}</p>
<ul class="lb-list" aria-label="${NAMES[id]}'s packing list">${list}</ul>
${inert ? '' : `<div class="lb-limbo"><p class="lb-limbo-h">In limbo, with their rules</p><ol>${c.waiting.length ? '' : '<li class="lb-empty">nothing waiting</li>'}</ol></div>`}
<p class="lb-print">state fingerprint <b data-print>${print}</b></p>
<span class="lb-fixed" aria-hidden="true">FIXED</span>
<div class="lb-veil" aria-hidden="true"></div>
</article>`;
}

const step = (num, time, title, doing, see, open, tone = '') =>
  `<li class="step"><span class="step__no" aria-hidden="true">${num}</span><div><p class="step__t">${time}</p><h3>${title}</h3><p>${doing}</p>${open ? `<p class="open">${open}</p>` : ''}</div><div class="see${tone ? ` ${tone}` : ''}"><span class="see__k">You should see</span><span class="see__v">${see}</span></div></li>`;
const pill = (t) => `<span class="pill">${esc(t)}</span>`;
const openLink = (href, label) => `<a class="btn sm" href="${href}" target="_blank" rel="noopener">${ICON.open}<span>${label}</span></a>`;
const img = (src, alt, w, h) => `<img src="${src}" alt="${esc(alt)}" width="${w}" height="${h}" loading="lazy" decoding="async">`;

// ---------------------------------------------------------------- content
const s = P.settled;
const hookByName = Object.fromEntries(HOOKS.map((h) => [h.name, h]));
const res = (k) => tally.hook_results[k] ?? 0;
const hookOutcome = {
  'guard-shell': `${n(tally.shell_denials)} denials`,
  'stop-gate': `${res('stop-gate:block')} blocks, ${n(res('stop-gate:pass'))} passes, ${res('stop-gate:skipped:no-harness')} skipped (no harness yet)`,
  'props-after-task': `${n(res('props-after-task:pass'))} pass, ${res('props-after-task:fail')} fail, ${res('props-after-task:skipped:no-harness')} skipped (no harness yet)`,
  'op-lint': `${res('op-lint:pass')} pass, ${res('op-lint:fail')} failed saves`,
  'op-scaffold': `${res('op-scaffold:scaffolded')} scaffolded`,
  'session-context': 'context injected',
  'task-start': 'task logged',
  'mcp-log': `${tally.mcp_calls} MCP calls logged`,
};
const hookOrder = ['stop-gate', 'props-after-task', 'guard-shell', 'op-lint', 'op-scaffold', 'task-start', 'session-context', 'mcp-log'];
assert(hookOrder.every((h) => hookByName[h]), 'a hook in the table has no .kiro/hooks file');
const T = (...prefixes) => touched(...prefixes);
const tSpecs = T('.kiro/specs/');
const tHooks = T('.kiro/hooks/', 'kit/hooks/');
const tSteer = T('.kiro/steering/');
const tAgents = T('.kiro/agents/');
const tMcp = T('kit/mcp/');
const tProps = T('kit/props/');
const sum = (o) => Object.values(o).reduce((a, b) => a + b, 0);
const cliVersions = Object.entries(tally.cli_versions).map(([v, k]) => `${v.replace('kiro-cli ', '')} (${k})`).join(', ');

const criteria = [
  ['Stage One', 'pass / fail', 'Fits the theme and applies the required tools.',
    `Skeleton Crew: one skeleton and two apps in two separate folders (${gh('skeleton/')}, ${gh('apps/basecamp/')}, ${gh('apps/aftershock/')}). ${gh('.kiro/', '/.kiro')} sits at the root with specs, hooks, steering and agents, and CI fails if it is ignored or empty. MIT ${gh('LICENSE', 'license')}.`,
    `<a href="#crew">Plate I</a> · ${gh('kit/scripts/kiro-root-check.mjs', 'kiro-root-check.mjs')}`, 'gate'],
  ['Potential Impact', '20% · 10 points', 'A real problem for a real audience? Would someone actually use this?',
    `For groups who share a list or a form where the signal drops (a trip, a site survey), and for the developers who build those apps. Last-write-wins quietly drops an edit; LIMBO shows the lost edit as a twin with the rule that decided it, and one tap settles it. Both apps keep working offline after the first load (tested), with no account. The scenarios are ours: there is no outside-user data yet.`,
    `<a href="#path">the path</a>, steps 3 to 5 · ${gh('e2e/offline-shell.spec.ts', 'offline-shell.spec.ts')} · ${gh('docs/ADOPT.md', 'ADOPT.md')} (for developers)`],
  ['Technological Implementation', '20% · 10 points', 'How thoroughly and skillfully does it use Kiro? Variety, strategy, experimentation?',
    `${tally.spec_dirs} Kiro-authored specs (${tally.kiro_executed_spec_tasks} spec sessions) among ${tally.kiro_sessions} headless Kiro CLI build sessions; ${HOOKS.length} hooks with ${n(tally.hook_fires_total)} logged runs, including an Agent Stop gate that refused "done" ${stopBlocks.length} times; ${STEERING.length} steering files; ${AGENTS.length} custom agents; an MCP server; property-based tests at ${n(conv.orderings)} orderings; a pre-registered A/B pilot, published with its null result.`,
    `<a href="#kiro">Plate V, file by file</a> · ${gh('evidence/kiro/')} · <a href="#receipts">receipts</a>`],
  ['Design', '20% · 10 points', 'A complete, coherent product experience? Intuitive, polished, intentional?',
    `Every look is a sync state: fog while a replica's link is down, a count of waiting edits, a cyanotype ghost twin for a surfaced conflict, the FIXED seal when a replica is back to live with no open conflict. The Inspector lists the queued and recently exchanged ops with their rule and causal stamp. Two complete apps with an offline shell; the same look on the landing, the deck and this page.`,
    `<a href="${URLS.basecamp}">BASECAMP</a> · <a href="${URLS.aftershock}">AFTERSHOCK</a> · <a href="/">landing</a> · <a href="/deck/">${DECK_SLIDES}-slide deck</a> · <a href="#run">Plate III</a>`],
  ['Innovation / Idea', '20% · 10 points', 'How creative and novel? Does it differ from existing concepts?',
    `Last-write-wins, the common default, settles a conflict by silently keeping one edit. Here every op must declare one of ${MERGES.length} named merge rules, and the conflicts a person should see (an item deleted while it was edited, two claims on the last stove) come back as ghost twins with their rule printed on them. The merge code itself was gated: the Stop gate refused to let Kiro finish (up to ${MAX_BLOCKS} times a session) while a fast-tier property failed.`,
    `${gh('skeleton/src/core/merges.ts', 'merges.ts')} · ${gh('kit/props/')} · <a href="#kiro">the Stop gate</a>`],
  ['Presentation', '20% · 10 points', 'Does the video show it working end to end? Problem, audience, why it matters?',
    `A ${VIDEO_LEN} video: the ghost twin on the first frame, a judge-style edit of our own, the second app, an offline reload, Kiro and the Stop gate, the receipts. Then this page, a landing page and a deck, every number linked to its file.`,
    `<a href="#video">chapters</a> · <a href="${VIDEO}">YouTube</a> · ${gh('README.md')} · ${gh('JUDGE.md')}`],
];

const receipts = [
  [n(conv.orderings), 'random orderings, 0 divergences', `${conv.replicas} replicas, every op of both apps, seed ${conv.seed}, all ${Object.keys(conv.passesPerProperty).length} property kinds green. Measured, property-tested, not proven.`, gh('evidence/convergence/full-2026-11-22.json', 'convergence/full-2026-11-22.json')],
  [n(ci.unit.passed), 'tests pass, under a 100% coverage gate', `${n(ci.unit.passed)} unit, component and property tests pass; ${ci.unit.skipped} skipped (AFTERSHOCK rows for conflict classes it has no ops for). Local CI receipt at <code>${ci.commit.slice(0, 7)}</code>, Node ${ci.node.replace(/^v/, '')}.`, `${gh('evidence/ci/latest.json', 'ci/latest.json')} ${gh(CI_LOG, CI_LOG.split('/').pop())}`],
  [`${ci.coverage.lines}<small>%</small>`, 'line, branch, function, statement coverage', `On ${gh('skeleton/src/', 'skeleton/src')} and each app's domain modules; CI fails below 100%. Views, browser entries, the shuffle worker and its runner, and the dev relay are excluded, each with its reason; <code>site/</code> (this page's instrument) is outside the gate.`, gh('vitest.config.ts')],
  [n(ci.e2e.passed), 'Playwright end-to-end tests pass', `${ci.e2e.skipped} skipped (viewport-conditional). Two browser contexts through a real partition, the offline shell of both builds, the landing and this page.`, gh('e2e/')],
  [pct(tally.kiro_share), `of product commits from Kiro sessions`, `${tally.kiro_product_commits} of ${tally.product_commits} commits touching <code>skeleton/</code> or <code>apps/</code> carry a <code>Kiro-Session</code> trailer; the ${tally.product_commits - tally.kiro_product_commits} others are listed.`, gh('evidence/kiro/share.json', 'kiro/share.json')],
  [n(tally.hook_fires_total), 'Kiro hook runs, one log row each', `${n(tally.hooks_by_trigger.PreToolUse)} shell checks; the Stop gate ran ${tally.hooks_by_trigger.Stop} times (${res('stop-gate:skipped:no-harness')} skipped before the property harness existed; ${stopBlocks.length} blocks); ${tally.hooks_by_trigger.PostTaskExec} after-task runs (${res('props-after-task:skipped:no-harness')} skipped). At least ${manualHookRuns} rows are Kiro running a hook script by hand from its shell.`, gh('evidence/kiro/hooks.jsonl', 'kiro/hooks.jsonl')],
  [n(tally.kiro_sessions), 'headless Kiro CLI build sessions', `${tally.credits_used} credits; ${tally.kiro_executed_spec_tasks} inside ${tally.spec_dirs} specs. Plus ${handText} in the ledger, each with its reason. The ${tally.ab_sessions} A/B pilot sessions (${tally.ab_credits} credits) are logged separately.`, gh('evidence/kiro/sessions.jsonl', 'kiro/sessions.jsonl')],
  [`${ab.fails.A.k} <small>vs</small> ${ab.fails.B.k}`, 'held-out failures, without vs with the kit', `A pre-registered pilot, ${ab.runs_done} runs: no measurable effect (Fisher p = ${ab.fisher_two_sided_p}). Published as run.`, gh('evidence/kiro/ab/summary.md', 'kiro/ab/summary.md')],
];
assert(ab.fails.A.n === 10 && ab.fails.B.n === 10, 'A/B arms are not 10 + 10');

const real = [
  ['The instrument on this page', 'REAL CODE', 'real', `the skeleton's <code>createPair</code>, replica, in-page link and <code>runShuffle</code> with BASECAMP's own ops, bundled from ${gh('site/src/judge.ts', 'site/src/judge.ts')}; an in-memory store instead of IndexedDB`, gh('site/src/hero.ts', 'site/src/hero.ts')],
  ['The link between the two replicas', 'SIMULATED', 'sim', `an in-page link, labelled on screen (“${esc(LINK_CAPTION)}”). The partition e2e test runs two browser contexts through a dev-only relay`, `${gh('skeleton/src/sync/inpage-link.ts', 'inpage-link.ts')} (the link) ${gh('skeleton/src/sync/dev-relay-link.ts', 'dev-relay-link.ts')} (the e2e relay, in no production build)`],
  ['Two devices syncing', 'NOT BUILT', 'no', 'no hosted relay and no physical two-device test; a cross-device relay is the next step', gh('e2e/basecamp-offline.spec.ts', 'basecamp-offline.spec.ts (two browser contexts, one machine)')],
  ['Working offline after the first load', 'TESTED', 'real', 'a service worker serves each app; an offline reload keeps every edit (IndexedDB), in CI and against both live URLs', `${gh('e2e/offline-shell.spec.ts', 'offline-shell.spec.ts')} ${gh('e2e/live.spec.ts', 'live.spec.ts')}`],
  ['Every replica converges', 'MEASURED', 'twin', `${n(conv.orderings)} random orderings of ${conv.replicas} replicas, ${failures} divergences: a property test, not a proof`, gh('evidence/convergence/full-2026-11-22.json', 'full-2026-11-22.json')],
  ['AFTERSHOCK’s survey data', 'DEMO DATA', 'sim', 'written by us; no field use is claimed', gh('apps/aftershock/src/seed.ts', 'seed.ts')],
  ['The video’s Stop-gate scene', 'REPLAYED', 'rec', `logged session <code>sess_545bc98d</code>, re-set from the hook log; its <code>Date.now()</code> fault was seeded on purpose (${ghc('cca30a0')})`, gh('evidence/kiro/hooks.jsonl', 'hooks.jsonl')],
  ['The kit makes Kiro more correct', 'NO EFFECT', 'no', `the pre-registered A/B pilot found none (${ab.fails.A.k} of 10 vs ${ab.fails.B.k} of 10, p = ${ab.fisher_two_sided_p})`, gh('evidence/kiro/ab/PREREG.md', 'PREREG.md')],
  ['Kiro IDE, Spec Correctness, Powers', 'NOT USED', 'no', 'every logged Kiro session ran in the Kiro CLI; the IDE and its Spec Correctness and Agent Hooks panel were not used in any of them, nor Powers', gh('evidence/kiro/sessions.jsonl', 'sessions.jsonl')],
];

const limits = [
  ['Convergence is measured, not proven.', `${n(conv.orderings)} random orderings of ${conv.replicas} replicas with property tests is strong evidence, not a proof.`],
  ['There is no cross-device relay.', 'The live apps sync two replicas through an in-page link labelled as simulated. DevTools "offline" does not cut it; the dev-only relay in the e2e suite ships in no production build.'],
  ['Offline claims are provisional.', 'No CRDT can stop two offline people both claiming the last stove. On reconnect the declared rule picks one claimant on every replica and the other is told.'],
  ['The kit showed no measurable effect.', `The pre-registered A/B pilot: ${ab.fails.A.k} of 10 vs ${ab.fails.B.k} of 10 held-out failures, p = ${ab.fisher_two_sided_p}. Its ${ab.arms.B.stop_blocks} kit-arm Stop blocks were false alarms from the kit's own vacuity guard, and ${guardEdits[0]} of ${guardEdits[1]} kit-arm runs edited that guard; the fix (the guard is now hash-protected) has not been re-piloted.`],
  ['Not every product commit is Kiro’s.', `${tally.product_commits - tally.kiro_product_commits} of ${tally.product_commits} product commits were made outside Kiro (listed with their subjects in share.json), and the ledger holds ${handText}, each with its reason.`],
  [`The Stop gate blocked ${stopBlocks.length === 2 ? 'twice' : `${stopBlocks.length} times`} in ${tally.kiro_sessions} build sessions.`, `Once unplanned, once on a fault we seeded to prove it fires. It allows at most ${MAX_BLOCKS} blocks a session, and it skipped ${res('stop-gate:skipped:no-harness')} times before the property harness existed.`],
  ['Kiro CLI only.', `No logged session used the Kiro IDE, its Spec Correctness (property-based) or the Agent Hooks panel, or Powers. The MCP server was used lightly: ${tally.mcp_calls} calls from ${tally.mcp_sessions} session.`],
  ['The skeleton is over its first budget.', `${lean.skeleton_budget_files} files and ${n(lean.skeleton_budget_loc)} lines by the budget count: inside the restated ${BUDGET.lines}-line budget, over the original ${BUDGET.first}.`],
  ['Demo data, no outside users.', 'AFTERSHOCK runs on data we wrote and no field use is claimed; we have no outside-user data for either app.'],
  ['Only the apps work offline.', 'The landing page and this page are static pages with no service worker.'],
];

const verify = [
  ['c', `git clone ${REPO} && cd limbo && pnpm install --frozen-lockfile`],
  ['c', 'pnpm test:coverage'],
  ['o', `${testsLine}   # and all four coverage rows at 100%`],
  ['c', 'pnpm e2e:ci'],
  ['o', `  ${ci.e2e.skipped} skipped`],
  ['o', `  ${ci.e2e.passed} passed   # two browser contexts, a real partition, the offline shell of both builds`],
  ['c', 'pnpm --filter @limbo/basecamp dev'],
  ['n', '# BASECAMP on http://localhost:5174 (AFTERSHOCK: pnpm --filter @limbo/aftershock dev, port 5176)'],
  ['c', 'pnpm share && node kit/scripts/readme-tally.mjs'],
  ['n', '# recomputes the ledger, hook, steering, MCP and share tallies (tally.json, lean.json, share.json)'],
  ['c', 'pnpm props:full'],
  ['n', `# about ${FULL_MIN} minutes; writes evidence/convergence/full-<date>.json with orderings ${conv.orderings}, seed ${conv.seed}, passed true`],
  ['c', 'node kit/scripts/judge-build.mjs --check'],
  ['s', 'OK judge pages match evidence/'],
  ['n', '# re-derives everything else on this page (per-card ledger counts, A/B, engine states) and checks every repo link'],
];

// seeded Stop block: selected rows of the session, straight from the hook log
// Rule: the first task-start; op-scaffold when it scaffolded; op-lint once per op file; the shell checks that ran the
// tests; every stop-gate and props-after-task row. Everything else (reads, echo probes) is left in the log file.
const seededRows = hookRows.filter((r) => r.session_id === seeded.session_id);
const lintSeen = new Set();
const logRows = seededRows.filter((r) => {
  if (r.hook === 'task-start') return r === seededRows.find((x) => x.hook === 'task-start');
  if (r.hook === 'op-scaffold') return r.result === 'scaffolded';
  if (r.hook === 'op-lint') return /\.op\.ts$/.test(r.target ?? '') && !lintSeen.has(r.target) && lintSeen.add(r.target);
  if (r.hook === 'guard-shell') return /^pnpm (test|typecheck)/.test(r.target ?? '');
  return r.hook === 'stop-gate' || r.hook === 'props-after-task';
});
const kiroFixed = (g2.match(/`item\.tick\.op\.ts` is fixed, and `pnpm typecheck`, `pnpm test` and `pnpm props` all pass\./) || [])[0];
assert(logRows.filter((r) => r.hook === 'stop-gate').length === 1 && logRows.at(-1)?.hook === 'props-after-task' && kiroFixed, 'seeded session rows not found');
const shortTarget = (r) => (r.target ?? '').replace(/^\.\//, '').replace(/^apps\/basecamp\/src\/ops\//, '').replace(/\s*2>&1\s*\|\s*tail -\d+/g, '').replace(/;\s*(echo|grep)\b.*$/s, '').slice(0, 44);
const logHtml = [];
for (const r of logRows) {
  const t = `<span class="t-time">${r.ts.slice(11, 19)}</span>`;
  if (r.hook === 'stop-gate') {
    logHtml.push(`${t}  Stop           stop-gate         <span class="t-block">BLOCK ${esc(r.detail.replace('block ', ''))}</span> · ${(r.ms / 1000).toFixed(1)} s`);
    logHtml.push(`<span class="t-say">kiro: “${esc(kiroSaid.replace(/`/g, ''))}”</span>`);
    continue;
  }
  logHtml.push(`${t}  ${r.trigger.padEnd(14)} ${r.hook.padEnd(17)} ${esc(shortTarget(r))}${r.result && !['allow', 'logged'].includes(r.result) ? ` · ${esc(r.result)}` : ''}`);
  if (r.hook === 'guard-shell' && /^pnpm test/.test(r.target ?? '')) for (const f of failLines) logHtml.push(`          <span class="t-fail">FAIL ${esc(f.replace('kit/props/suite.props.test.ts > ', ''))}</span>`);
  if (r.hook === 'props-after-task') logHtml.push(`<span class="t-say">kiro: “${esc(kiroFixed.replace(/`/g, ''))}”</span>`);
}

// ---------------------------------------------------------------- HTML
const title = 'LIMBO for judges: the path, the receipts, the limits';
const desc = `The 3-minute judge guide to LIMBO (Kiroween 2026, Skeleton Crew): one local-first skeleton and two apps where a deleted-while-edited item comes back as a ghost twin. A 60-second path, the judge path run live on this page, each criterion, Kiro file by file, receipts and honest limits.`;
const recRows = [
  ['After Cut link + the lake scene', `chips “${esc(P.limbo.cards.a.chip)}” and “${esc(P.limbo.cards.b.chip)}”; ${P.limbo.queued.a} + ${P.limbo.queued.b} ops in limbo; fingerprints <code>${P.limbo.prints.a}</code> ≠ <code>${P.limbo.prints.b}</code>`],
  ['After Restore link', `chips “${esc(s.cards.a.chip)}” on both; the ${esc(s.twin?.a ?? '')} is a twin on both replicas; ${esc(s.claim?.item ?? '')} → ${esc(s.claim?.winner ?? '')} on both, ${esc(s.claim?.loser ?? '')} sees the twin; fingerprints <code>${s.prints.a}</code> = <code>${s.prints.b}</code>`],
  ['After Keep + OK', `FIXED on both replicas; fingerprints <code>${P.fixed.prints.a}</code> = <code>${P.fixed.prints.b}</code>`],
  ['Shuffle', `${n(P.shuffle.ran)} orderings of ${P.shuffle.ops} ops → ${P.shuffle.distinct} final state, <code>${P.shuffle.print}</code>, the state both fixed replicas hold`],
];

const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}">
<meta name="author" content="edycutjong">
<meta name="theme-color" content="#F2EADB">
<link rel="icon" href="/assets/icon.svg" type="image/svg+xml">
<link rel="canonical" href="${SITE}/judge">
<meta property="og:type" content="website">
<meta property="og:site_name" content="LIMBO">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:url" content="${SITE}/judge">
<meta property="og:image" content="${SITE}/assets/og-image.png?v=${ogV}">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:image:alt" content="Two replica cards of a packing list, Sari and Budi, reconnected: each shows the deleted tent as a blue ghost twin with a Keep button.">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:creator" content="@edycutjong">
<meta name="twitter:title" content="${esc(title)}">
<meta name="twitter:description" content="${esc(desc)}">
<meta name="twitter:image" content="${SITE}/assets/og-image.png?v=${ogV}">
<link rel="preload" href="/fonts/old-standard-tt-latin-400-normal.woff2" as="font" type="font/woff2" crossorigin>
<link rel="preload" href="/fonts/old-standard-tt-latin-400-italic.woff2" as="font" type="font/woff2" crossorigin>
<link rel="preload" href="/fonts/atkinson-hyperlegible-next-latin-400-normal.woff2" as="font" type="font/woff2" crossorigin>
<script>document.documentElement.classList.add("js")</script>
<style>
${css}
</style>
</head>
<body>
<a class="skip" href="#main">Skip to the judge guide</a>
<header class="top" id="top"><div class="wrap">
<a class="brand" href="/judge" aria-label="LIMBO for judges"><img src="/assets/icon.svg" alt="" width="32" height="32"><b>LIMBO</b><small>for judges</small></a>
<nav aria-label="Sections"><a href="#path">Path</a><a href="#run">Run it here</a><a href="#criteria">Criteria</a><a href="#kiro">Kiro</a><a href="#video">Video</a><a href="#receipts">Receipts</a><a href="#limits">Limits</a></nav>
<a class="btn sm ghost-src" href="${REPO}">${ICON.src}<span>Source</span></a>
<a class="btn sm solid" href="${URLS.basecamp}" target="_blank" rel="noopener">${ICON.open}<span><span class="hide-xs">Open </span>BASECAMP</span></a>
</div></header>
<main id="main">

<div class="wrap"><section class="hero" aria-labelledby="h1">
<div>
<p class="plate-no">for judges · kiroween 2026 · <b>skeleton crew</b></p>
<h1 id="h1">Cut the link. <em>Judge what comes back.</em></h1>
<p class="lede"><b>LIMBO</b> is a local-first skeleton where every op declares how it merges. ${esc(CLAIM)}</p>
<p class="crew-line">One skeleton, two apps, two folders: ${gh('skeleton/')}<span class="plus">+</span>${gh('apps/basecamp/')}<span class="plus">+</span>${gh('apps/aftershock/')}</p>
<div class="cta"><a class="btn solid" href="#path">${ICON.down}<span>The 60-second path</span></a><a class="btn" href="#run">Run it on this page</a><a class="btn" href="${VIDEO}">${ICON.play}<span>Video, ${VIDEO_LEN}</span></a><a class="btn quiet" href="${REPO}/blob/main/JUDGE.md">JUDGE.md</a></div>
<ul class="facts"><li>No install, no login, no keys</li><li>Both apps work offline after the first load</li><li class="sim">The link between the two replicas is simulated, and labelled so</li></ul>
</div>
<figure class="print-mount" aria-labelledby="print-cap" style="margin:0">
<p class="print-tag"><span>Replica B · after the lake scene</span><span>printed by the engine</span></p>
${plate('b', s.cards.b, s.prints.b, { inert: true })}
<div class="print-strip"><div><b>${n(conv.orderings)}</b><span>orderings, 0 divergences</span></div><div><b>${pct(tally.kiro_share)}</b><span>product commits from Kiro</span></div><div><b>${n(tally.hook_fires_total)}</b><span>logged hook runs, ${stopBlocks.length} Stop blocks</span></div></div>
<figcaption class="print-cap" id="print-cap">Not a screenshot: BASECAMP's own ops on the skeleton's <code>createPair</code>, run when this page was built. Budi deleted the tent while Sari ticked it, and both claimed the last stove; after the link came back, Budi's card holds both twins. Replica A holds the same state (<code>${s.prints.a}</code>). <a href="#run">Run it live</a>.</figcaption>
</figure>
</section></div>

<nav class="strip" aria-label="Plates on this page"><ol>
${PLATES.map(([id, t], i) => `<li><a href="#${id}"><span class="n">${roman[i]}</span><span class="t">${esc(t)}</span></a></li>`).join('\n')}
</ol></nav>

<section class="sec" id="crew" aria-labelledby="h-crew"><div class="wrap">
${head('crew', 'One skeleton. <i>Two apps, two folders.</i>', `<p>The category asks for a template lean enough to be clear and two distinct applications built from it. LIMBO's template is the op layer, sync and the offline look; each app supplies five things and nothing else (${gh('docs/ADOPT.md', 'ADOPT.md')}).</p>`)}
<div class="crew">
<div class="skel">
<h3>${gh('skeleton/', 'skeleton/')}</h3>
<p>The template. ${SKEL_DIRS.length === 3 ? 'Three' : SKEL_DIRS.length} folders, ${lean.index_exports} values exported from ${gh('skeleton/src/index.ts', 'index.ts')}.</p>
<ul>
<li>${gh('skeleton/src/core/', 'core/')}: ops and the ${MERGES.length} named merge rules</li>
<li>${gh('skeleton/src/sync/', 'sync/')}: replica, links, the local op log</li>
<li>${gh('skeleton/src/limbo/', 'limbo/')}: fog, twins, the Inspector, FIXED</li>
</ul>
<dl><dt>${lean.skeleton_budget_files}</dt><dd>files by the budget count (budget ${BUDGET.files})</dd><dt>${n(lean.skeleton_budget_loc)}</dt><dd>non-blank, non-comment lines (budget ${BUDGET.lines})</dd><dt>${lean.skeleton_test_files}</dt><dd>test files beside them</dd></dl>
<p class="src" style="margin:14px 0 0">${gh('evidence/lean.json')}</p>
</div>
<div class="apps">
<article class="app">${img('/assets/basecamp-twin.webp', 'BASECAMP live after reconnect: on both replica cards the deleted tent is a twin reading Budi deleted this while Sari ticked it, rule: resurrect, with Keep and Delete.', 1400, 785)}<div><h3>BASECAMP ${gh('apps/basecamp/', 'apps/basecamp/')}</h3><p>A group trip list: ticks, claims on the last stove, delete-versus-edit twins, reorder, shared expenses. ${lean.basecamp_ops} ops.</p><div class="row"><a class="btn sm solid" href="${URLS.basecamp}" target="_blank" rel="noopener">${ICON.open}<span>Open live</span></a><span class="src">${gh('apps/basecamp/app.config.ts', 'app.config.ts')}</span></div></div></article>
<article class="app">${img('/assets/aftershock.webp', 'AFTERSHOCK live: two replicas of a sector grid with SAFE, DAMAGED and NO REPORT cells, marked demo data.', 1400, 875)}<div><h3>AFTERSHOCK ${gh('apps/aftershock/', 'apps/aftershock/')}</h3><p>A field survey form on a sector grid: two reports of one sector merge to the worse severity, and both head counts are kept. ${lean.aftershock_ops} ops, demo data.</p><div class="row"><a class="btn sm solid" href="${URLS.aftershock}" target="_blank" rel="noopener">${ICON.open}<span>Open live</span></a><span class="src">${gh('apps/aftershock/app.config.ts', 'app.config.ts')}</span></div></div></article>
</div>
<div class="rulebox">
<blockquote class="quote"><p>“Build a skeleton code template lean enough to be clear but flexible enough to support various use cases. Show us its versatility with two distinct applications from your foundation.”</p><footer>Kiroween 2026 rules, Skeleton Crew. And: “Your repo must contain 2 separate repo folders for the 2 separate applications.”</footer></blockquote>
<div><ul class="checks-q">
<li><span>Two apps in two folders, ${gh('apps/basecamp/')} and ${gh('apps/aftershock/')}, each with its own ops, model, seed, views and config.</span></li>
<li><span>AFTERSHOCK was built second: its ${tally.specs.aftershock} Kiro spec sessions changed 0 files under <code>skeleton/</code> (later UI polish touched skeleton CSS and markup for both apps).</span></li>
<li><span>${OPS.length} ops across the two apps, each declaring one of the skeleton's rules:</span></li>
</ul>
<ul class="merges">${MERGES.map((m) => `<li>${m} <small>· ${OPS.filter((o) => o.merge === m).length} ops</small></li>`).join('')}</ul>
<p class="src" style="margin-top:8px">${gh('skeleton/src/core/types.ts', 'types.ts')} · ${gh('apps/basecamp/src/ops/', 'basecamp ops')} · ${gh('apps/aftershock/src/ops/', 'aftershock ops')}${usedMerges.length < MERGES.length ? ` · <code>sum-split</code> splits each expense into shares inside ${gh('apps/basecamp/src/ops/expense.state.ts', 'expense.state.ts')}; no op declares it` : ''}</p>
</div>
</div>
</div>
</div></section>

<section class="sec" id="path" aria-labelledby="h-path"><div class="wrap">
${head('path', 'Sixty seconds <i>in the live apps.</i>', `<p>Each step names the exact button and what you should see. Open BASECAMP in a new tab; it shows two replicas side by side, so one browser is enough. The times are a budget, not a measurement. If you see something else, that is a bug we want to hear about.</p>`)}
<ol class="steps">
${step(1, '0:00 – 0:05', 'Open BASECAMP, two replicas', `<a href="${URLS.basecamp}" target="_blank" rel="noopener">basecamp.limbo.edycu.dev/?replicas=2</a>. No install, no login, no credits.`, `two cards, <q>REPLICA A — Sari</q> and <q>REPLICA B — Budi</q>, joined by a cord captioned <q>${esc(LINK_CAPTION)}</q>.`, openLink(URLS.basecamp, 'Open BASECAMP'))}
${step(2, '0:05 – 0:15', 'Cut the link, play the scene', `Press ${pill('Cut link')}, then ${pill('Play the lake scene')}. Offline, Sari ticks the tent while Budi deletes it, and both claim the last stove.`, `both cards fog over, each chip reads <q>${esc(P.limbo.cards.a.chip)}</q>, and the edits are tagged as scripted.${img('/assets/basecamp-fogged.webp', 'BASECAMP with the link cut: both replica cards fogged, each chip reading Offline, 2 waiting.', 1400, 785)}`, '', 'fog')}
${step(3, '0:15 – 0:25', 'Restore the link', `Press ${pill('Restore link')}. The waiting ops cross, and each is merged by the rule it declares.`, `the tent back as a ghost twin on both cards: <q class="tw">TWIN · Budi deleted this while Sari ticked it · rule: resurrect</q>. On Budi's card: <q class="tw">TWIN · Budi and Sari both claimed this · rule: claim-one</q>, with ${pill('OK')} and ${pill('Why Sari?')}.${img('/assets/basecamp-twin.webp', 'BASECAMP after Restore link: the tent twin on both cards, and the stove claim twin on Budi\u2019s card.', 1400, 785)}`)}
${step(4, '0:25 – 0:30', 'Settle it with one tap each', `Tap ${pill('Keep')} on the tent twin and ${pill('OK')} on Budi's lost claim.`, `the twins clear and a <span class="stamp">FIXED</span> stamp lands on each replica; both cards show the same list.${img('/assets/basecamp-fixed.webp', 'BASECAMP after Keep and OK: both replicas live, a FIXED stamp on each.', 1400, 785)}`)}
${step(5, '0:30 – 0:45', 'Now your own edit, not the scene', `Type an item into <em>Add an item</em> on replica A (it appears on B), press ${pill('Cut link')}, tick it on A, delete it on B (${pill('⋯')} then ${pill('Delete')}), press ${pill('Restore link')}.`, `your item back as a twin on both cards, <q class="tw">rule: resurrect</q>; ${pill('Keep')} settles it.`)}
${step(6, '0:45 – 0:50', 'Inspector and the shuffle test', `Open the ${pill('Inspector')} in a card, then press ${pill('Run shuffle test')} in the page's shuffle section.`, `the queued ops and the last ${WORDS[EXCHANGES] ?? EXCHANGES} exchanges, each op with its merge rule, causal stamp and dependencies; then <q>1,000 / 1,000 orderings → same state</q>: your browser replayed the ops on screen in random causal orders (not the ${n(conv.orderings)}-ordering run).`)}
${step(7, '0:50 – 1:00', 'AFTERSHOCK: a second, different app', `<a href="${URLS.aftershock}" target="_blank" rel="noopener">aftershock.limbo.edycu.dev/?replicas=2</a>: ${pill('Cut link')}, ${pill('Play the survey scene')}, ${pill('Restore link')}.`, `sector C3 on both grids as <q>UNSAFE</q>, <q>5 reported — Sari 2, Budi 3</q> (the worse report wins, both counts are kept), and the two notes as a twin: ${pill("Keep Sari's note")} or ${pill("Keep Budi's note")} lands FIXED.${img('/assets/aftershock.webp', 'AFTERSHOCK: two replicas of the sector grid, marked demo data.', 1400, 875)}`, openLink(URLS.aftershock, 'Open AFTERSHOCK'))}
</ol>
<p class="after"><a class="btn solid" href="#run">${ICON.down}<span>Or run the same path on this page</span></a><span class="small">Also live: the <a href="/">landing page</a>, whose hero runs the lake scene in the page, and the <a href="/deck/">${DECK_SLIDES}-slide deck</a> (arrow keys).</span></p>
</div></section>

<section class="sec" id="run" aria-labelledby="h-run"><div class="wrap">
${head('run', 'No tab switch: <i>run the path here.</i>', `<p>Two BASECAMP replicas in this page: the skeleton's <code>createPair</code>, its in-page link and BASECAMP's own ops, bundled from ${gh('site/src/judge.ts', 'site/src/judge.ts')} (it imports ${gh('skeleton/src/', 'skeleton/src/')} and ${gh('apps/basecamp/', 'apps/basecamp/')} unchanged). The store is in memory, so a reload starts from the seed. The engine downloads the first time you hover over, focus or press inside it.</p><p>The checklist is not a script: each box ticks when a value the engine computes says so, and the fingerprints hash each replica's own state.</p>`)}
<div class="lab" data-proof data-engine="idle" data-link="up" data-same="yes" data-src="/assets/judge.js?v=${bundleV}">
<div class="proof">
<p class="engine"><b data-engine data-live="LIVE IN THIS TAB">NOT LOADED</b><span>judge.js, ${bundleKB} KB (${bundleGzKB} KB gzipped), loads on first hover, focus or press</span></p>
<div class="lb-viewer" role="group" aria-label="Two replicas of BASECAMP joined by a simulated link">
${plate('a', P.live.cards.a, P.live.prints.a)}
<div class="lb-cord" data-link="up"><button type="button" data-act="link" aria-pressed="false">Cut link</button><small>simulated link</small></div>
${plate('b', P.live.cards.b, P.live.prints.b)}
</div>
<div class="ctl"><button type="button" class="solid" data-act="auto">Play the whole path</button><button type="button" data-act="scene">Play the lake scene</button><button type="button" data-act="shuffle">Run shuffle test</button><button type="button" data-act="reset">Reset</button></div>
<p class="say" data-say role="status" aria-live="polite">Press Cut link and edit both cards, or press Play the whole path.</p>
<div class="recorded" role="region" aria-label="Recorded results"><span class="rstamp">RECORDED</span><h3>The engine did not load here. <span class="nojs">(JavaScript is off.)</span></h3><p class="small">The same code ran when this page was built (${gh('kit/scripts/judge-build.mjs', 'judge-build.mjs')} calls <code>prerender()</code> in Node). This is what it printed:</p><dl>${recRows.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('')}</dl></div>
</div>
<aside class="checks" aria-labelledby="h-checks">
<h3 id="h-checks">The path, checked by the engine</h3>
<p>Each line names the value it reads.</p>
<ol>
${[
  ['cut', 'Cut link: both replicas fog', 'view.axis = FOGGED on A and B', 'waiting for the link to be cut'],
  ['limbo', 'Edits wait in limbo, one state each', 'pair.queued(a), pair.queued(b) > 0', 'edit both cards, or press Play the lake scene'],
  ['twin', 'Restore: the deleted item returns as a twin on both', 'item.life = twin on A and on B', 'needs a delete on one side and an edit on the other'],
  ['claim', 'Two claims, one winner on both, the loser told', 'same winners on A and B, a loser left', 'needs both replicas to claim the stove offline'],
  ['fixed', 'Keep + OK: FIXED on both, one fingerprint', 'view.fixed on A and B, fingerprints equal', 'settle every twin'],
  ['shuffle', `Shuffle: ${n(P.shuffle.ran)} random causal orders, one final state`, 'runShuffle(ops on screen, 1,000, seed 1)', 'press Run shuffle test'],
].map(([k, t, code, idle]) => `<li class="check" data-check="${k}"><span class="check__box" aria-hidden="true"></span><b>${esc(t)}</b><code>${esc(code)}</code><span data-detail data-idle="${esc(idle)}">${esc(idle)}</span></li>`).join('\n')}
</ol>
<p class="shuf" data-shuffle-out data-idle="The apps' shuffle test, on this page: the ops on screen, replayed in 1,000 random causal orders by the skeleton's runShuffle.">The apps' shuffle test, on this page: the ops on screen, replayed in 1,000 random causal orders by the skeleton's runShuffle.</p>
</aside>
</div>
</div></section>

<section class="sec" id="criteria" aria-labelledby="h-criteria"><div class="wrap">
${head('criteria', 'Where each criterion <i>is answered.</i>', `<p>The event's criteria, paraphrased from the official rules: a pass/fail Stage One, then five criteria at 20% each.</p>`)}
<div class="crit" role="list">
${criteria.map(([k, w, q, a, where, cls]) => `<div class="crit__row${cls ? ` ${cls}` : ''}" role="listitem"><p class="crit__k"><b>${k}</b><span>${w}</span><span class="q">${esc(q)}</span></p><p class="crit__a">${a}</p><p class="crit__w">${where}</p></div>`).join('\n')}
</div>
</div></section>

<section class="kiro" id="kiro" aria-labelledby="h-kiro"><div class="wrap">
${head('kiro', 'Most product commits are Kiro’s. <i>The hooks kept the ledger.</i>', `<p>Claude Code orchestrated: it wrote each brief (${PROMPTS.length} are committed in ${gh('evidence/kiro/prompts/', 'evidence/kiro/prompts/')}), launched a headless Kiro CLI session through ${gh('kit/scripts/kiro-run.mjs', 'kiro-run.mjs')}, reviewed the diff and committed. Kiro authored the specs and executed the tasks. Each card below says who wrote its files, counted from the ledger's <code>files_changed</code>.</p>`)}
<div class="meter" role="group" aria-label="Kiro share of the product commits">
<div class="meter__n">${(tally.kiro_share * 100).toFixed(2)}<small>%</small></div>
<div><p><b>${tally.kiro_product_commits} of ${tally.product_commits} product commits</b> (commits touching <code>skeleton/</code> or <code>apps/</code>) carry a <code>Kiro-Session</code> trailer; the ${tally.product_commits - tally.kiro_product_commits} others are listed with their subjects in ${gh('evidence/kiro/share.json', 'share.json')} (<code>pnpm share</code> recomputes it from git).</p><div class="meter__bar" aria-hidden="true"><span style="width:${(tally.kiro_share * 100).toFixed(2)}%"></span></div></div>
</div>
<ul class="kstats">
<li><b>${tally.kiro_sessions}</b><span>Kiro sessions, all headless CLI</span></li>
<li><b>${tally.credits_used}</b><span>credits, one ledger row per session</span></li>
<li><b>${tally.spec_dirs}</b><span>specs, ${tally.kiro_executed_spec_tasks} sessions inside them</span></li>
<li><b>${n(tally.hook_fires_total)}</b><span>logged runs of ${HOOKS.length} hooks</span></li>
<li><b>${stopBlocks.length}</b><span>Stop-gate blocks in the build (the A/B pilot's ${ab.arms.B.stop_blocks} are logged apart)</span></li>
</ul>
<ul class="kgrid">
<li class="kcard wide"><div class="kcard__head"><h3>Specs <small>${SPECS.length}</small></h3><span class="who who--k">written + executed by Kiro</span></div>
<p>Requirements (or a bugfix document), design and tasks for each feature, authored by a Kiro session from a brief; tasks bounded each session and gave the hooks a place to check. Review findings became bugfix specs instead of silent patches.</p>
<table class="ktable"><thead><tr><th scope="col">spec</th><th scope="col">kind</th><th scope="col">sessions</th></tr></thead><tbody>
${SPECS.map((d) => `<tr><td>${gh(`.kiro/specs/${d}/`, d)}</td><td>${specKind(d)}</td><td class="n">${tally.specs[d]}</td></tr>`).join('')}
</tbody></table>
<dl><dt>ledger</dt><dd>${tSpecs.kiro} Kiro sessions changed files in <code>.kiro/specs/</code>; ${tSpecs.hand} hand edits</dd><dt>evidence</dt><dd>${gh('evidence/kiro/sessions.jsonl', 'sessions.jsonl')} ${gh('evidence/kiro/tally.json', 'tally.json')}</dd></dl></li>
<li class="kcard"><div class="kcard__head"><h3>Agent Stop gate</h3><span class="who who--k">fired by Kiro CLI</span></div>
<p>${gh('.kiro/hooks/stop-gate.json', 'stop-gate.json')} runs the fast-tier properties when Kiro tries to finish and refuses while one fails (at most ${MAX_BLOCKS} blocks a session). It refused <b>${stopBlocks.length} times</b> in the ${tally.kiro_sessions} build sessions:</p>
<p><b>${unplanned.ts.slice(0, 10)}, unplanned.</b> Merge-kit task 9.5 added <code>item.move</code>; the after-task property run failed and the gate blocked. Kiro added the op's property file and per-op payload generators to the shared suite (${ghc('651730d')}), and the gate then passed.</p>
<p><b>${seeded.ts.slice(0, 10)}, seeded.</b> We broke <code>item.tick</code> with a wall-clock tie-break on purpose (${ghc('cca30a0')}, a claude-direct row); Kiro found it and removed the clock. The log is in the next card.</p>
<dl><dt>files</dt><dd>${gh('.kiro/hooks/stop-gate.json', 'stop-gate.json')} ${gh('kit/hooks/stop-gate.mjs', 'stop-gate.mjs')}</dd><dt>evidence</dt><dd>${gh('evidence/kiro/hooks.jsonl', 'hooks.jsonl')} ${gh('evidence/kiro/g2/kiro-closing.txt', 'kiro-closing.txt')}</dd></dl></li>
<li class="kcard wide"><div class="kcard__head"><h3>The seeded block, from the hook log</h3><span class="who who--n">re-set, not re-run</span></div>
<div class="term"><div class="term__bar"><i></i><i></i><i></i><span>${esc(seeded.session_id.slice(0, 13))} · merge-kit task 12 · ${seeded.ts.slice(0, 10)} (UTC)</span></div><pre>${logHtml.map((l) => `<span class="ln">${l}</span>`).join('')}</pre><p class="term__src">Selected rows of the session in ${gh('evidence/kiro/hooks.jsonl', 'hooks.jsonl')} (${seededRows.length} rows in all); the FAIL lines and Kiro's words are from ${gh('evidence/kiro/g2/kiro-closing.txt', 'kiro-closing.txt')}.</p></div></li>
<li class="kcard"><div class="kcard__head"><h3>Steering <small>${STEERING.length}</small></h3><span class="who who--k">written by Kiro</span></div>
<p>The rules Kiro was held to: no wall clock; every op commutes or declares its merge. <code>ops-guide.md</code> lists four wrong-but-convergent ops, so the model sees the failure it is most likely to write.</p>
<table class="ktable"><tbody>${STEERING.map((st) => `<tr><td>${gh(`.kiro/steering/${st.file}`, st.file)}</td><td>${st.inclusion === 'always' ? 'always' : 'file match'}</td><td class="n">${tally.steering_sessions_by_file[`.kiro/steering/${st.file}`]}</td></tr>`).join('')}</tbody></table>
<dl><dt>ledger</dt><dd>sessions that loaded each file; ${tSteer.kiro} Kiro sessions wrote them, ${tSteer.hand} hand edits</dd></dl></li>
<li class="kcard full"><div class="kcard__head"><h3>Hooks <small>${HOOKS.length} · ${n(tally.hook_fires_total)} fires</small></h3><span class="who who--k">written by Kiro</span></div>
<p>Each hook is a command in ${gh('kit/hooks/')}; each run is one row in the hook log, written only by the hook scripts. At least ${manualHookRuns} of the rows are Kiro running a hook script by hand from its shell (for example <code>echo … | node kit/hooks/op-lint.mjs</code>); the rest fired from a Kiro trigger.</p>
<table class="ktable ktable--hooks"><thead><tr><th scope="col">hook</th><th scope="col">trigger</th><th scope="col">job</th><th scope="col">fires</th><th scope="col">outcome</th></tr></thead><tbody>
${hookOrder.map((name) => { const h = hookByName[name]; return `<tr${name === 'stop-gate' ? ' class="hot"' : ''}><td>${gh(`.kiro/hooks/${h.file}`, name)}</td><td>${esc(h.trigger)}${h.matcher ? ` <code>${esc(h.matcher.length > 22 ? 'op files' : h.matcher)}</code>` : ''}</td><td>${esc(h.description)}</td><td class="n">${n(tally.hooks_by_hook[name])}</td><td>${esc(hookOutcome[name])}</td></tr>`; }).join('\n')}
</tbody></table>
<dl><dt>ledger</dt><dd>${tHooks.kiro} Kiro sessions changed <code>.kiro/hooks/</code> or <code>kit/hooks/</code>; ${tHooks.hand} hand edits</dd><dt>evidence</dt><dd>${gh('evidence/kiro/hooks.jsonl', 'hooks.jsonl')} ${gh('kit/scripts/gate-integrity.mjs', 'gate-integrity.mjs')} (hook files hash-checked in CI)</dd></dl></li>
<li class="kcard"><div class="kcard__head"><h3>Custom agents <small>${AGENTS.length}</small></h3><span class="who who--k">written by Kiro</span></div>
<p><b>limbo-kitsmith</b> revises the kit and authors specs (${agentRuns['limbo-kitsmith']} sessions). <b>limbo-builder</b> loads the steering and the MCP server with scoped shell and write permissions (${agentRuns['limbo-builder']} sessions). Kiro's built-in spec agent ran ${agentRuns.spec}, the default agent ${agentRuns.default}.</p>
<dl><dt>files</dt><dd>${AGENTS.map((a) => gh(`.kiro/agents/${a.name}.json`, `${a.name}.json`)).join(' ')} ${gh('.kiro/agents/prompts/')}</dd><dt>ledger</dt><dd>${tAgents.kiro} Kiro sessions wrote them, ${tAgents.hand} hand edits</dd></dl></li>
<li class="kcard"><div class="kcard__head"><h3>MCP server</h3><span class="who who--k">server by Kiro · config by hand</span></div>
<p><code>limbo-convergence</code>: ${mcpTools.map((t) => `<code>${t}</code>`).join(', ')}. Called ${tally.mcp_calls} times from ${tally.mcp_sessions} Kiro session, fuzzing ${tally.mcp_fuzzed_ops.length} ops across both apps (${Object.entries(tally.mcp_calls_by_tool).map(([t, k]) => `${t} ${k}`).join(', ')}): a modest contribution.</p>
<dl><dt>files</dt><dd>${gh('kit/mcp/server.mjs', 'server.mjs')} ${gh('kit/mcp/tools.ts', 'tools.ts')} ${gh('.kiro/settings/mcp.json', 'mcp.json')}</dd><dt>ledger</dt><dd>${tMcp.kiro} Kiro sessions wrote <code>kit/mcp/</code>, ${tMcp.hand} hand edit (a test race, ${ghc('d40a167')}); <code>mcp.json</code> is a hand row too (Kiro's Write File tool failed on it)</dd><dt>evidence</dt><dd>${gh('evidence/kiro/mcp-calls.jsonl', 'mcp-calls.jsonl')}</dd></dl></li>
<li class="kcard"><div class="kcard__head"><h3>Property-based tests</h3><span class="who who--k">harness by Kiro</span></div>
<p>fast-check properties the hooks run: convergence, replay equivalence, idempotence, commutation, no lost edit and each rule's intent. ${BAD.length} deliberately wrong ops in ${gh('kit/props/bad/', 'kit/props/bad/')} must each be killed, or the suite fails. Full tier: ${n(conv.orderings)} orderings.</p>
<dl><dt>files</dt><dd>${gh('kit/props/')} ${gh('kit/props/mutants.props.test.ts', 'mutants.props.test.ts')}</dd><dt>ledger</dt><dd>${tProps.kiro} Kiro sessions and ${tProps.hand} hand edits in <code>kit/props/</code>; the simulator it uses, <code>skeleton/src/core/simulate.ts</code>, has ${simulateHand} more hand rows (each logged)</dd></dl></li>
<li class="kcard"><div class="kcard__head"><h3>CLI only, headless</h3><span class="who who--o">our orchestration</span></div>
<p>All ${tally.kiro_sessions} sessions: <code>kiro-cli chat --v3 --no-interactive</code>, versions ${cliVersions}. The CLI fires the spec task hooks and the Agent Stop hook. No logged session used the Kiro IDE, so none used its Spec Correctness or Agent Hooks panel; no Powers.</p>
<dl><dt>files</dt><dd>${gh('kit/scripts/kiro-run.mjs', 'kiro-run.mjs')} ${gh('evidence/kiro/prompts/', 'prompts/')}</dd></dl></li>
<li class="kcard"><div class="kcard__head"><h3>The ledgers</h3><span class="who who--o">wrapper + hooks</span></div>
<p>${gh('evidence/kiro/sessions.jsonl', 'sessions.jsonl')}: one row per Kiro session (spec, task, agent, credits, hooks fired, steering loaded, files changed, outcome), <b>${sessions.length} rows</b>: ${kiroRows.length} Kiro, ${handRows.length} hand edits with their reasons. ${gh('evidence/kiro/hooks.jsonl', 'hooks.jsonl')}: <b>${n(hookRows.length)} rows</b>, written only by the hook scripts.</p>
<dl><dt>recompute</dt><dd>${gh('kit/scripts/readme-tally.mjs', 'readme-tally.mjs')} ${gh('kit/scripts/kiro-share.mjs', 'kiro-share.mjs')}</dd><dt>output</dt><dd>${gh('evidence/kiro/tally.json', 'tally.json')} ${gh('evidence/kiro/share.json', 'share.json')}</dd></dl></li>
<li class="kcard"><div class="kcard__head"><h3>A pre-registered A/B</h3><span class="who who--o">our experiment</span></div>
<p>${ab.runs_done} op-writing runs, without and with the kit, registered before run 1:</p>
<div class="ab"><div><b>${ab.fails.A.k} of ${ab.fails.A.n}</b><span>held-out failures, no kit</span></div><div><b>${ab.fails.B.k} of ${ab.fails.B.n}</b><span>held-out failures, kit</span></div></div>
<p>No measurable effect (Fisher p = ${ab.fisher_two_sided_p}). We claim nothing about the kit improving correctness.</p>
<dl><dt>evidence</dt><dd>${gh('evidence/kiro/ab/PREREG.md', 'PREREG.md')} ${gh('evidence/kiro/ab/summary.md', 'summary.md')} ${gh('evidence/kiro/ab/observations.md', 'observations.md')}</dd></dl></li>
</ul>
</div></section>

<section class="sec" id="video" aria-labelledby="h-video"><div class="wrap">
${head('video', `The video, <i>chapter by chapter.</i>`, `<p>${VIDEO_LEN}, public on YouTube. Each chapter opens the video at its timestamp; under it is what the voiceover says (${gh('docs/VIDEO.md', 'docs/VIDEO.md')}).</p>`)}
<div class="vid">
<div><a class="vid__thumb" href="${VIDEO}" aria-label="Play the ${VIDEO_LEN} LIMBO demo video on YouTube">${img('/assets/crop-twin-b.webp', '', 1000, 980)}<span class="vid__play" aria-hidden="true">${ICON.play}</span><span class="vid__len">${VIDEO_LEN}</span></a>
<p class="small vid__note">Product footage is captured from the deployed apps in real time. The Stop-gate scene replays a logged session, labelled on screen. Voiceover: ElevenLabs. Music and sound: synthesized, no third-party music. The still above is BASECAMP's replica B after reconnect.</p></div>
<ol class="chap">
${CHAPTERS.map((c) => `<li><a href="${VIDEO}?t=${c.s}"><span class="chap__t">${c.t}</span><span class="chap__l">${esc(c.label)}</span>${KIRO_TAGS[c.t] ? `<span class="chap__k">Kiro · ${KIRO_TAGS[c.t]}</span>` : '<span></span>'}<span class="chap__vo">${esc(c.vo.join(' '))}</span></a></li>`).join('\n')}
</ol>
</div>
</div></section>

<section class="sec" id="receipts" aria-labelledby="h-receipts"><div class="wrap">
${head('receipts', 'Every number <i>has a file.</i>', `<p>Every figure in these cards is read from the committed evidence when this page is generated. ${gh('DEMO.md')} has the command that regenerates each one.</p>`)}
<ul class="rgrid">
${receipts.map(([num, k, v, src]) => `<li class="rcpt"><span class="rcpt__n">${num}</span><span class="rcpt__k">${k}</span><span class="rcpt__v">${v}</span><span class="rcpt__src">${src}</span></li>`).join('\n')}
</ul>
<p class="small rnote">${WORKFLOWS.length} GitHub Actions workflows: ${WORKFLOWS.map((f) => `<a href="${REPO}/actions/workflows/${f}">${esc(wfName(f))}</a>`).join(', ')}. CI, E2E, CodeQL, Security and Lighthouse run on every push to <code>main</code>; Deploy and Release start after a green CI run on <code>main</code> (or by manual dispatch). This page is checked against the evidence in CI (<code>judge-build.mjs --check</code>), and its ${'${LINKS}'} repository links are checked to exist when it is generated.</p>
</div></section>

<section class="sec" id="real" aria-labelledby="h-real"><div class="wrap">
${head('real', 'What is real, <i>what is simulated.</i>', `<p>Said before you have to ask.</p>`)}
<div class="real" role="list">
${real.map(([k, st, tone, v, src]) => `<div class="real__row" role="listitem"><p class="real__k">${k}</p><p class="real__st"><span class="stamp-s stamp-s--${tone}">${st}</span></p><p class="real__v">${v}<span class="src">${src}</span></p></div>`).join('\n')}
</div>
</div></section>

<section class="sec" id="verify" aria-labelledby="h-verify"><div class="wrap">
${head('verify', 'From a clone, <i>no Kiro account needed.</i>', '')}
<div class="verify">
<div><p>Node 22 or later and pnpm 10 (<code>corepack enable</code>). Nothing below needs Kiro, a key or credits. Expected outputs are quoted from the committed receipts: ${gh(CI_LOG, CI_LOG.split('/').pop())} and ${gh('evidence/convergence/full-2026-11-22.json', 'full-2026-11-22.json')}.</p><p>Every other number has its command in ${gh('DEMO.md')}.</p></div>
<div class="term"><div class="term__bar"><i></i><i></i><i></i><span>a fresh clone</span><button class="copy" type="button" data-copy>copy the commands</button></div>
<pre><code>${verify.map(([k, t]) => `<span class="ln ln--${k}">${k === 'c' ? '<span class="pr" aria-hidden="true">$ </span>' : ''}${esc(t)}</span>`).join('')}</code></pre></div>
</div>
</div></section>

<section class="sec" id="limits" aria-labelledby="h-limits"><div class="wrap">
${head('limits', 'Honest limits, <i>before you find them.</i>', '')}
<ol class="limits">
${limits.map(([b, t]) => `<li><div><b>${esc(b)}</b><span>${esc(t)}</span></div></li>`).join('\n')}
</ol>
</div></section>

</main>
<footer class="closing"><div class="wrap">
<h2>Cut the link yourself. <em>Watch the tent come back.</em></h2>
<div class="cta"><a class="btn solid" href="${URLS.basecamp}" target="_blank" rel="noopener">${ICON.open}<span>Open BASECAMP</span></a><a class="btn" href="${URLS.aftershock}" target="_blank" rel="noopener">${ICON.open}<span>Open AFTERSHOCK</span></a><a class="btn" href="#run">Run it on this page</a></div>
<div class="foot">
<a class="brand" href="/"><img src="/assets/icon.svg" alt="" width="32" height="32"><b>LIMBO</b></a>
<nav aria-label="Footer"><a href="/">Landing</a><a href="/deck/">Pitch deck</a><a href="${VIDEO}">Video</a><a href="${REPO}">Source (MIT)</a><a href="${REPO}/blob/main/JUDGE.md">JUDGE.md</a><a href="${REPO}/blob/main/DEMO.md">DEMO.md</a><a href="${REPO}/blob/main/README.md">README</a><a href="${DEVPOST}">Devpost entry</a><a href="${EVENT}">Kiroween 2026</a></nav>
<a class="version-chip" id="version" href="${REPO}/releases/latest">latest release</a>
<p>Kiroween 2026 · Skeleton Crew · MIT. Every measured figure on this page is read from a file in the repository when the page is generated by ${gh('kit/scripts/judge-build.mjs', 'kit/scripts/judge-build.mjs')}; the only figures computed in your browser are the instrument's fingerprints, its shuffle count and its time.</p>
</div>
</div></footer>
<script>
(function () {
  var d = document;
  // header rule once the page scrolls
  var top = d.getElementById('top');
  var onScroll = function () { top.classList.toggle('is-stuck', window.scrollY > 8); };
  window.addEventListener('scroll', onScroll, { passive: true }); onScroll();
  // copy the $ lines of the verify block
  var cp = d.querySelector('[data-copy]');
  if (cp) cp.addEventListener('click', function () {
    var t = Array.prototype.map.call(cp.closest('.term').querySelectorAll('.ln--c'), function (l) { return l.textContent.replace(/^\\$ /, ''); }).join('\\n');
    var done = function (m) { cp.textContent = m; setTimeout(function () { cp.textContent = 'copy the commands'; }, 1800); };
    if (navigator.clipboard) navigator.clipboard.writeText(t).then(function () { done('copied'); }, function () { done('select the text'); }); else done('select the text');
  });
  // version chip: the baked text stays if the request fails (offline, rate limit)
  fetch('https://api.github.com/repos/edycutjong/limbo/releases/latest').then(function (r) { return r.ok ? r.json() : null; })
    .then(function (j) { if (j && j.tag_name) d.getElementById('version').textContent = j.tag_name; }).catch(function () {});
  // the instrument: download the engine on the first press (or when a pointer or focus arrives), then hand it the press.
  // If it cannot load, the panel says RECORDED and shows what the same code printed at build time.
  var root = d.querySelector('[data-proof]');
  if (!root) return;
  var state = 0, queued = null, label = root.querySelector('[data-engine]');
  var recorded = function () { state = 3; root.dataset.engine = 'recorded'; label.textContent = 'RECORDED'; root.querySelector('[data-say]').textContent = 'The engine could not load in this browser. Below: what the same code printed when this page was built.'; };
  var load = function () {
    if (state) return;
    state = 1; root.dataset.engine = 'loading'; label.textContent = 'LOADING';
    var s = d.createElement('script'), timer = setTimeout(recorded, 12000);
    s.src = root.dataset.src; s.async = true;
    s.onload = function () {
      clearTimeout(timer);
      if (state === 3) return;
      if (!window.LimboJudge || !window.LimboJudge.mount) { recorded(); return; }
      state = 2; var p = queued; queued = null;
      window.LimboJudge.mount(root, p || undefined).catch(recorded);
    };
    s.onerror = function () { clearTimeout(timer); recorded(); };
    d.head.appendChild(s);
  };
  root.addEventListener('click', function (e) {
    if (state === 2 || state === 3) return;
    var el = e.target.closest('[data-act]');
    if (!el || !root.contains(el)) return;
    var plate = el.closest('[data-replica]');
    queued = { act: el.dataset.act };
    if (el.dataset.id) queued.id = el.dataset.id;
    if (plate) queued.replica = plate.dataset.replica;
    if (el.dataset.who) queued.who = el.dataset.who;
    load();
  }, true);
  root.addEventListener('pointerenter', load, { once: true });
  root.addEventListener('focusin', load, { once: true });
})();
</script>
</body>
</html>
`;

// ---------------------------------------------------------------- JUDGE.md (the mirror)
const mdHref = (href) => (href.startsWith('#') ? `${SITE}/judge${href}` : href.startsWith('/') ? `${SITE}${href}` : href.replace(`${REPO}/blob/main/`, '').replace(`${REPO}/tree/main/`, ''));
const strip = (h) => h.replace(/<a [^>]*href="([^"]+)"[^>]*>(.*?)<\/a>/g, (_, href, t) => `[${t.replace(/<[^>]+>/g, '')}](${mdHref(href)})`).replace(/<code>(.*?)<\/code>/g, '`$1`').replace(/<\/?(b|i|em|small|span)[^>]*>/g, '').replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"');
const md = `# LIMBO, for judges

Live page: ${SITE}/judge (this file is its mirror; both, and the page's live instrument, are generated by \`node kit/scripts/judge-build.mjs\` from \`evidence/\`).

> ${CLAIM}

LIMBO is a local-first skeleton where every op declares how it merges. Kiroween 2026, **Skeleton Crew**: one skeleton (\`skeleton/\`) and two apps in two folders (\`apps/basecamp/\`, \`apps/aftershock/\`). No install, no login. Video: ${VIDEO} (${VIDEO_LEN}). Devpost: ${DEVPOST}

## I. Skeleton Crew

- \`skeleton/\`: \`core/\` (ops and the ${MERGES.length} named merge rules: ${MERGES.map((m) => `\`${m}\``).join(', ')}), \`sync/\` (replica, links, the local op log), \`limbo/\` (fog, twins, the Inspector, FIXED). ${lean.skeleton_budget_files} files and ${n(lean.skeleton_budget_loc)} lines by the budget count (budget ${BUDGET.files} files, ${BUDGET.lines} lines), ${lean.index_exports} exported values (\`evidence/lean.json\`).
- \`apps/basecamp/\`: a group trip list, ${lean.basecamp_ops} ops. Live: ${URLS.basecamp}
- \`apps/aftershock/\`: a field survey form on a sector grid, ${lean.aftershock_ops} ops, demo data. Live: ${URLS.aftershock}
- Each app supplies five things: a model, ops, a seed script, views and a config ([docs/ADOPT.md](docs/ADOPT.md)). AFTERSHOCK's ${tally.specs.aftershock} Kiro spec sessions changed 0 files under \`skeleton/\` (later UI polish touched skeleton CSS and markup for both apps).

## II. The 60-second path

1. Open ${URLS.basecamp}. You should see two cards, **REPLICA A — Sari** and **REPLICA B — Budi**, joined by a cord captioned "${LINK_CAPTION}".
2. Press **Cut link**, then **Play the lake scene**. You should see both cards fog over, each chip reading "${P.limbo.cards.a.chip}".
3. Press **Restore link**. You should see the tent back as a twin on both cards ("TWIN · Budi deleted this while Sari ticked it · rule: resurrect") and, on Budi's card, "TWIN · Budi and Sari both claimed this · rule: claim-one" with **OK** and **Why Sari?**.
4. Tap **Keep** on the tent twin and **OK** on Budi's lost claim. You should see the **FIXED** stamp on both replicas.
5. Your own edit: type an item into *Add an item* on A, **Cut link**, tick it on A, delete it on B (**⋯** then **Delete**), **Restore link**. It comes back as a twin on both cards (rule: resurrect); **Keep** settles it.
6. Open the **Inspector**, then press **Run shuffle test**: "1,000 / 1,000 orderings → same state" (your browser replays the ops on screen; not the ${n(conv.orderings)}-ordering run).
7. Open ${URLS.aftershock}: **Cut link**, **Play the survey scene**, **Restore link**. Sector C3 reads UNSAFE, "5 reported — Sari 2, Budi 3"; **Keep Sari's note** or **Keep Budi's note** lands FIXED.

## III. Run it on this page

The live page embeds two BASECAMP replicas running the skeleton's \`createPair\` and BASECAMP's ops (\`site/src/judge.ts\`, bundled to \`site/assets/judge.js\`, loaded on first hover, focus or press). A checklist ticks from the engine's own values, and the shuffle replays the ops on screen in ${n(P.shuffle.ran)} random causal orders. What the same code printed when the page was built:

${recRows.map(([k, v]) => `- **${k}:** ${strip(v)}`).join('\n')}

## IV. The five criteria

| Criterion | Weight | Where it is answered |
|---|---|---|
${criteria.map(([k, w, , a, where]) => `| ${k} | ${w} | ${strip(a)} (${strip(where)}) |`).join('\n')}

## V. Kiro, file by file

- **Kiro share:** ${tally.kiro_product_commits} of ${tally.product_commits} product commits (${pct(tally.kiro_share)}) carry a \`Kiro-Session\` trailer; the ${tally.product_commits - tally.kiro_product_commits} others are listed in \`evidence/kiro/share.json\`.
- **Sessions:** ${tally.kiro_sessions} headless Kiro CLI build sessions (${tally.credits_used} credits; ${cliVersions}), ${tally.kiro_executed_spec_tasks} inside ${tally.spec_dirs} specs; ${handText} in the ledger (\`evidence/kiro/sessions.jsonl\`). The ${tally.ab_sessions} A/B pilot sessions (${tally.ab_credits} credits) are logged separately in \`evidence/kiro/ab/\`. ${PROMPTS.length} briefs in \`evidence/kiro/prompts/\`.
- **Specs (${SPECS.length}, \`.kiro/specs/\`):** ${SPECS.map((d) => `${d} (${specKind(d)}, ${tally.specs[d]} sessions)`).join(', ')}.
- **Hooks (${HOOKS.length}, ${n(tally.hook_fires_total)} logged runs, at least ${manualHookRuns} of them started by hand from Kiro's shell, \`.kiro/hooks/\`):** ${hookOrder.map((name) => `\`${name}\` ${hookByName[name].trigger}, ${n(tally.hooks_by_hook[name])} (${hookOutcome[name]})`).join('; ')}.
- **Agent Stop gate:** refused "done" ${stopBlocks.length} times in the build (at most ${MAX_BLOCKS} blocks a session): ${unplanned.ts.slice(0, 10)} unplanned (merge-kit task 9.5 added \`item.move\`, the after-task properties failed; Kiro added per-op payload generators to the shared suite in \`651730d\` and the gate passed), ${seeded.ts.slice(0, 10)} on a wall-clock fault seeded on purpose (\`cca30a0\`, session \`sess_545bc98d\`).
- **Steering (${STEERING.length}):** ${STEERING.map((st) => `${st.file} (${st.inclusion === 'always' ? 'always' : 'file match'}, ${tally.steering_sessions_by_file[`.kiro/steering/${st.file}`]} sessions)`).join(', ')}.
- **Custom agents (${AGENTS.length}):** limbo-kitsmith (${agentRuns['limbo-kitsmith']} sessions), limbo-builder (${agentRuns['limbo-builder']}); Kiro's built-in spec agent ran ${agentRuns.spec}, the default agent ${agentRuns.default}.
- **MCP:** \`limbo-convergence\` (${mcpTools.join(', ')}), ${tally.mcp_calls} calls from ${tally.mcp_sessions} session, a modest contribution. Server by Kiro (${tMcp.kiro} sessions; ${tMcp.hand} hand fix to a test); \`.kiro/settings/mcp.json\` was written by hand (Kiro's Write File tool failed on it).
- **Property-based tests:** fast-check properties run by the hooks; ${BAD.length} wrong ops in \`kit/props/bad/\` must be killed.
- **CLI only:** no logged session used the Kiro IDE, its Spec Correctness or Agent Hooks panel, or Powers.
- **A/B pilot (pre-registered):** ${ab.fails.A.k} of 10 vs ${ab.fails.B.k} of 10 held-out failures, Fisher p = ${ab.fisher_two_sided_p}: no measurable effect (\`evidence/kiro/ab/\`).

## VI. The video, by chapter

${VIDEO} (${VIDEO_LEN}; chapters and transcript in [docs/VIDEO.md](docs/VIDEO.md))

${CHAPTERS.map((c) => `- [${c.t}](${VIDEO}?t=${c.s}) ${c.label}${KIRO_TAGS[c.t] ? ` (on screen: ${KIRO_TAGS[c.t]})` : ''}`).join('\n')}

## VII. Receipts

| Number | What | Source |
|---|---|---|
${receipts.map(([num, k, v, src]) => `| ${strip(num)} | ${k}: ${strip(v)} | ${strip(src)} |`).join('\n')}

## VIII. Real or simulated

| Claim | Status | Detail |
|---|---|---|
${real.map(([k, st, , v, src]) => `| ${k} | ${st} | ${strip(v)} (${strip(src)}) |`).join('\n')}

## IX. Verify from a clone

\`\`\`
${verify.map(([k, t]) => (k === 'c' ? `$ ${t}` : t)).join('\n')}
\`\`\`

## X. Honest limits

${limits.map(([b, t], i) => `${i + 1}. **${b}** ${t}`).join('\n')}

## Links

- Live: ${URLS.landing} · ${URLS.basecamp} · ${URLS.aftershock} · ${URLS.deck}
- Repository (MIT): ${REPO} · Devpost: ${DEVPOST} · Video: ${VIDEO}
`;

// ---------------------------------------------------------------- write or check
const LINKS = checkLinks();
const page = html.replace('${LINKS}', String(LINKS));
const outputs = [
  ['site/judge.html', page],
  ['JUDGE.md', md],
  ['site/assets/judge.js', bundle],
];
if (CHECK) {
  const stale = outputs.filter(([f, body]) => !existsSync(f) || !readFileSync(f).equals(Buffer.isBuffer(body) ? body : Buffer.from(body)));
  if (stale.length) fail(`FAIL judge pages are stale: ${stale.map(([f]) => f).join(', ')}. Run node kit/scripts/judge-build.mjs`);
  console.log(`OK judge pages match evidence/ (${LINKS} repository links checked, judge.js ${bundleKB} KB)`);
} else {
  for (const [f, body] of outputs) writeFileSync(f, body);
  console.log(`wrote site/judge.html, JUDGE.md and site/assets/judge.js (${LINKS} repository links checked, judge.js ${bundleKB} KB / ${bundleGzKB} KB gzipped)`);
}
