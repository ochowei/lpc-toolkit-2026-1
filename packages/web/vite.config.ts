import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { existsSync, readFileSync } from 'node:fs';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

const __dirname = fileURLToPath(new URL('.', import.meta.url));

function localSpritesheetsPlugin() {
  return {
    name: 'local-spritesheets-plugin',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (req.url && req.url.startsWith('/spritesheets/')) {
          const pathname = req.url.split('?')[0];
          const filePath = join(__dirname, '../../assets', pathname);
          
          if (existsSync(filePath)) {
            res.setHeader('Content-Type', 'image/png');
            res.end(readFileSync(filePath));
            return;
          }
        }
        next();
      });
    }
  };
}

// `server.fs.allow` must reach the repo root so `import.meta.glob` can read
// the local `assets/` directory (two levels up from packages/web).
export default defineConfig({
  plugins: [react(), tailwindcss(), localSpritesheetsPlugin()],
  resolve: {
    alias: {
      // Read core's source directly so dev/build never sees a stale `dist/`.
      '@lpc-toolkit/core': fileURLToPath(
        new URL('../core/src/index.ts', import.meta.url),
      ),
    },
  },
  server: { fs: { allow: ['../..'] } },
});
