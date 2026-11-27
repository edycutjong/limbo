// The /judge instrument: the judge path, run on the LIMBO skeleton inside the judge page. Two BASECAMP replicas in this tab,
// joined by the skeleton's in-page link (createPair), with BASECAMP's real ops and an in-memory store, so every reload
// starts from the seed. Nothing here is drawn by a script: each check ticks from a value the engine computes (view.axis,
// pair.queued, the materialized items, view.fixed), the state fingerprints hash each replica's own materialized state, and
// the shuffle replays the ops on screen through the skeleton's runShuffle, the code behind the apps' "Run shuffle test".
// Built into site/assets/judge.js by kit/scripts/judge-build.mjs, which also calls prerender() in Node for the page's
// static markup and its recorded fallback. Imports skeleton/ and apps/basecamp/ read-only; it changes neither.
import { canonical } from '../../skeleton/src/core/causal.ts';
import type { Op } from '../../skeleton/src/core/types.ts';
import { runShuffle } from '../../skeleton/src/limbo/shuffle.ts';
import type { Pair } from '../../skeleton/src/sync/pair.ts';
import * as config from '../../apps/basecamp/app.config.ts';
import { claimItem, deleteItem, releaseItem, restoreItem, tickItem } from '../../apps/basecamp/src/actions.ts';
import { displayName } from '../../apps/basecamp/src/members.ts';
import type { State } from '../../apps/basecamp/src/model.ts';
import { lakeScript } from '../../apps/basecamp/src/scene.ts';
import { card, lakeOffline, limboList, newPair, resolveNow, type CardData } from './hero.ts';

type Id = 'a' | 'b';
const IDS: readonly Id[] = ['a', 'b'];
/** The apps' shuffle test runs 1,000 orderings from seed 1 (skeleton/src/limbo/shuffle-test.tsx); so does this one. */
export const SHUFFLE_N = 1000;
export const SHUFFLE_SEED = 1;
const CHUNK = 25; // orderings per slice, so the page keeps painting while it counts

export type CheckId = 'cut' | 'limbo' | 'twin' | 'claim' | 'fixed' | 'shuffle';
export const CHECKS: readonly CheckId[] = ['cut', 'limbo', 'twin', 'claim', 'fixed', 'shuffle'];

/** FNV-1a over the canonical state: a short label for "these two replicas hold the same state". Not a security hash. */
export function fingerprint(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

const stateOf = (p: Pair<State>, id: Id): string => canonical((id === 'a' ? p.a : p.b).state());

/** Every op either replica holds, once each, in id order: the set a shuffle replays. */
export function opsOnScreen(p: Pair<State>): Op[] {
  const all = new Map<string, Op>();
  for (const o of [...p.a.log(), ...p.b.log()]) all.set(o.id, o);
  return [...all.values()].sort((x, y) => (x.id < y.id ? -1 : x.id > y.id ? 1 : 0));
}

export interface ShuffleOut {
  ran: number;
  ops: number;
  /** Distinct final states over every ordering run; 1 means every ordering agreed. */
  distinct: number;
  /** Fingerprint of the first ordering's final state. */
  print: string;
  ms: number;
}

/** runShuffle over `ops`, in slices with consecutive seeds, so the orderings are exactly those of one run of `n` from `seed`. */
export async function shuffle(ops: Op[], n: number, onProgress: (done: number) => void, yieldFn: () => Promise<void>): Promise<ShuffleOut> {
  const t0 = typeof performance !== 'undefined' ? performance.now() : 0;
  const states = new Set<string>();
  let first = '';
  let ran = 0;
  for (let at = 0; at < n; at += CHUNK) {
    const r = runShuffle({ ops, n: Math.min(CHUNK, n - at), seed: SHUFFLE_SEED + at }, config.materialize);
    if (!first && r.states[0] !== undefined) first = r.states[0];
    for (const s of r.states) states.add(s);
    ran += r.ran;
    onProgress(ran);
    await yieldFn();
  }
  const ms = (typeof performance !== 'undefined' ? performance.now() : 0) - t0;
  return { ran, ops: ops.length, distinct: states.size, print: fingerprint(first), ms };
}

const twinItem = (s: State): string | undefined => Object.values(s.items).find((it) => it.life === 'twin')?.id;
/** An item one claimant won on both replicas while another claimant lost: the claim-one outcome, as each replica holds it. */
function claimOutcome(p: Pair<State>): { item: string; winner: string; loser: string } | undefined {
  const sa = p.a.state();
  const sb = p.b.state();
  for (const it of Object.values(sa.items)) {
    const other = sb.items[it.id];
    if (!other || it.winners.length !== 1 || it.losers.length === 0) continue;
    if (other.winners.join() === it.winners.join() && other.losers.join() === it.losers.join()) {
      return { item: it.name, winner: displayName(it.winners[0]!), loser: displayName(it.losers[0]!) };
    }
  }
  return undefined;
}

export interface Snapshot {
  cards: Record<Id, CardData>;
  prints: Record<Id, string>;
  linkUp: boolean;
  queued: Record<Id, number>;
  twin?: { a: string | undefined; b: string | undefined };
  claim?: { item: string; winner: string; loser: string };
}

export function snapshot(p: Pair<State>): Snapshot {
  const cards = { a: card(p, 'a'), b: card(p, 'b') };
  const ta = twinItem(p.a.state());
  const tb = twinItem(p.b.state());
  const claim = claimOutcome(p);
  return {
    cards,
    prints: { a: fingerprint(stateOf(p, 'a')), b: fingerprint(stateOf(p, 'b')) },
    linkUp: p.sessions.a.link() !== 'down',
    queued: { a: p.queued('a').length, b: p.queued('b').length },
    ...(ta || tb ? { twin: { a: ta, b: tb } } : {}),
    ...(claim ? { claim } : {}),
  };
}

export interface Prerender {
  /** The seed state, link up: the instrument's opening markup. */
  live: Snapshot;
  /** After Cut link and the lake scene's four offline edits. */
  limbo: Snapshot;
  /** After Restore link, before any tap: the twins. */
  settled: Snapshot;
  /** After Keep on Sari's tent and OK on Budi's stove. */
  fixed: Snapshot;
  /** The shuffle over the fixed state's ops, run in Node when the page was built. */
  shuffle: ShuffleOut;
  /** The fixed replicas' fingerprint, which the shuffle's must equal. */
  fixedPrint: string;
}

/** Real engine states for the page: the same calls the buttons make, with no pacing. */
export async function prerender(): Promise<Prerender> {
  const pair = await newPair(() => 0, true);
  const live = snapshot(pair);
  lakeOffline(pair);
  const limbo = snapshot(pair);
  pair.restore();
  await pair.settle();
  const settled = snapshot(pair);
  await resolveNow(pair);
  const fixed = snapshot(pair);
  if (!fixed.cards.a.fixed || !fixed.cards.b.fixed) throw new Error('prerender: the replicas did not both reach FIXED');
  if (fixed.prints.a !== fixed.prints.b) throw new Error('prerender: the fixed replicas hold different states');
  const out = await shuffle(opsOnScreen(pair), SHUFFLE_N, () => undefined, () => Promise.resolve());
  if (out.distinct !== 1 || out.print !== fixed.prints.a) throw new Error('prerender: the shuffle did not land on the replicas’ state');
  pair.close();
  return { live, limbo, settled, fixed, shuffle: { ...out, ms: 0 }, fixedPrint: fixed.prints.a };
}

// ---------- browser ----------
const group = (n: number): string => n.toLocaleString('en-US');
const frame = (): Promise<void> => new Promise((r) => (typeof requestAnimationFrame === 'function' ? requestAnimationFrame(() => r()) : setTimeout(r, 0)));
const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

export interface Pending {
  act: string;
  id?: string;
  replica?: string;
  who?: string;
}

/** Mount on the instrument root. `pending`: the tap that loaded the engine, replayed once the engine is ready. */
export async function mount(root: HTMLElement, pending?: Pending): Promise<void> {
  const reduce = matchMedia('(prefers-reduced-motion: reduce)');
  const full = (): boolean => !reduce.matches;
  const $ = <T extends Element>(sel: string): T => root.querySelector<T>(sel)!;
  const plates = { a: $<HTMLElement>('[data-replica="a"]'), b: $<HTMLElement>('[data-replica="b"]') };
  const cord = $<HTMLElement>('.lb-cord');
  const linkBtn = $<HTMLButtonElement>('[data-act="link"]');
  const status = $<HTMLElement>('[data-say]');
  const engine = $<HTMLElement>('[data-engine]');
  const shufOut = $<HTMLElement>('[data-shuffle-out]');
  const say = (t: string): void => void (status.textContent = t);
  let pace = 0;
  let pair: Pair<State> | undefined;
  let run = 0;
  let busy = false;
  let done = new Set<CheckId>();
  let sawConflict = false;
  const last: Record<Id, string> = { a: '', b: '' };

  const tick = (k: CheckId, detail: string): void => {
    const li = root.querySelector<HTMLElement>(`[data-check="${k}"]`);
    if (!li) return;
    const d = li.querySelector<HTMLElement>('[data-detail]');
    if (d && d.textContent !== detail) d.textContent = detail;
    if (done.has(k)) return;
    done.add(k);
    li.dataset.done = '';
    if (full()) {
      li.classList.remove('is-new');
      void li.offsetWidth;
      li.classList.add('is-new');
    }
  };
  const untickAll = (): void => {
    done = new Set();
    sawConflict = false;
    root.querySelectorAll<HTMLElement>('[data-check]').forEach((li) => {
      delete li.dataset.done;
      li.classList.remove('is-new');
      const d = li.querySelector<HTMLElement>('[data-detail]');
      if (d) d.textContent = d.dataset.idle ?? '';
    });
    shufOut.textContent = shufOut.dataset.idle ?? '';
    delete shufOut.dataset.tone;
  };

  const paint = (): void => {
    if (!pair) return;
    const s = snapshot(pair);
    for (const id of IDS) {
      const c = s.cards[id];
      const el = plates[id];
      el.dataset.axis = c.axis;
      el.dataset.conflict = c.conflict;
      el.toggleAttribute('data-fixed', c.fixed);
      el.querySelector('.lb-chip')!.textContent = c.chip;
      el.querySelectorAll('.lb-count').forEach((n) => (n.textContent = String(c.waiting.length)));
      el.querySelector('[data-print]')!.textContent = s.prints[id];
      const list = el.querySelector('.lb-list')!;
      if (last[id] !== c.html) {
        last[id] = c.html;
        const had = document.activeElement instanceof HTMLElement && list.contains(document.activeElement) ? document.activeElement : null;
        const again = had ? `[data-act="${had.dataset.act ?? ''}"][data-id="${CSS.escape(had.dataset.id ?? '')}"]` : '';
        list.innerHTML = c.html;
        if (had) (list.querySelector<HTMLElement>(again) ?? linkBtn).focus({ preventScroll: true });
        if (full()) list.querySelectorAll<HTMLElement>('[data-twin]').forEach((t) => t.classList.add('lb-enter'));
      }
      const limbo = el.querySelector('.lb-limbo ol')!;
      const lh = limboList(c);
      if (limbo.innerHTML !== lh) limbo.innerHTML = lh;
    }
    const same = s.prints.a === s.prints.b;
    root.dataset.same = same ? 'yes' : 'no';
    cord.dataset.link = s.linkUp ? 'up' : 'down';
    root.dataset.link = s.linkUp ? 'up' : 'down';
    linkBtn.textContent = s.linkUp ? 'Cut link' : 'Restore link';
    linkBtn.setAttribute('aria-pressed', String(!s.linkUp));

    // The checks: each one reads the snapshot above, never a timeline.
    const fogged = s.cards.a.axis === 'FOGGED' && s.cards.b.axis === 'FOGGED';
    if (fogged) tick('cut', `both chips read “${s.cards.a.chip}” / “${s.cards.b.chip}”`);
    if (!s.linkUp && s.queued.a > 0 && s.queued.b > 0) tick('limbo', `${s.queued.a} + ${s.queued.b} ops in limbo; fingerprints ${s.prints.a} ≠ ${s.prints.b}`);
    if (s.linkUp && s.twin?.a && s.twin.a === s.twin.b) {
      sawConflict = true;
      const it = pair.a.state().items[s.twin.a];
      tick('twin', `“${it?.name ?? s.twin.a}” is a twin on both replicas (rule: resurrect)`);
    }
    if (s.linkUp && s.claim) tick('claim', `${s.claim.item}: ${s.claim.winner} on both replicas; ${s.claim.loser} sees the twin`);
    if (s.cards.a.conflict === 'CONFLICT' || s.cards.b.conflict === 'CONFLICT') sawConflict = true;
    if (sawConflict && s.cards.a.fixed && s.cards.b.fixed && same) tick('fixed', `FIXED on both; both fingerprints ${s.prints.a}`);
  };

  const wisp = (to: Id, ops: Op[]): void => {
    if (!full()) return;
    ops.forEach((o, i) => {
      const w = document.createElement('span');
      w.className = 'lb-wisp';
      w.dataset.to = to;
      w.textContent = o.op;
      w.style.animationDelay = `${i * 140}ms`;
      w.style.top = `calc(50% + ${(i - (ops.length - 1) / 2) * 30}px)`;
      w.addEventListener('animationend', () => w.remove());
      setTimeout(() => w.remove(), 4000 + i * 140);
      cord.appendChild(w);
    });
  };

  const fresh = async (): Promise<number> => {
    const mine = ++run;
    pair?.close();
    pair = undefined;
    const p = await newPair(() => pace);
    if (mine !== run) {
      p.close();
      return mine;
    }
    pair = p;
    for (const id of IDS) {
      p.sessions[id].onCross((ops) => wisp(id, ops));
      (id === 'a' ? p.a : p.b).subscribe(paint);
      p.sessions[id].subscribe(paint);
    }
    last.a = last.b = '';
    untickAll();
    paint();
    return mine;
  };

  const cut = (): void => {
    if (pair && pair.sessions.a.link() !== 'down') pair.cut();
  };
  const restore = async (mine: number): Promise<void> => {
    if (!pair) return;
    const p = pair;
    pace = full() ? 320 : 0;
    p.restore();
    paint();
    say('Link restored. The waiting ops cross over…');
    for (let t = 0; full() && t < 9000 && p.link.pending() > 0; t += 100) await sleep(100);
    if (mine !== run || pair !== p) return;
    await p.settle();
    pace = 0;
    paint();
  };

  /** The lake scene's four offline edits, paced so each one shows. Cuts the link first if it is up, as the app does not. */
  const scene = async (mine: number): Promise<boolean> => {
    if (!pair) return false;
    const p = pair;
    if (p.sessions.a.link() !== 'down') {
      p.cut();
      paint();
      say('Link cut first: the scene is four offline edits.');
      await sleep(full() ? 700 : 0);
    }
    const lines = ['Sari ticks the tent.', 'Budi deletes the tent.', 'Sari claims the last stove.', 'Budi claims it too.'];
    for (let i = 0; i < lakeScript.length; i++) {
      if (mine !== run || pair !== p) return false;
      const step = lakeScript[i]!;
      step.run(step.replica === 'a' ? p.a : p.b);
      say(lines[i]!);
      await sleep(full() ? 750 : 0);
    }
    return mine === run && pair === p;
  };

  const runShuffleHere = async (): Promise<void> => {
    if (!pair || busy) return;
    busy = true;
    const p = pair;
    const btn = root.querySelector<HTMLButtonElement>('[data-act="shuffle"]');
    if (btn) btn.disabled = true;
    const ops = opsOnScreen(p);
    shufOut.dataset.tone = 'busy';
    try {
      const out = await shuffle(
        ops,
        SHUFFLE_N,
        (n) => (shufOut.textContent = `Replaying ${group(ops.length)} ops: ${group(n)} / ${group(SHUFFLE_N)} orderings…`),
        frame,
      );
      if (pair !== p) return;
      const s = snapshot(p);
      const agrees = out.distinct === 1;
      const matches = agrees && s.prints.a === out.print && s.prints.b === out.print;
      shufOut.dataset.tone = agrees ? 'ok' : 'bad';
      shufOut.textContent = agrees
        ? `${group(out.ran)} / ${group(SHUFFLE_N)} orderings → 1 final state, ${out.print}${matches ? ', the state both replicas hold' : s.linkUp ? '' : ' (the replicas reach it once you restore the link)'} · ${group(Math.round(out.ms))} ms on this device`
        : `${group(out.ran)} orderings → ${group(out.distinct)} different final states: a divergence. Please tell us.`;
      if (agrees) tick('shuffle', `${group(out.ran)} orderings of ${group(out.ops)} ops, 1 final state ${out.print}`);
    } finally {
      busy = false;
      if (btn) btn.disabled = false;
    }
  };

  const autoplay = async (): Promise<void> => {
    const mine = await fresh();
    if (mine !== run) return;
    root.dataset.phase = 'playing';
    say('Cutting the link…');
    await sleep(full() ? 800 : 0);
    if (mine !== run) return;
    cut();
    paint();
    if (!(await scene(mine))) return;
    await sleep(full() ? 600 : 0);
    if (mine !== run || !pair) return;
    await restore(mine);
    if (mine !== run || !pair) return;
    say('Two twins came back. Tapping Keep on the tent (Sari) and OK on the stove (Budi)…');
    await sleep(full() ? 2600 : 0);
    if (mine !== run || !pair) return;
    await resolveNow(pair);
    paint();
    await sleep(full() ? 900 : 0);
    if (mine !== run) return;
    say('FIXED on both. Now the shuffle: the same ops, 1,000 random causal orders.');
    await runShuffleHere();
    if (mine !== run) return;
    root.dataset.phase = 'yours';
    say('Done. Press Reset and drive it yourself: cut, edit both cards, restore.');
  };

  const act = async (a: Pending): Promise<void> => {
    if (!pair) return;
    const p = pair;
    const id = (a.replica === 'b' ? 'b' : 'a') as Id;
    const r = id === 'a' ? p.a : p.b;
    const target = a.id ?? '';
    const it = r.state().items[target];
    if (a.act !== 'shuffle') {
      run++; // any tap takes over from a playing timeline
      pace = 0;
      root.dataset.phase = 'yours';
    }
    switch (a.act) {
      case 'link':
        if (p.sessions.a.link() === 'down') {
          const mine = run;
          await restore(mine);
          say('Link restored.');
        } else {
          p.cut();
          say('Link cut. Each replica keeps working on its own: edit both cards, then restore it.');
        }
        break;
      case 'scene': {
        const mine = run;
        if (await scene(mine)) say('Four edits wait in limbo. Press Restore link.');
        break;
      }
      case 'tick':
        if (it) tickItem(r, target, !it.ticked);
        break;
      case 'del':
      case 'drop':
        deleteItem(r, target);
        break;
      case 'claim':
        claimItem(r, target);
        break;
      case 'keep':
        restoreItem(r, target);
        break;
      case 'ok':
        releaseItem(r, target, a.who);
        break;
      case 'shuffle':
        await runShuffleHere();
        return;
      case 'auto':
        void autoplay();
        return;
      case 'reset':
        await fresh();
        say('Reset to the seed list. Both fingerprints match again.');
        return;
    }
    paint();
  };

  root.addEventListener('click', (e) => {
    const el = (e.target as HTMLElement).closest<HTMLElement>('[data-act]');
    if (!el || !root.contains(el)) return;
    const plate = el.closest<HTMLElement>('[data-replica]');
    void act({ act: el.dataset.act ?? '', ...(el.dataset.id ? { id: el.dataset.id } : {}), ...(plate?.dataset.replica ? { replica: plate.dataset.replica } : {}), ...(el.dataset.who ? { who: el.dataset.who } : {}) });
  });

  await fresh();
  root.dataset.engine = 'live';
  engine.textContent = engine.dataset.live ?? 'LIVE IN THIS TAB';
  root.dataset.phase = 'yours';
  if (pending) await act(pending);
  else say('The engine is running in this tab. Cut the link, or press Play the whole path.');
}
