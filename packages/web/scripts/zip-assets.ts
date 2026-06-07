import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import JSZip from 'jszip';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '../../..');
const srcDir = path.join(repoRoot, 'assets/spritesheets');
const destDir = path.join(here, '../public/zips');

if (!existsSync(srcDir)) {
  console.error('[zip-assets] assets/spritesheets not found.');
  process.exit(1);
}

mkdirSync(destDir, { recursive: true });

function walkFiles(dir: string, base = dir): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...walkFiles(full, base));
    } else if (entry.isFile()) {
      files.push(full);
    }
  }
  return files;
}

const categories = readdirSync(srcDir, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name);

console.log(`[zip-assets] Packaging ${categories.length} categories to public/zips/...`);

for (const cat of categories) {
  const catDir = path.join(srcDir, cat);
  const zip = new JSZip();
  const files = walkFiles(catDir);

  for (const f of files) {
    const relPath = path.relative(catDir, f).split(path.sep).join('/');
    zip.file(relPath, readFileSync(f));
  }

  const content = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
  const outFile = path.join(destDir, `${cat}.zip`);
  writeFileSync(outFile, content);
  console.log(`  - wrote ${cat}.zip (~${(content.length / 1e6).toFixed(2)} MB)`);
}

console.log('[zip-assets] Done!');
