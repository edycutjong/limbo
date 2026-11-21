import { act } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { FixedStamp, Fog, StatusChip, Wisps } from './marks.tsx';
import { Twin } from './twin.tsx';
import { makeStubPair, renderApp } from './test/app.ts';
import { setMedia } from './test/setup.ts';

type P = Awaited<ReturnType<typeof makeStubPair>>;
const sync = (pair: P) => act(async () => void (await pair.settle()));
const ANIM = /limbo-(drain|lift|twin-enter|twin-leaving)|wisp-cross/;

function ui(pair: P) {
  return (
    <>
      <Fog id="a">
        <p>content</p>
      </Fog>
      <Wisps id="a" plate="A" />
      <StatusChip id="a" />
      <FixedStamp id="a" />
      <Twin replica="a" id="n1:claim:bob" atRest={<span>ann</span>} ghost={<span>bob</span>} caption="bob also claimed" rule="claim-one" actions={<button>Keep</button>} />
    </>
  );
}

/** cut, add 3, claim conflict on both sides, restore: records the DOM at each step. */
async function scenario(reduce: boolean) {
  setMedia({ reduce });
  const pair = await makeStubPair();
  const { container } = renderApp(pair, ui(pair));
  act(() => void pair.a.local('note.add', 'n1', {}));
  await sync(pair);
  act(() => pair.cut());
  act(() => {
    pair.a.local('note.claim', 'n1', { who: 'ann' });
    pair.b.local('note.claim', 'n1', { who: 'bob' });
    pair.a.local('note.add', 'n2', {});
  });
  const cut = container.innerHTML;
  act(() => pair.restore());
  await sync(pair);
  const live = container.innerHTML;
  act(() => void pair.a.local('note.delete', 'n1', {}));
  await sync(pair);
  const fixed = container.innerHTML;
  const out = { container, cut, live, fixed };
  return { out, pair };
}

describe('motion: full', () => {
  it('adds drain on cut, lift on LIVE, stagger, twin enter and FIXED scale-in', async () => {
    const { out, pair } = await scenario(false);
    expect(out.container.querySelector('[data-motion="full"]')).not.toBeNull();
    expect(out.cut).toContain('limbo-drain');
    expect(out.live).toContain('limbo-lift');
    expect(out.live).toContain('limbo-twin-enter');
    expect(out.fixed).toContain('data-enter="true"');
    pair.close();
  });

  it('crossing wisps carry --i stagger values', async () => {
    setMedia({ reduce: false });
    const pair = await makeStubPair();
    const { container } = renderApp(pair, <Wisps id="a" plate="A" />);
    act(() => pair.cut());
    act(() => void pair.b.local('note.add', 'n1', {}));
    act(() => void pair.b.local('note.add', 'n2', {}));
    act(() => pair.restore());
    await sync(pair);
    const w = Array.from(container.querySelectorAll<HTMLElement>('.wisp-cross'));
    expect(w.length).toBe(2);
    expect(w.map((e) => e.style.getPropertyValue('--i'))).toEqual(['0', '1']);
    pair.close();
  });
});

describe('motion: reduced', () => {
  it('has no animation classes or inline animation styles and keeps every label and number', async () => {
    const { out, pair } = await scenario(true);
    expect(out.container.querySelector('[data-motion="reduced"]')).not.toBeNull();
    for (const html of [out.cut, out.live, out.fixed]) {
      expect(html).not.toMatch(ANIM);
      expect(html).not.toMatch(/animation/);
    }
    expect(out.cut).toContain('Offline');
    expect(out.cut).toContain('WAITING');
    expect(out.live).toContain('TWIN');
    expect(out.live).toContain('Decided by: claim-one');
    expect(out.fixed).toContain('FIXED');
    expect(out.container.querySelector('.wisp-cross')).toBeNull();
    pair.close();
  });

  it('keeps the counter with no crossing wisps', async () => {
    setMedia({ reduce: true });
    const pair = await makeStubPair();
    const { container } = renderApp(pair, <Wisps id="a" plate="A" />);
    act(() => pair.cut());
    act(() => void pair.a.local('note.add', 'n1', {}));
    expect(container.querySelector('.wisp-count')!.textContent).toBe('1');
    expect(container.querySelector('.wisp')).toBeNull();
    pair.close();
  });
});

describe('tokens.css motion', () => {
  const css = readFileSync(join(process.cwd(), 'skeleton/src/limbo/tokens.css'), 'utf8');
  it('has the reduced-motion rule and the durations', () => {
    expect(css).toMatch(/@media \(prefers-reduced-motion: reduce\)/);
    for (const d of ['600ms', '900ms', '250ms', '2s']) expect(css).toContain(d);
    const cross = /\.wisp-cross \{[^}]*animation: limbo-cross (\d+)ms/.exec(css);
    expect(Number(cross?.[1])).toBeGreaterThanOrEqual(400);
    expect(Number(cross?.[1])).toBeLessThanOrEqual(700);
  });
});
