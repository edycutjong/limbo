import { act, fireEvent, screen, within } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LINK_CAPTION, ReplicaPair } from './pair-view.tsx';
import { makeStubPair, renderApp } from './test/app.ts';

const css = readFileSync(join(process.cwd(), 'skeleton/src/limbo/tokens.css'), 'utf8');
const names = { a: 'SARI', b: 'DEV' };
const plate = { a: 7, b: 8 };

async function setup(onReset = vi.fn()) {
  const pair = await makeStubPair();
  renderApp(pair, <ReplicaPair pair={pair} names={names} plate={plate} onReset={onReset} />);
  return { pair, onReset };
}

describe('ReplicaPair', () => {
  it('lever follows view(a).link and calls cut/restore only', async () => {
    const { pair } = await setup();
    const cut = vi.spyOn(pair, 'cut');
    const restore = vi.spyOn(pair, 'restore');
    expect(pair.view('a').link).toBe('up');
    fireEvent.click(screen.getByRole('button', { name: 'Cut link' }));
    expect(cut).toHaveBeenCalledTimes(1);
    expect(restore).not.toHaveBeenCalled();
    expect(pair.view('a').link).toBe('down');
    expect(document.querySelector('[data-cord]')?.getAttribute('data-cord')).toBe('severed');
    fireEvent.click(screen.getByRole('button', { name: 'Restore link' }));
    expect(restore).toHaveBeenCalledTimes(1);
    expect(cut).toHaveBeenCalledTimes(1);
    expect(document.querySelector('[data-cord]')?.getAttribute('data-cord')).toBe('intact');
    await act(async () => void (await pair.settle()));
    pair.close();
  });

  it('fogs both cards while cut and clears them after restore', async () => {
    const { pair } = await setup();
    act(() => pair.cut());
    const fogs = Array.from(document.querySelectorAll('[data-fog]'));
    expect(fogs).toHaveLength(2);
    expect(fogs.map((f) => f.getAttribute('data-fog'))).toEqual(['full', 'full']);
    act(() => pair.restore());
    await act(async () => void (await pair.settle()));
    expect(Array.from(document.querySelectorAll('[data-fog]')).map((f) => f.getAttribute('data-fog'))).toEqual(['none', 'none']);
    pair.close();
  });

  it('shows the exact caption, imprints and plate captions', async () => {
    const { pair } = await setup();
    expect(LINK_CAPTION).toBe('SIMULATED LINK — DevTools offline does not cut it; use the lever');
    expect(screen.getByText(LINK_CAPTION)).toBeTruthy();
    expect(screen.getByText('REPLICA A — SARI')).toBeTruthy();
    expect(screen.getByText('REPLICA B — DEV')).toBeTruthy();
    act(() => pair.cut());
    act(() => void pair.a.local('note.add', 'n1', {}));
    expect(screen.getByText('PLATE 7 · 1 WAITING')).toBeTruthy();
    pair.close();
  });

  it('Reset demo calls onReset and nothing else', async () => {
    const { pair, onReset } = await setup();
    const cut = vi.spyOn(pair, 'cut');
    const restore = vi.spyOn(pair, 'restore');
    fireEvent.click(screen.getByRole('button', { name: 'Reset demo' }));
    expect(onReset).toHaveBeenCalledTimes(1);
    expect(cut).not.toHaveBeenCalled();
    expect(restore).not.toHaveBeenCalled();
    expect(pair.view('a').link).toBe('up');
    pair.close();
  });

  it('each card has exactly one aria-live="polite" region', async () => {
    const { pair } = await setup();
    const cards = document.querySelectorAll<HTMLElement>('[data-replica]');
    expect(cards).toHaveLength(2);
    for (const c of Array.from(cards)) expect(within(c).getAllByText('', { selector: '[aria-live="polite"]' })).toHaveLength(1);
    expect(document.querySelectorAll('[aria-live="polite"]')).toHaveLength(2);
    act(() => pair.cut());
    const regions = document.querySelectorAll('[aria-live="polite"]');
    expect(regions[0]?.textContent).toBe('Link cut. Edits will wait on this device.');
    pair.close();
  });

  it('stylesheet has the breakpoints and 44 px hit areas', () => {
    expect(css).toContain('min-width: 1024px');
    expect(css).toContain('max-width: 1023px');
    expect(css).toContain('min-width: 640px');
    expect(css).toMatch(/\.limbo-lever\s*{[^}]*min-width: 44px[^}]*min-height: 44px/);
    expect(css).toMatch(/\.limbo-reset\s*{[^}]*min-width: 44px[^}]*min-height: 44px/);
    expect(css).toMatch(/\.limbo-button\s*{[^}]*min-height: 44px/);
  });

  describe('without a location', () => {
    afterEach(() => vi.unstubAllGlobals());

    it('uses the width rule when the page has no location and no search is given', async () => {
      vi.stubGlobal('location', undefined);
      const pair = await makeStubPair();
      renderApp(pair, <ReplicaPair pair={pair} names={names} plate={plate} onReset={vi.fn()} />);
      expect(document.querySelectorAll('[data-replica]')).toHaveLength(2);
      expect(screen.getByRole('button', { name: 'Reset demo' })).toBeTruthy();
      pair.close();
    });
  });
});
