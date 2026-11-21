import type { VitePWAOptions } from 'vite-plugin-pwa';

export const THEME = '#F2EADB';

/** Build-time offline-shell policy shared by both apps. They differ only in name and description. */
export function shellOptions(a: { name: string; description: string }): Partial<VitePWAOptions> {
  return {
    strategies: 'generateSW',
    registerType: 'autoUpdate',
    injectRegister: false,
    devOptions: { enabled: false },
    manifest: {
      name: a.name,
      short_name: a.name,
      description: a.description,
      display: 'standalone',
      start_url: './',
      scope: './',
      id: './',
      theme_color: THEME,
      background_color: THEME,
      icons: [
        { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
        { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
        { src: 'icon.svg', sizes: 'any', type: 'image/svg+xml' },
      ],
    },
    workbox: {
      globPatterns: ['**/*.{html,js,css,woff2,svg,png,webmanifest}'],
      navigateFallback: 'index.html',
      skipWaiting: true,
      clientsClaim: true,
      cleanupOutdatedCaches: true,
    },
  };
}
