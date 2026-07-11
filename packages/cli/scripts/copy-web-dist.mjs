import { cpSync, readdirSync, rmSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const source = path.resolve(scriptDir, '../../web/dist-embedded');
const destination = path.resolve(scriptDir, '../dist/web');

const sourceEntries = new Set(readdirSync(source));

if (!sourceEntries.has('index.html')) {
  throw new Error('embedded Web build is missing index.html');
}

for (const forbidden of ['zips', 'spritesheets']) {
  if (sourceEntries.has(forbidden)) {
    throw new Error(`embedded Web build unexpectedly contains ${forbidden}/`);
  }
}

rmSync(destination, { recursive: true, force: true });
cpSync(source, destination, { recursive: true });
