import { copyFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = path.resolve(packageRoot, '../..');
mkdirSync(path.join(packageRoot, 'dist'), { recursive: true });
copyFileSync(
  path.join(repoRoot, 'asset-release.json'),
  path.join(packageRoot, 'dist/asset-release.json'),
);
