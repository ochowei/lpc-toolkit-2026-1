import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import JSZip from 'jszip';

export async function writeZipBundle(
  zipPath: string,
  files: readonly string[],
  rootDir: string,
): Promise<void> {
  const zip = new JSZip();
  for (const file of files) {
    const rel = path.relative(rootDir, file).split(path.sep).join('/');
    zip.file(rel, readFileSync(file));
  }
  writeFileSync(zipPath, await zip.generateAsync({ type: 'nodebuffer' }));
}
