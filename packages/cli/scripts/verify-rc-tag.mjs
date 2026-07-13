import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const packageJson = JSON.parse(
  readFileSync(path.join(packageRoot, 'package.json'), 'utf8'),
);
const tag = process.env.GITHUB_REF_NAME;
const match =
  /^v((?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)(?:-(?:0|[1-9]\d*|[0-9A-Za-z-]*[A-Za-z-][0-9A-Za-z-]*)(?:\.(?:0|[1-9]\d*|[0-9A-Za-z-]*[A-Za-z-][0-9A-Za-z-]*))*)?)-rc\.(0|[1-9]\d*)$/u.exec(
    tag ?? '',
  );

if (!match) {
  console.error(
    `RC tag must match vX.Y.Z[-prerelease]-rc.N without leading zeroes; received ${tag ?? 'unset'}.`,
  );
  process.exitCode = 1;
} else {
  const baseVersion = match[1];
  if (baseVersion !== packageJson.version) {
    console.error(
      `RC tag base mismatch: expected ${packageJson.version}, received ${baseVersion}.`,
    );
    process.exitCode = 1;
  } else {
    console.log(`RC tag verified: ${tag} targets ${baseVersion}.`);
  }
}
