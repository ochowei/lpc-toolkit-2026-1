import { defineConfig, type Plugin } from 'vite';
import { fileURLToPath } from 'node:url';
import { resolve, sep } from 'node:path';
import { readFile } from 'node:fs/promises';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import JSZip from 'jszip';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const baseDir = resolve(__dirname, '../../assets/spritesheets');

function localSpritesheetsPlugin(): Plugin {
  const zipPromises = new Map<string, Promise<JSZip>>();

  async function readSprite(pathname: string, filePath: string): Promise<Buffer> {
    try {
      return await readFile(filePath);
    } catch {
      const relativePath = pathname.slice('/spritesheets/'.length);
      const [category, ...pathParts] = relativePath.split('/');
      const zipEntryPath = pathParts.join('/');
      if (!category || !zipEntryPath) {
        throw new Error(`Invalid spritesheet path: ${pathname}`);
      }

      let zipPromise = zipPromises.get(category);
      if (!zipPromise) {
        const zipPath = resolve(__dirname, 'public/zips', `${category}.zip`);
        zipPromise = readFile(zipPath).then((buffer) => JSZip.loadAsync(buffer));
        zipPromises.set(category, zipPromise);
      }

      const zip = await zipPromise;
      const entry = zip.file(zipEntryPath);
      if (!entry) {
        throw new Error(
          `Spritesheet ${zipEntryPath} is missing from ${category}.zip`,
        );
      }
      return entry.async('nodebuffer');
    }
  }

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
            const contents = await readSprite(pathname, filePath);
            res.setHeader('Content-Type', 'image/png');
            res.setHeader('Content-Length', contents.byteLength);
            res.end(contents);
            return;
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
