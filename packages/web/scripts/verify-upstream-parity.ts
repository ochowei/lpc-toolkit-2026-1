import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  type AssetManifest,
  loadMaterializedManifest,
  loadReleaseConfig,
  verifyUpstreamParity,
} from './asset-release';
import { requireIsolatedParityDir } from './parity-source';

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../..',
);
const config = loadReleaseConfig(repoRoot);

let manifest: AssetManifest;
try {
  manifest = loadMaterializedManifest(repoRoot, config);
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  if (message.includes('asset manifest sourceSha mismatch')) {
    throw new Error(
      `Parity baseline mismatch: materialized asset manifest does not match config sourceSha ${config.sourceSha}. Run pnpm --filter @lpc-toolkit/web exec tsx scripts/prepare-assets.ts.`,
    );
  }
  throw new Error(
    `Unable to read materialized asset manifest. Run pnpm --filter @lpc-toolkit/web exec tsx scripts/prepare-assets.ts before parity checks. ${message}`,
  );
}

const parityDir = requireIsolatedParityDir(repoRoot);
let upstreamHead: string;

try {
  upstreamHead = execFileSync(
    'git',
    ['-C', parityDir, 'rev-parse', 'HEAD'],
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
  ).trim();
} catch (error) {
  const detail = error instanceof Error ? `: ${error.message}` : '';
  throw new Error(
    `Failed to read upstream HEAD from LPC_UPSTREAM_PARITY_DIR parityDir ${parityDir}${detail}. Expected ${config.sourceSha}.`,
  );
}

verifyUpstreamParity({ config, manifest, upstreamHead });
console.log(
  `[verify-upstream-parity] upstream HEAD matches ${config.sourceSha}`,
);
