import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';
import { shellOptions } from '../pwa-options.ts';

// Static single-page build into dist/. No server code ships.
export default defineConfig({
  base: './',
  plugins: [VitePWA(shellOptions({ name: 'AFTERSHOCK', description: 'A field form whose sector reports merge into a shared grid. Demo data only.' }))],
  build: { outDir: 'dist', emptyOutDir: true },
  server: { port: 5176, strictPort: true },
  preview: { port: 5176, strictPort: true },
});
