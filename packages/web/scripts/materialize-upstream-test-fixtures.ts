import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadReleaseConfig } from './asset-release';
import { materializeUpstreamTestFixtures } from './upstream-test-fixtures';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '../../..');
const sourceFlagIndex = process.argv.indexOf('--source');
const sourceValue = sourceFlagIndex >= 0 ? process.argv[sourceFlagIndex + 1] : undefined;
if (!sourceValue) {
  throw new Error('Usage: materialize-upstream-test-fixtures --source <absolute-or-relative-path>');
}

const sourceRoot = path.resolve(sourceValue);
const config = loadReleaseConfig(repoRoot);
const sourceHead = execFileSync('git', ['-C', sourceRoot, 'rev-parse', 'HEAD'], {
  encoding: 'utf8',
  stdio: ['ignore', 'pipe', 'pipe'],
}).trim();
if (sourceHead !== config.sourceSha) {
  throw new Error(
    `Fixture source HEAD mismatch: expected ${config.sourceSha}, actual ${sourceHead}`,
  );
}

const fixtureRoot = path.join(
  repoRoot,
  'packages/core/test/fixtures/upstream-pixels',
);
const provenance = materializeUpstreamTestFixtures({
  sourceRoot,
  fixtureRoot,
  sourceRepository: config.sourceRepository,
  sourceSha: config.sourceSha,
});
console.log(
  `[materialize-upstream-test-fixtures] wrote ${provenance.files.length} attributed PNG fixtures from ${provenance.sourceSha}`,
);
