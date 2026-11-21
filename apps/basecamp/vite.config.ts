import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';
import { shellOptions } from '../pwa-options.ts';

// Static single-page build into dist/. No server code ships.
export default defineConfig({
  base: './',
  plugins: [VitePWA(shellOptions({ name: 'BASECAMP', description: 'A group trip list that keeps working offline.' }))],
  build: { outDir: 'dist', emptyOutDir: true },
  server: { port: 5174, strictPort: true },
  preview: { port: 5174, strictPort: true },
});
