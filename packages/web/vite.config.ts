import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// `server.fs.allow` must reach the repo root so `import.meta.glob` can read
// the read-only `upstream/` submodule (two levels up from packages/web).
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: { fs: { allow: ['../..'] } },
});
