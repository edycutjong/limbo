import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { makeStubPair, renderApp } from './app.ts';
import { media, setMedia } from './setup.ts';

describe('limbo test harness', () => {
  it('renders a trivial component under jsdom', () => {
    render(<p>hello</p>);
    expect(screen.getByText('hello')).toBeTruthy();
  });

  it('stubs matchMedia with a settable reduce flag', () => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    let seen: boolean | undefined;
    mq.addEventListener('change', (e) => (seen = e.matches));
    expect(mq.matches).toBe(false);
    setMedia({ reduce: true });
    expect(mq.matches).toBe(true);
    expect(seen).toBe(true);
    expect(media.reduce).toBe(true);
  });

  it('builds a real pair over the stub app and shows one cut edit as unacked', async () => {
    const pair = await makeStubPair();
    renderApp(pair);
    pair.cut();
    pair.a.local('note.add', 'n1', { text: 'x' });
    expect(pair.view('a').unacked).toBe(1);
    expect(pair.view('a').axis).toBe('FOGGED');
    pair.close();
  });
});
