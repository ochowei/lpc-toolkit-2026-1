import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  downloadBuffer,
  extractTarGz,
  loadReleaseConfig,
  prepareAssetSnapshot,
} from './asset-release';

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../..',
);
const config = loadReleaseConfig(repoRoot);
const result = await prepareAssetSnapshot({
  repoRoot,
  config,
  download: downloadBuffer,
  extractTarball: extractTarGz,
});

console.log(`[prepare-assets] ${result.status}`);
