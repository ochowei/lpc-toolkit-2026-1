import { defineConfig, type Plugin } from 'vite';
import { fileURLToPath } from 'node:url';
import { resolve, sep } from 'node:path';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const baseDir = resolve(__dirname, '../../assets/spritesheets');

function localSpritesheetsPlugin(): Plugin {
  return {
    name: 'local-spritesheets-plugin',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (req.url && req.url.startsWith('/spritesheets/')) {
          const pathname = req.url.split('?')[0] ?? '';

          if (!pathname.endsWith('.png')) {
            next();
            return;
          }

          const filePath = resolve(__dirname, '../../assets', pathname.slice(1));
          
          if (!filePath.startsWith(baseDir + sep)) {
            next();
            return;
          }

          try {
            const stats = await stat(filePath);
            if (stats.isFile()) {
              res.setHeader('Content-Type', 'image/png');
              const stream = createReadStream(filePath);
              stream.on('error', (err) => {
                if (!res.headersSent) {
                  next(err);
                }
              });
              stream.pipe(res);
              return;
            }
          } catch {
            // File does not exist, pass through to next
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
