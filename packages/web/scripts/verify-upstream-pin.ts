import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { verifyUpstreamPin } from './upstream-pin';

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../..',
);
const result = verifyUpstreamPin({ repoRoot });
console.log(
  `[verify-upstream-pin] ${result.fixtureFileCount} fixture files and all source pins match ${result.sourceSha}`,
);
