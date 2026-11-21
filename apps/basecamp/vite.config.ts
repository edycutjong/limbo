import { defineConfig } from 'vite';

// Static single-page build into dist/. No server code ships.
export default defineConfig({
  base: './',
  build: { outDir: 'dist', emptyOutDir: true },
  server: { port: 5174, strictPort: true },
  preview: { port: 5174, strictPort: true },
});
