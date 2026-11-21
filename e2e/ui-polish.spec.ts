import { test as base, expect, type Page } from '@playwright/test';

// ui-polish (design section 11): layout checks (a) to (f), a solo-page trial click, and the focus-ring size check.
// Run once per app by the `ui-polish-basecamp` and `ui-polish-aftershock` projects, at a phone and a desktop viewport.

type App = 'basecamp' | 'aftershock';
const test = base.extend<{ app: App }>({
  app: ['basecamp', { option: true }],
});

const VIEWPORTS = [
  { name: 'phone 390', width: 390, height: 800 },
  { name: 'desktop 1280', width: 1280, height: 900 },
] as const;

const INTERACTIVE = 'button, a[href], input, select, textarea, summary, [role="button"]';

interface Debug {
  ready: Promise<void>;
  state(id: 'a' | 'b'): string;
}

async function boot(p: Page, url: string): Promise<void> {
  await p.goto(url);
  await p.evaluate(() => (window as unknown as { limbo: Debug }).limbo.ready);
}

async function runScene(p: Page, app: App): Promise<void> {
  const play = app === 'basecamp' ? 'Play the lake scene' : 'Play the survey scene';
  await p.getByRole('button', { name: 'Cut link' }).click();
  await p.getByRole('button', { name: play }).click();
  await expect(p.getByRole('button', { name: play })).toHaveCount(0);
  // The scripted edits land one at a time; wait for the scene's full queue on both cards (as the existing specs do).
  const waiting = app === 'basecamp' ? '2 WAITING' : '3 WAITING';
  for (const id of ['a', 'b']) await expect(p.locator(`[data-replica="${id}"] .limbo-plate`)).toContainText(waiting, { timeout: 10_000 });
  // AFTERSHOCK shows the note twin inside the opened sector, as in aftershock-offline.spec.ts.
  if (app === 'aftershock') {
    for (const id of ['a', 'b']) await p.locator(`[data-replica="${id}"] [data-sector="C3"]`).click();
  }
  await p.getByRole('button', { name: 'Restore link' }).click();
  const state = (id: 'a' | 'b'): Promise<string> => p.evaluate((i) => (window as unknown as { limbo: Debug }).limbo.state(i), id);
  await expect.poll(async () => (await state('a')) === (await state('b')), { timeout: 20_000 }).toBe(true);
  await expect(p.locator('.limbo-twin').first()).toBeVisible({ timeout: 15_000 });
}

for (const vp of VIEWPORTS) {
  test.describe(vp.name, () => {
    test.use({ viewport: { width: vp.width, height: vp.height } });

    test('(e) Cut link is visible with the Inspector closed', async ({ page }) => {
      test.skip(vp.width !== 390, 'phone check');
      await boot(page, '/');
      const cut = page.getByRole('button', { name: 'Cut link' });
      await expect(cut).toHaveCount(1);
      await cut.scrollIntoViewIfNeeded();
      await expect(cut).toBeVisible();
    });

    test('scene: (a) no overlap, (b) fonts, (c) 44 px targets, (d) no sideways scroll, (f) last control clickable', async ({ page, app }) => {
      await boot(page, '/');
      await runScene(page, app);

      // (a) rows and twins do not overlap; twin parts stay inside the twin.
      const overlaps = await page.evaluate(() => {
        const out: string[] = [];
        const box = (e: Element): DOMRect => e.getBoundingClientRect();
        const inter = (a: DOMRect, b: DOMRect): number =>
          Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left)) * Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
        for (const cardEl of Array.from(document.querySelectorAll('[data-replica]'))) {
          const rows = Array.from(cardEl.querySelectorAll('[data-limbo-row]')).filter((r) => box(r).height > 0);
          for (let i = 0; i < rows.length; i++) {
            for (let j = i + 1; j < rows.length; j++) {
              const x = rows[i]!;
              const y = rows[j]!;
              if (x.contains(y) || y.contains(x)) continue;
              const area = inter(box(x), box(y));
              if (area > 0.5) out.push(`rows ${i}/${j} overlap by ${area.toFixed(1)}px²`);
            }
          }
          for (const tw of Array.from(cardEl.querySelectorAll('.limbo-twin'))) {
            const t = box(tw);
            for (const sel of ['.limbo-twin-ghost', '.limbo-twin-rule', '.limbo-twin-actions', '.limbo-twin-caption']) {
              const part = tw.querySelector(sel);
              if (!part) continue;
              const r = box(part);
              if (r.left < t.left - 0.5 || r.right > t.right + 0.5 || r.top < t.top - 0.5 || r.bottom > t.bottom + 0.5) {
                out.push(`${sel} outside .limbo-twin: ${JSON.stringify(r)} vs ${JSON.stringify(t)}`);
              }
            }
            const ghost = tw.querySelector('.limbo-twin-ghost');
            const rule = tw.querySelector('.limbo-twin-rule');
            const actions = tw.querySelector('.limbo-twin-actions');
            for (const other of [rule, actions]) {
              if (ghost && other && inter(box(ghost), box(other)) > 0.5) out.push('ghost overprints rule or actions');
            }
          }
        }
        return out;
      });
      expect(overlaps, overlaps.join('\n')).toEqual([]);

      // (b) fonts come from the tokens.
      const fonts = await page.evaluate(() => {
        const norm = (s: string): string => s.replace(/["'\s]/g, '');
        const rootStyle = getComputedStyle(document.documentElement);
        return {
          body: norm(getComputedStyle(document.body).fontFamily),
          bodyToken: norm(rootStyle.getPropertyValue('--font-body')),
          h1: norm(getComputedStyle(document.querySelector('h1')!).fontFamily),
          h1Token: norm(rootStyle.getPropertyValue('--font-display')),
        };
      });
      expect(fonts.bodyToken).not.toBe('');
      expect(fonts.body).toBe(fonts.bodyToken);
      expect(fonts.h1Token).not.toBe('');
      expect(fonts.h1).toBe(fonts.h1Token);

      // (c) every visible interactive element, or its label, is at least 44 x 44.
      const small = await page.evaluate((sel) => {
        const out: string[] = [];
        for (const el of Array.from(document.querySelectorAll<HTMLElement>(sel))) {
          if (el.closest('.limbo-sr')) continue;
          const own = el.getBoundingClientRect();
          const cs = getComputedStyle(el);
          if (cs.visibility === 'hidden' || cs.display === 'none') continue;
          const label = el.closest('label');
          const boxes = [own, ...(label ? [label.getBoundingClientRect()] : [])];
          if (boxes.every((b) => b.width === 0 && b.height === 0)) continue;
          if (!boxes.some((b) => b.width >= 43.5 && b.height >= 43.5)) {
            out.push(`${el.tagName.toLowerCase()}.${el.className} "${(el.textContent ?? '').trim().slice(0, 30)}" ${own.width.toFixed(1)}x${own.height.toFixed(1)}`);
          }
        }
        return out;
      }, INTERACTIVE);
      expect(small, small.join('\n')).toEqual([]);

      // (d) no sideways scroll on a phone.
      if (vp.width === 390) {
        const widths = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, inner: window.innerWidth }));
        expect(widths.scroll).toBeLessThanOrEqual(widths.inner);
      }

      // (f) the last visible control is reachable: a trial click fails if another element would receive the pointer.
      await clickLast(page);
    });

    test('solo page (?replicas=1): last control is clickable, no sideways scroll', async ({ page }) => {
      await boot(page, '/?replicas=1');
      await clickLast(page);
      const widths = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, inner: window.innerWidth }));
      expect(widths.scroll).toBeLessThanOrEqual(widths.inner);
    });

    test('focus ring is 3px and does not change the box', async ({ page }) => {
      await boot(page, '/');
      await page.keyboard.press('Tab');
      const info = await page.evaluate(() => {
        const el = document.activeElement as HTMLElement;
        const r = el.getBoundingClientRect();
        const cs = getComputedStyle(el);
        const focused = { w: r.width, h: r.height, x: r.x, y: r.y };
        const outline = { width: cs.outlineWidth, style: cs.outlineStyle };
        el.blur();
        const r2 = el.getBoundingClientRect();
        return { focused, outline, blurred: { w: r2.width, h: r2.height, x: r2.x, y: r2.y }, tag: el.tagName };
      });
      expect(info.tag).not.toBe('BODY');
      expect(info.outline.width).toBe('3px');
      expect(info.outline.style).toBe('solid');
      expect(info.focused).toEqual(info.blurred);
    });
  });
}

async function clickLast(page: Page): Promise<void> {
  const handle = await page.evaluateHandle((sel) => {
    const els = Array.from(document.querySelectorAll<HTMLElement>(sel)).filter((el) => {
      if (el.closest('.limbo-sr')) return false;
      const r = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && !(el as HTMLButtonElement).disabled;
    });
    return els[els.length - 1] ?? null;
  }, INTERACTIVE);
  const el = handle.asElement();
  expect(el, 'a visible interactive element exists').not.toBeNull();
  await el!.scrollIntoViewIfNeeded();
  await el!.click({ trial: true });
}
