// The landing hero: BASECAMP's real ops on the LIMBO skeleton, two replicas in this page joined by the
// in-page simulated link (createPair). The store is in memory, so every reload starts from the seed.
// Every visual reads a real sync value: fog = view.axis, the waiting count = pair.queued(), twins =
// describeConflicts(state), wisps = ops applied by the receiving session (onCross), FIXED = view.fixed.
// Built by `pnpm site:hero` into site/assets/hero.js; `prerender()` writes the no-JS markup.
import { createPair, type Pair, type PairView } from '../../skeleton/src/sync/pair.ts';
import type { OpStore, Meta } from '../../skeleton/src/sync/store.ts';
import type { Op } from '../../skeleton/src/core/types.ts';
import * as config from '../../apps/basecamp/app.config.ts';
import { claimItem, deleteItem, releaseItem, restoreItem, tickItem } from '../../apps/basecamp/src/actions.ts';
import { displayName, memberOfReplica } from '../../apps/basecamp/src/members.ts';
import type { Item, State } from '../../apps/basecamp/src/model.ts';
import { lakeScript } from '../../apps/basecamp/src/scene.ts';

type Id = 'a' | 'b';
const IDS: readonly Id[] = ['a', 'b'];
const ROWS = 4; // rows shown per card; the full list lives in the app

/** OpStore in memory: same contract as openStore, no IndexedDB. */
export function memoryStore(): OpStore {
  const ops = new Map<string, Op>();
  let meta: Meta = {};
  const subs = new Set<() => void>();
  return {
    ready: Promise.resolve(),
    put(op) {
      if (!ops.has(op.id)) {
        ops.set(op.id, op);
        subs.forEach((fn) => fn());
      }
      return Promise.resolve();
    },
    all: () => [...ops.values()],
    meta: {
      read: () => ({ ...meta }),
      write(patch) {
        meta = { ...meta, ...patch };
        return Promise.resolve();
      },
    },
    onChange(cb) {
      subs.add(cb);
      return () => void subs.delete(cb);
    },
    close: () => subs.clear(),
  };
}

/** `manual`: the link never pumps on its own (prerender steps it message by message). */
export function newPair(pace: () => number = () => 0, manual = false): Promise<Pair<State>> {
  return createPair<State>({
    app: config.name,
    defs: config.defs,
    materialize: config.materialize,
    twinCount: config.twinCount,
    seedOps: config.seedOps,
    store: () => memoryStore(),
    schedule: manual ? () => undefined : (fn, delay) => void setTimeout(fn, delay + pace()),
  });
}

const esc = (s: string): string =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
const who = (member: string): string => esc(displayName(member));
const replicaName = (id: string): string => who(memberOfReplica(id) ?? id);
const mergeOf = (op: string): string => config.defs.find((d) => d.name === op)?.merge ?? 'unknown';
const verb: Record<string, string> = { tick: 'ticked it', rename: 'renamed it', claim: 'claimed it', restore: 'kept it', add: 'added it' };

function row(id: Id, it: Item): string {
  const me = memberOfReplica(id) ?? id;
  const claimed = it.winners.length > 0;
  const mine = it.winners.includes(me);
  const claim = claimed
    ? `<small class="lb-who">${it.winners.map(who).join(', ')} ${it.winners.length === 1 ? 'is' : 'are'} bringing it</small>`
    : '';
  const action =
    it.units === 1 && !claimed && !mine && !it.ticked
      ? `<button type="button" class="lb-act" data-act="claim" data-id="${it.id}">I'll bring it</button>`
      : '';
  return (
    `<li class="lb-row" data-id="${it.id}"${it.ticked ? ' data-ticked' : ''}>` +
    `<button type="button" class="lb-tick" data-act="tick" data-id="${it.id}" aria-pressed="${it.ticked}" aria-label="${it.ticked ? 'Untick' : 'Tick'} ${esc(it.name)}"></button>` +
    `<span class="lb-name">${esc(it.name)}${claim}</span>${action}` +
    `<button type="button" class="lb-del" data-act="del" data-id="${it.id}" aria-label="Delete ${esc(it.name)}" title="Delete">×</button></li>`
  );
}

function twins(id: Id, it: Item, s: State): string {
  const me = memberOfReplica(id) ?? id;
  let out = '';
  if (it.life === 'twin' && it.lifeInfo) {
    const del = it.lifeInfo.deletedBy.map(replicaName).join(' and ');
    const ed = it.lifeInfo.editedBy.map((e) => `${replicaName(e.by)} ${verb[e.kind] ?? 'edited it'}`).join(', ');
    out +=
      `<li class="lb-twin" data-twin="${it.id}:life"><span class="lb-ghost" aria-hidden="true">${esc(it.name)}</span>` +
      `<p class="lb-cap"><b>Twin</b> · ${del} deleted this while ${ed} · rule: <code>resurrect</code></p>` +
      `<p class="lb-btns"><button type="button" data-act="keep" data-id="${it.id}">Keep</button>` +
      `<button type="button" data-act="drop" data-id="${it.id}">Delete</button></p></li>`;
  }
  for (const loser of it.losers) {
    const winner = it.winners.map(who).join(', ');
    out +=
      loser === me
        ? `<li class="lb-twin" data-twin="${it.id}:claim:${loser}"><span class="lb-ghost" aria-hidden="true">${esc(it.name)}</span>` +
          `<p class="lb-cap"><b>Twin</b> · ${who(loser)} and ${winner} both claimed this · rule: <code>claim-one</code> picked ${winner} on both replicas (lower Lamport stamp, then replica id)</p>` +
          `<p class="lb-btns"><button type="button" data-act="ok" data-id="${it.id}" data-who="${esc(loser)}">OK</button></p></li>`
        : `<li class="lb-note" data-twin="${it.id}:claim:${loser}">${who(loser)}'s claim lost · rule: <code>claim-one</code></li>`;
  }
  for (const c of config.describeConflicts(s)) {
    if (c.target === it.id && c.rule === 'causal-lww') {
      out += `<li class="lb-note" data-twin="${esc(c.id)}">Twin · ${esc(c.caption)} · rule: <code>causal-lww</code></li>`;
    }
  }
  return out;
}

export interface CardData {
  axis: string;
  conflict: string;
  chip: string;
  fixed: boolean;
  waiting: { name: string; target: string; merge: string; l: number }[];
  html: string;
}

export function card(pair: Pair<State>, id: Id): CardData {
  const s = (id === 'a' ? pair.a : pair.b).state();
  const v: PairView = pair.view(id);
  const order = s.order.slice(0, ROWS);
  // An item whose twin is open stays on the card even if it sits lower in the list.
  for (const it of Object.values(s.items)) if (it.life === 'twin' && !order.includes(it.id)) order.unshift(it.id);
  const html = order.map((k) => row(id, s.items[k]!) + twins(id, s.items[k]!, s)).join('');
  const waiting = pair.queued(id).map((o) => ({ name: o.op, target: o.target, merge: mergeOf(o.op), l: o.stamp.l }));
  return { axis: v.axis, conflict: v.conflict, chip: v.chip, fixed: v.fixed, waiting, html };
}

export function limboList(c: CardData): string {
  if (c.waiting.length === 0) return '<li class="lb-empty">nothing waiting</li>';
  const shown = c.waiting.slice(0, 4).map((w) => `<li><span>${esc(w.name)}</span> ${esc(w.target)} · <code>${esc(w.merge)}</code> · l${w.l}</li>`);
  if (c.waiting.length > 4) shown.push(`<li>+${c.waiting.length - 4} more</li>`);
  return shown.join('');
}

/** The lake scene's partition half, with no pacing: cut, then the four offline edits. */
export function lakeOffline(pair: Pair<State>): void {
  pair.cut();
  for (const step of lakeScript) step.run(step.replica === 'a' ? pair.a : pair.b);
}

/** The whole lake scene with no pacing: offline edits, restore, settle. */
export async function lakeNow(pair: Pair<State>): Promise<void> {
  lakeOffline(pair);
  pair.restore();
  await pair.settle();
}

/** Tap Keep on Sari's tent twin and OK on Budi's lost claim, then settle. */
export async function resolveNow(pair: Pair<State>): Promise<void> {
  restoreItem(pair.a, 'tent');
  releaseItem(pair.b, 'stove', 'budi');
  await pair.settle();
}

export interface Prerender {
  opening: Record<Id, CardData>;
  settled: Record<Id, CardData>;
  live: CardData;
  developing: CardData;
  fixed: CardData;
}

/** Real engine states for the markup: the page opens in limbo (link cut, edits waiting); the states strip and the
 *  deck show the rest. Developing is caught by stepping the link one message at a time. */
export async function prerender(): Promise<Prerender> {
  const pair = await newPair(() => 0, true);
  const live = card(pair, 'a');
  lakeOffline(pair);
  const opening = { a: card(pair, 'a'), b: card(pair, 'b') };
  pair.restore();
  let developing: CardData | undefined;
  for (let i = 0; i < 200 && !developing && pair.link.pump(); i++) {
    const c = card(pair, 'a');
    if (c.axis === 'DEVELOPING') developing = c;
  }
  await pair.settle();
  const settled = { a: card(pair, 'a'), b: card(pair, 'b') };
  await resolveNow(pair);
  const fixed = card(pair, 'a');
  pair.close();
  if (!developing) throw new Error('prerender: never saw DEVELOPING');
  return { opening, settled, live, developing, fixed };
}

// ---------- browser ----------
const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

export function mount(root: HTMLElement): void {
  const reduce = matchMedia('(prefers-reduced-motion: reduce)');
  const full = (): boolean => !reduce.matches;
  let pace = 0;
  let pair: Pair<State> | undefined;
  let run = 0; // bumps on reset/user takeover; a stale timeline stops
  let seen = new Set<string>();
  let quiet = false; // true while the engine catches up with the prerendered markup: no wisps, no entrances
  const last: Record<Id, string> = { a: '', b: '' };
  const $ = <T extends Element>(sel: string): T => root.querySelector<T>(sel)!;
  const plates = { a: $<HTMLElement>('[data-replica="a"]'), b: $<HTMLElement>('[data-replica="b"]') };
  const cord = $<HTMLElement>('.lb-cord');
  const linkBtn = $<HTMLButtonElement>('[data-act="link"]');
  const status = root.querySelector<HTMLElement>('.lb-status');
  const say = (t: string): void => {
    if (status) status.textContent = t;
  };

  const paint = (): void => {
    if (!pair) return;
    const p = pair;
    for (const id of IDS) {
      const c = card(p, id);
      const el = plates[id];
      el.dataset.axis = c.axis;
      el.dataset.conflict = c.conflict;
      el.toggleAttribute('data-fixed', c.fixed);
      el.querySelector('.lb-chip')!.textContent = c.chip;
      el.querySelectorAll('.lb-count').forEach((n) => (n.textContent = String(c.waiting.length)));
      const list = el.querySelector('.lb-list')!;
      if (last[id] !== c.html) {
        last[id] = c.html;
        list.innerHTML = c.html;
        list.querySelectorAll<HTMLElement>('[data-twin]').forEach((t) => {
          const k = `${id}:${t.dataset.twin}`;
          if (!seen.has(k) && !quiet) t.classList.add('lb-enter');
          seen.add(k);
        });
      }
      const limbo = el.querySelector('.lb-limbo ol')!;
      const lh = limboList(c);
      if (limbo.innerHTML !== lh) limbo.innerHTML = lh;
    }
    const up = p.sessions.a.link() !== 'down';
    cord.dataset.link = up ? 'up' : 'down';
    root.dataset.link = up ? 'up' : 'down';
    linkBtn.textContent = up ? 'Cut link' : 'Restore link';
    linkBtn.setAttribute('aria-pressed', String(!up));
  };

  const wisp = (to: Id, ops: Op[]): void => {
    if (!full() || quiet) return;
    ops.forEach((o, i) => {
      const w = document.createElement('span');
      w.className = 'lb-wisp';
      w.dataset.to = to;
      w.textContent = o.op;
      w.style.animationDelay = `${i * 140}ms`;
      w.style.top = `calc(50% + ${(i - (ops.length - 1) / 2) * 30}px)`;
      w.addEventListener('animationend', () => w.remove());
      cord.appendChild(w);
    });
  };

  const fresh = async (): Promise<void> => {
    run++;
    pair?.close();
    seen = new Set();
    const p = await newPair(() => pace);
    pair = p;
    for (const id of IDS) {
      p.sessions[id].onCross((ops) => wisp(id, ops));
      (id === 'a' ? p.a : p.b).subscribe(paint);
      p.sessions[id].subscribe(paint);
    }
    paint();
  };

  // Restore the cut link, let the ops cross, then wait for the reader's taps; if nobody taps, settle it and say so.
  const reconnect = async (mine: number): Promise<void> => {
    const p = pair!;
    const live = (): boolean => mine === run;
    pace = full() ? 380 : 0;
    root.dataset.phase = 'playing';
    p.restore();
    paint();
    say('Link restored. The waiting ops cross over…');
    // Let the paced link deliver on its own so each crossing is visible; settle() then flushes what is left.
    for (let t = 0; full() && t < 12000 && p.link.pending() > 0; t += 100) await sleep(100);
    if (!live()) return;
    await p.settle();
    await sleep(full() ? 1400 : 0);
    if (!live()) return;
    pace = 0;
    root.dataset.phase = 'waiting';
    say('Two twins came back. Tap Keep on the tent and OK on the stove.');
    await sleep(full() ? 6500 : 0);
    if (!live() || !full()) return;
    root.dataset.phase = 'playing';
    say('Nobody tapped, so we did: Sari keeps the tent, Budi accepts that Sari brings the stove.');
    await resolveNow(p);
    paint();
    await sleep(2600);
    if (!live()) return;
    root.dataset.phase = 'yours';
    say('Fixed: both replicas agree. Press Reset, cut the link and try it yourself.');
  };

  const scene = async (): Promise<void> => {
    await fresh();
    const mine = run;
    const p = pair!;
    const live = (): boolean => mine === run;
    root.dataset.phase = 'playing';
    say('Both replicas agree. Cutting the link…');
    await sleep(full() ? 1100 : 0);
    if (!live()) return;
    p.cut();
    paint();
    say('Link cut. Each phone keeps working on its own.');
    const lines = ['Sari ticks the tent.', 'Budi deletes the tent.', 'Sari claims the last stove.', 'Budi claims it too.'];
    for (let i = 0; i < lakeScript.length; i++) {
      await sleep(full() ? 1000 : 0);
      if (!live()) return;
      const step = lakeScript[i]!;
      step.run(step.replica === 'a' ? p.a : p.b);
      say(lines[i]!);
    }
    await sleep(full() ? 1200 : 0);
    if (!live()) return;
    await reconnect(mine);
  };

  const act = (el: HTMLElement): void => {
    if (!pair) return;
    const p = pair;
    const plate = el.closest<HTMLElement>('[data-replica]');
    const id = (plate?.dataset.replica ?? 'a') as Id;
    const r = id === 'a' ? p.a : p.b;
    const target = el.dataset.id ?? '';
    const it = r.state().items[target];
    // Any tap means the reader took over: stop the scripted timeline (autoplay, the scene, the auto-resolve).
    run++;
    pace = 0;
    root.dataset.phase = 'yours';
    switch (el.dataset.act) {
      case 'link':
        if (p.sessions.a.link() === 'down') {
          p.restore();
          say('Link restored.');
        } else {
          p.cut();
          say('Link cut. Edit both cards, then restore it.');
        }
        break;
      case 'tick':
        if (it) tickItem(r, target, !it.ticked);
        break;
      case 'del':
        deleteItem(r, target);
        break;
      case 'claim':
        claimItem(r, target);
        break;
      case 'keep':
        restoreItem(r, target);
        break;
      case 'drop':
        deleteItem(r, target);
        break;
      case 'ok':
        releaseItem(r, target, el.dataset.who);
        break;
      case 'scene':
        void scene();
        return;
      case 'reset':
        void fresh().then(() => {
          root.dataset.phase = 'yours';
          say('Reset to the seed list. Cut the link and edit both cards.');
        });
        return;
    }
    paint();
  };

  root.addEventListener('click', (e) => {
    const el = (e.target as HTMLElement).closest<HTMLElement>('[data-act]');
    if (el && root.contains(el)) act(el);
  });

  // First paint: reach the same state the markup shows, so the page and the engine agree.
  void (async () => {
    quiet = true;
    await fresh();
    lakeOffline(pair!);
    paint();
    quiet = false;
    root.dataset.phase = 'yours';
    root.dataset.ready = '';
    if (!full()) return;
    const io = new IntersectionObserver(
      (es) => {
        if (es.some((x) => x.isIntersecting)) {
          io.disconnect();
          const mine = run;
          setTimeout(() => {
            if (mine === run) void reconnect(mine);
          }, 1600);
        }
      },
      { threshold: 0.35 },
    );
    io.observe(root);
  })();
}

if (typeof document !== 'undefined') {
  const root = document.querySelector<HTMLElement>('[data-hero]');
  if (root) mount(root);
}
