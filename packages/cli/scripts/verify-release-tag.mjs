import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const packageJson = JSON.parse(readFileSync(path.join(packageRoot, 'package.json'), 'utf8'));
const tag = process.env.GITHUB_REF_NAME;
const expected = `v${packageJson.version}`;
if (tag !== expected) {
  console.error(`Release tag mismatch: expected ${expected}, received ${tag ?? 'unset'}.`);
  process.exitCode = 1;
} else {
  console.log(`Release tag verified: ${tag}`);
}
