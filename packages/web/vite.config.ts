import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// `server.fs.allow` must reach the repo root so `import.meta.glob` can read
// the read-only `upstream/` submodule (two levels up from packages/web).
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      // Read core's source directly so dev/build never sees a stale `dist/`.
      '@lpc-toolkit/core': fileURLToPath(
        new URL('../core/src/index.ts', import.meta.url),
      ),
    },
  },
  server: { 
    fs: { allow: ['../..'] },
    proxy: {
      '/upstream-assets': {
        target: 'https://liberatedpixelcup.github.io/Universal-LPC-Spritesheet-Character-Generator',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/upstream-assets/, ''),
      },
    },
  },
});
