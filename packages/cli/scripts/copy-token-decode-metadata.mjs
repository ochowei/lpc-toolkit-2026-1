import assert from 'node:assert/strict';
import { copyFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const distRoot = path.join(packageRoot, 'dist');

copyFileSync(
  path.join(packageRoot, 'token-decode-metadata.snapshot.json'),
  path.join(distRoot, 'token-decode-metadata.json'),
);

const runtimeModule = await import(
  pathToFileURL(path.join(distRoot, 'token-decode-metadata.js')).href
);
const decodeData = runtimeModule.loadBundledTokenDecodeData();
assert.ok(decodeData.catalog.byItemId.size > 0, 'token decode snapshot has no items');
assert.ok(
  decodeData.catalog.byTypeName.get('hair')?.some((item) => item.name === 'Braid'),
  'token decode snapshot is missing hair/Braid',
);
