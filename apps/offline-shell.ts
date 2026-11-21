export interface ShellEnv {
  prod: boolean;
  nav?: { serviceWorker?: { register(url: string, options?: { scope?: string }): Promise<unknown> } };
  warn?(msg: string, e: unknown): void;
}

/** Register `./sw.js` in production only. Never throws. */
export async function registerShell(env: ShellEnv): Promise<void> {
  if (!env.prod) return;
  const sw = env.nav?.serviceWorker;
  if (!sw) return;
  try {
    await sw.register('./sw.js', { scope: './' });
  } catch (e) {
    (env.warn ?? ((m, x) => console.warn(m, x)))('Offline shell: service worker registration failed', e);
  }
}
