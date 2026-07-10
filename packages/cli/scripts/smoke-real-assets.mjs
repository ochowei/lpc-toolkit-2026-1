import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const cliPath = path.join(packageRoot, 'dist', 'index.js');
let temporaryRoot;

function runRender(cwd, cacheDir, outDir) {
  const result = spawnSync(
    process.execPath,
    [cliPath, 'preset', 'render', 'villager', '--out', outDir, '--json'],
    {
      cwd,
      env: { ...process.env, LPC_TOOLKIT_CACHE_DIR: cacheDir },
      encoding: 'utf8',
      maxBuffer: 10 * 1024 * 1024,
    },
  );

  assert.ifError(result.error);
  assert.equal(
    result.status,
    0,
    `real-asset render failed:\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`,
  );
  let response;
  assert.doesNotThrow(() => {
    response = JSON.parse(result.stdout);
  }, `real-asset render did not return valid JSON:\n${result.stdout}`);
  assert.equal(response.ok, true, 'real-asset render returned a failed JSON response');
  return result;
}

function filesBelow(root) {
  return readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(root, entry.name);
    return entry.isDirectory() ? filesBelow(entryPath) : [entryPath];
  });
}

try {
  temporaryRoot = mkdtempSync(path.join(os.tmpdir(), 'lpc-toolkit-real-assets-'));
  const cwd = path.join(temporaryRoot, 'cwd');
  const cacheDir = path.join(temporaryRoot, 'cache');
  const outDir = path.join(temporaryRoot, 'out');
  mkdirSync(cwd);
  mkdirSync(cacheDir);
  mkdirSync(outDir);

  const firstRun = runRender(cwd, cacheDir, outDir);
  assert.match(firstRun.stderr, /(?:^|\n)manifest-download:/u);
  assert.match(firstRun.stderr, /(?:^|\n)tarball-download:/u);

  const outputFiles = filesBelow(outDir);
  const requireArtifact = (suffix) => {
    const matches = outputFiles.filter((filePath) => filePath.endsWith(suffix));
    assert.ok(matches.length > 0, `real-asset render did not produce a ${suffix} artifact`);
    return matches[0];
  };
  requireArtifact('.sheet.png');
  const creditsTxtPath = requireArtifact('.credits.txt');
  const creditsCsvPath = requireArtifact('.credits.csv');
  const metadataPath = requireArtifact('.metadata.json');

  assert.ok(readFileSync(creditsTxtPath, 'utf8').trim(), 'credits TXT must contain attribution');
  assert.ok(readFileSync(creditsCsvPath, 'utf8').trim(), 'credits CSV must contain attribution');
  const metadata = JSON.parse(readFileSync(metadataPath, 'utf8'));
  assert.equal(
    typeof metadata.effectiveLicense,
    'string',
    'render metadata must contain an effective license',
  );
  assert.ok(metadata.effectiveLicense.trim(), 'render effective license must not be empty');
  assert.ok(metadata.credits?.entries > 0, 'render metadata must report attributed entries');

  const secondRun = runRender(cwd, cacheDir, outDir);
  assert.doesNotMatch(secondRun.stderr, /(?:^|\n)(?:manifest-download|tarball-download):/u);

  console.log(`Real asset smoke passed with ${metadata.credits.entries} attributed entries.`);
  console.log(`Effective license: ${metadata.effectiveLicense}`);
  console.log('Second render reused the prepared cache without download phases.');
} finally {
  if (temporaryRoot !== undefined) {
    rmSync(temporaryRoot, { recursive: true, force: true });
  }
}
