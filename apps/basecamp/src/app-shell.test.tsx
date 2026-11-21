import { render, screen } from '@testing-library/react';
import { expect, it } from 'vitest';
import { App } from './main.tsx';

it('renders the h1 and the tagline first', () => {
  render(<App />);
  expect(screen.getByRole('heading', { level: 1 })).toBeTruthy();
  expect(screen.getByText('For people whose shared list breaks when the signal does.')).toBeTruthy();
});
