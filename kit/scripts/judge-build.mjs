#!/usr/bin/env node
// Renders the /judge page (site/judge.html) and its mirror JUDGE.md from one source, so the two never drift and every number
// on them is read from a committed measurement under evidence/. `--check` fails when either file differs from a fresh render.
// Usage: node kit/scripts/judge-build.mjs [--check]
import { readFileSync, writeFileSync } from 'node:fs';

const json = (f) => JSON.parse(readFileSync(f, 'utf8'));
const conv = json('evidence/convergence/full-2026-11-22.json');
const tally = json('evidence/kiro/tally.json');
const share = json('evidence/kiro/share.json');
const ci = json('evidence/ci/latest.json');
const n = (x) => x.toLocaleString('en-US');
const failures = Object.values(conv.failuresPerProperty).reduce((a, b) => a + b, 0);
const pct = (x) => `${(x * 100).toFixed(2)}%`;

const CLAIM = 'When the connection dies, your app keeps working. When it returns, an item deleted while it was edited comes back as a ghost twin, and a lost claim is shown to its owner.';
const REPO = 'https://github.com/edycutjong/limbo';
const URLS = {
  basecamp: 'https://basecamp.limbo.edycu.dev/?replicas=2',
  aftershock: 'https://aftershock.limbo.edycu.dev/?replicas=2',
  landing: 'https://limbo.edycu.dev/',
};

const path = [
  [`Open <a href="${URLS.basecamp}">BASECAMP in its two-replica view</a>. No install, no login, no credits. Two cards appear: REPLICA A (Sari) and REPLICA B (Budi), joined by an in-page link that is labelled as simulated.`,
   `Open [BASECAMP in its two-replica view](${URLS.basecamp}). No install, no login, no credits. Two cards appear: REPLICA A (Sari) and REPLICA B (Budi), joined by an in-page link that is labelled as simulated.`],
  ['Press <strong>Cut link</strong>. Both cards fog over and count their waiting edits.', 'Press **Cut link**. Both cards fog over and count their waiting edits.'],
  ['Press <strong>Play the lake scene</strong>. Sari ticks the tent while Budi deletes it, and both claim the last stove.', 'Press **Play the lake scene**. Sari ticks the tent while Budi deletes it, and both claim the last stove.'],
  ['Press <strong>Restore link</strong>. The tent returns as a ghost <em>twin</em>; the stove goes to exactly one claimant on both replicas.', 'Press **Restore link**. The tent returns as a ghost _twin_; the stove goes to exactly one claimant on both replicas.'],
  ['Tap <strong>Keep</strong> on the twin and <strong>OK</strong> on the lost claim. The fog lifts and the <strong>FIXED</strong> stamp appears: both replicas hold the same list.', 'Tap **Keep** on the twin and **OK** on the lost claim. The fog lifts and the **FIXED** stamp appears: both replicas hold the same list.'],
  ['Now your own edit, not the scene: type an item into <strong>Add an item</strong> on REPLICA A (it appears on B), press <strong>Cut link</strong>, tick it on A and delete it on B (<strong>⋯</strong> then <strong>Delete</strong>), press <strong>Restore link</strong>. It comes back as a twin on both cards (rule: resurrect); <strong>Keep</strong> settles it.',
   'Now your own edit, not the scene: type an item into **Add an item** on REPLICA A (it appears on B), press **Cut link**, tick it on A and delete it on B (**⋯** then **Delete**), press **Restore link**. It comes back as a twin on both cards (rule: resurrect); **Keep** settles it.'],
  [`Open <a href="${URLS.aftershock}">AFTERSHOCK</a> (a second, different app on the same skeleton) and run the same cut, <strong>Play the survey scene</strong>, restore. Resolve the lost note by tapping either <strong>Keep … note</strong> button on the twin card.`, `Open [AFTERSHOCK](${URLS.aftershock}) (a second, different app on the same skeleton) and run the same cut, **Play the survey scene**, restore. Resolve the lost note by tapping either **Keep … note** button on the twin card.`],
  ['Then press <strong>Run shuffle test</strong> in either page\'s shuffle section: it replays the on-screen ops in random causal orders in your browser (the same ops replayed, not the 10,000-ordering run).', 'Then press **Run shuffle test** in either page\'s shuffle section: it replays the on-screen ops in random causal orders in your browser (the same ops replayed, not the 10,000-ordering run).'],
];

const receipts = [
  ['Convergence', `${n(conv.orderings)} random orderings of ${conv.replicas} replicas, ${failures} divergences across every op of both apps (seed ${conv.seed}); a measured, property-tested claim, not a proof`, 'evidence/convergence/full-2026-11-22.json'],
  ['Tests', `${n(ci.unit.passed)} unit, component and property tests pass (${ci.unit.skipped} skipped: the AFTERSHOCK rows for conflict classes it has no ops for), ${ci.e2e.passed} Playwright e2e tests pass (${ci.e2e.skipped} skipped: viewport-conditional checks)`, 'evidence/ci/latest.json'],
  ['Coverage', `${ci.coverage.statements}% statements, ${ci.coverage.lines}% lines, ${ci.coverage.branches}% branches, ${ci.coverage.functions}% functions on skeleton/src and apps/*/src, excluding the React views, the browser and worker entries and the dev relay (each listed with its reason in vitest.config.ts); CI fails below 100%. The landing hero (site/) is outside this gate`, 'evidence/ci/latest.json, vitest.config.ts'],
  ['Kiro work', `${tally.kiro_sessions} Kiro sessions (build ledger; the A/B pilot sessions are logged separately), ${tally.kiro_executed_spec_tasks} sessions across ${tally.spec_dirs} specs (${tally.spec_sessions_numbered_task} ran numbered tasks, ${tally.spec_sessions_authoring} authored a spec, ${tally.spec_sessions_other} were follow-ups), ${n(tally.hook_fires_total)} hook fires, ${tally.credits_used} credits`, 'evidence/kiro/sessions.jsonl, hooks.jsonl, tally.json'],
  ['Kiro share', `${tally.kiro_product_commits} of ${tally.product_commits} product commits carry a Kiro-Session trailer (${pct(tally.kiro_share)}); the others are listed with their subjects`, 'evidence/kiro/share.json'],
];

const reproduce = [
  ['git clone ' + REPO + ' && cd limbo && pnpm install', 'the real product, locally'],
  ['pnpm --filter @limbo/basecamp dev', 'BASECAMP on http://localhost:5174 (AFTERSHOCK: pnpm --filter @limbo/aftershock dev)'],
  ['pnpm test:coverage', 'unit, component and property tests with the 100% coverage gate'],
  ['pnpm e2e:ci', 'two browser contexts, a real partition, offline shell'],
  ['pnpm props:full', 'the full 10,000-ordering tier (about 22 minutes)'],
  ['node kit/scripts/readme-tally.mjs', 'recomputes every Kiro number above from evidence/kiro/'],
];
const replay = 'The in-page "Run shuffle test" button replays the on-screen ops in random causal orders inside your browser and prints the count it actually ran. It is a deterministic replay of the same ops, not the full-tier run.';

const limits = [
  'The live apps sync two replicas through an in-page link that is labelled as simulated. There is no hosted cross-device relay; the two-browser-context partition test uses a dev-only relay that ships in no production build.',
  'No CRDT can stop two offline users from both claiming the last tent. Offline claims are provisional; on reconnect the op\'s declared rule picks one claimant deterministically and the other user sees a twin ghost.',
  'The pre-registered A/B pilot (20 op-writing runs with and without the kit) showed no measurable effect: held-out failures 0 of 10 in both arms (95% CI 0 to 28%, Fisher p = 1). We claim nothing about the kit improving correctness. It is published as run (evidence/kiro/ab/).',
  'AFTERSHOCK uses demonstration data; no field use is claimed. The Kiro IDE features (Spec Correctness, Agent Hooks panel) were not used: every build session ran through the Kiro CLI, dispatched by an outside orchestrator.',
];

const kiro = [
  ['.kiro/specs/', 'requirements, design and tasks for each feature, authored by Kiro sessions from an orchestrator brief. Start with .kiro/specs/basecamp/ or coverage-full/.'],
  ['.kiro/steering/', 'the rules Kiro was held to: local-first.md (no wall clock, commute or declare the merge) and testing.md (properties first).'],
  ['.kiro/hooks/ and .kiro/agents/', 'the hooks that ran the convergence properties after each task and blocked the agent from stopping while one failed.'],
  ['.kiro/hooks/stop-gate.json', `blocked Kiro from finishing ${tally.agent_stop_blocks_hooklog} times. Once unplanned: in merge-kit task 9.5 the shared property suite ran the new item.move op without its own payload generator, and Kiro wired it in (commit 651730d). Once on a wall-clock fault seeded on purpose (commit cca30a0); that is the session the video replays.`],
  ['evidence/kiro/sessions.jsonl', 'one row per Kiro session (spec, task, credits, hooks fired, outcome). Hand edits are logged as claude-direct rows. hooks.jsonl is written only by the hook scripts.'],
];

const links = [
  ['Repository (MIT)', REPO],
  ['BASECAMP', 'https://basecamp.limbo.edycu.dev/'],
  ['AFTERSHOCK', 'https://aftershock.limbo.edycu.dev/'],
  ['Landing page', URLS.landing],
];

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>LIMBO for judges: the judge path, the receipts, the limits</title>
<meta name="description" content="${esc(CLAIM)} The judge path (no install, no login), the measured receipts and the honest limits.">
<style>
  :root { --paper:#F2EADB; --ink:#1B1A17; --muted:#5B564B; --line:#CDBFA5; --accent:#1F4E79; }
  * { box-sizing: border-box; }
  body { margin:0; background:var(--paper); color:var(--ink); font:18px/1.55 "Atkinson Hyperlegible Next","Atkinson Hyperlegible",system-ui,sans-serif; }
  main { max-width: 860px; margin: 0 auto; padding: 40px 20px 64px; }
  h1 { font:400 clamp(32px,6vw,48px)/1.1 "Old Standard TT","Libre Caslon Text",Georgia,serif; margin:0 0 12px; }
  h2 { font:400 26px/1.2 "Old Standard TT","Libre Caslon Text",Georgia,serif; margin:36px 0 10px; }
  .claim { font-size:22px; border-left:4px solid var(--accent); padding:4px 0 4px 16px; margin:16px 0; }
  .version { font-size:14px; color:var(--muted); margin:0 0 20px; }
  .version a { color:var(--muted); }
  ol, ul { padding-left: 24px; } li { margin: 8px 0; }
  table { border-collapse: collapse; width:100%; font-size:16px; }
  th, td { text-align:left; vertical-align:top; padding:8px 10px; border-bottom:1px solid var(--line); }
  th { color:var(--muted); font-weight:600; width:150px; }
  code { font:15px/1.4 ui-monospace,SFMono-Regular,Menlo,monospace; background:#E8DEC8; padding:1px 5px; border-radius:3px; }
  .src { color:var(--muted); font-size:14px; }
  a { color:var(--accent); text-underline-offset:3px; }
  a:focus-visible { outline:3px solid var(--accent); outline-offset:2px; }
  a:hover { background:#E8DEC8; }
  .note { color:var(--muted); font-size:15px; }
  @media (max-width: 640px) { th { width:auto; display:block; border:0; padding-bottom:0; } td { display:block; } }
</style>
</head>
<body>
<main>
  <h1>LIMBO, for judges</h1>
  <p class="version"><a id="version" href="${REPO}/releases/latest">v${json('package.json').version}</a> · <a href="${URLS.landing}">landing page</a></p>
  <p class="claim">${esc(CLAIM)}</p>

  <h2>The judge path</h2>
  <p class="note">No setup, no keys, no cloning.</p>
  <ol>
${path.map(([h]) => `    <li>${h}</li>`).join('\n')}
  </ol>

  <h2>The receipts</h2>
  <table>
${receipts.map(([k, v, s]) => `    <tr><th scope="row">${esc(k)}</th><td>${esc(v)}<div class="src">${esc(s)}</div></td></tr>`).join('\n')}
  </table>

  <h2>Where Kiro did the work</h2>
  <ul>
${kiro.map(([k, v]) => `    <li><code>${esc(k)}</code>: ${esc(v)}</li>`).join('\n')}
  </ul>

  <h2>Reproduce it</h2>
  <ul>
${reproduce.map(([c, w]) => `    <li><code>${esc(c)}</code>: ${esc(w)}</li>`).join('\n')}
  </ul>
  <p class="note"><strong>CI / deterministic replay.</strong> ${esc(replay)}</p>

  <h2>Honest limits</h2>
  <ul>
${limits.map((l) => `    <li>${esc(l)}</li>`).join('\n')}
  </ul>

  <h2>Links</h2>
  <ul>
${links.map(([k, u]) => `    <li>${esc(k)}: <a href="${esc(u)}">${esc(u)}</a></li>`).join('\n')}
  </ul>
</main>
<script>
// Version chip: the baked text stays if the request fails (offline, rate limit, private repo).
fetch('https://api.github.com/repos/edycutjong/limbo/releases/latest').then(function (r) { return r.ok ? r.json() : null; })
  .then(function (j) { if (j && j.tag_name) document.getElementById('version').textContent = j.tag_name; }).catch(function () {});
</script>
</body>
</html>
`;

const md = `# LIMBO, for judges

Live page: https://limbo.edycu.dev/judge (this file is its mirror; both are generated by \`node kit/scripts/judge-build.mjs\`).

> ${CLAIM}

## The judge path

No setup, no keys, no cloning.

${path.map(([, m], i) => `${i + 1}. ${m}`).join('\n')}

## The receipts

| What | Number | Source |
|---|---|---|
${receipts.map(([k, v, s]) => `| ${k} | ${v} | \`${s}\` |`).join('\n')}

## Where Kiro did the work

${kiro.map(([k, v]) => `- \`${k}\`: ${v}`).join('\n')}

## Reproduce it

${reproduce.map(([c, w]) => `- \`${c}\`: ${w}`).join('\n')}

**CI / deterministic replay.** ${replay}

## Honest limits

${limits.map((l) => `- ${l}`).join('\n')}

## Links

${links.map(([k, u]) => `- ${k}: ${u}`).join('\n')}
`;

if (process.argv.includes('--check')) {
  const stale = [];
  if (readFileSync('site/judge.html', 'utf8') !== html) stale.push('site/judge.html');
  if (readFileSync('JUDGE.md', 'utf8') !== md) stale.push('JUDGE.md');
  if (stale.length) {
    console.error(`FAIL judge pages are stale: ${stale.join(', ')}. Run node kit/scripts/judge-build.mjs`);
    process.exit(1);
  }
  console.log('OK judge pages match evidence/');
} else {
  writeFileSync('site/judge.html', html);
  writeFileSync('JUDGE.md', md);
  console.log('wrote site/judge.html and JUDGE.md');
}
