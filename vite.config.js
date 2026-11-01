import { defineConfig } from 'vite';

// Relative base keeps the static build portable: dist/ can be served from a
// subfolder or opened through any static host without rewriting asset URLs.
export default defineConfig({
  base: './',
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 900,
  },
});
