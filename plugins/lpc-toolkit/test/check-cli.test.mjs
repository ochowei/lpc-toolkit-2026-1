import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import {
  SUPPORTED_CLI,
  checkCli,
  compareSemver,
  evaluateVersion,
} from '../skills/character-authoring/scripts/check-cli.mjs';

test('orders stable and prerelease semantic versions', () => {
  assert.equal(compareSemver('0.1.3-alpha-1', '0.1.3'), -1);
  assert.equal(compareSemver('0.1.3-Alpha-1', '0.1.3-alpha-1'), -1);
  assert.equal(compareSemver('0.1.3', '0.1.3'), 0);
  assert.equal(compareSemver('0.1.4', '0.1.3'), 1);
});

test('orders core identifiers beyond Number safe integer precision', () => {
  assert.equal(compareSemver('9007199254740992.0.0', '9007199254740993.0.0'), -1);
});

test('orders prerelease identifiers beyond Number safe integer precision', () => {
  assert.equal(
    compareSemver('0.1.3-9007199254740992', '0.1.3-9007199254740993'),
    -1,
  );
});

test('accepts the supported stable CLI range', () => {
  assert.deepEqual(SUPPORTED_CLI, {
    min: '0.2.0',
    maxExclusive: '0.3.0',
  });
  assert.deepEqual(evaluateVersion('0.2.0\n'), {
    ok: true,
    installedVersion: '0.2.0',
    supportedRange: '>=0.2.0 <0.3.0',
    errors: [],
  });
  assert.equal(evaluateVersion('0.2.1').ok, true);
});

test('accepts build metadata without changing precedence or displayed output', () => {
  assert.equal(compareSemver('0.2.0+build.7', '0.2.0'), 0);
  assert.deepEqual(evaluateVersion('0.2.0+build.7\n'), {
    ok: true,
    installedVersion: '0.2.0+build.7',
    supportedRange: '>=0.2.0 <0.3.0',
    errors: [],
  });
  assert.equal(evaluateVersion('0.2.0+build.007').ok, true);
});

test('applies npm prerelease admission rules to the supported range', () => {
  assert.equal(evaluateVersion('0.2.0-beta-2').errors[0].code, 'cli_version_unsupported');
  assert.equal(evaluateVersion('0.2.0-alpha.1').errors[0].code, 'cli_version_unsupported');
  assert.equal(evaluateVersion('0.2.1-beta-1').errors[0].code, 'cli_version_unsupported');
  assert.equal(evaluateVersion('0.3.0-alpha.1').errors[0].code, 'cli_version_unsupported');
});

test('rejects older and next-minor CLI versions', () => {
  assert.equal(evaluateVersion('0.1.4').errors[0].code, 'cli_version_unsupported');
  assert.equal(evaluateVersion('0.3.0').errors[0].code, 'cli_version_unsupported');
});

test('rejects malformed semantic versions', () => {
  for (const version of [
    '00.1.4',
    '0.1.4-alpha..1',
    '0.1.4-alpha.01',
    '0.1.4+',
    '0.1.4+build..7',
    '0.1.4+build_7',
  ]) {
    assert.equal(evaluateVersion(version).errors[0].code, 'cli_version_invalid');
  }
});

test('documents the public stable CLI installation contract', () => {
  const skillRoot = fileURLToPath(new URL('../skills/character-authoring/', import.meta.url));
  const compatibility = readFileSync(path.join(skillRoot, 'references/compatibility.md'), 'utf8');

  for (const required of [
    "npm install -g '@lpc-toolkit/cli@>=0.2.0 <0.3.0'",
    'Plugin version `0.2.0` supports `@lpc-toolkit/cli >=0.2.0 <0.3.0`',
  ]) {
    assert.equal(
      compatibility.includes(required),
      true,
      `missing compatibility guidance: ${required}`,
    );
  }
});

test('documents and runs the checker by resolved absolute skill path from another cwd', () => {
  const skillRoot = fileURLToPath(new URL('../skills/character-authoring/', import.meta.url));
  const skill = readFileSync(path.join(skillRoot, 'SKILL.md'), 'utf8');
  const compatibility = readFileSync(path.join(skillRoot, 'references/compatibility.md'), 'utf8');
  for (const documentation of [skill, compatibility]) {
    assert.match(documentation, /SKILL_DIR/);
    assert.match(documentation, /node "\$SKILL_DIR\/scripts\/check-cli\.mjs"/);
  }

  const unrelatedCwd = mkdtempSync(path.join(os.tmpdir(), 'lpc-check-cli-cwd-'));
  const fakeCli = path.join(unrelatedCwd, 'fake-cli.mjs');
  writeFileSync(fakeCli, "process.stdout.write('0.2.0\\n');\n");
  try {
    const result = spawnSync(
      process.execPath,
      [path.join(skillRoot, 'scripts/check-cli.mjs')],
      {
        cwd: unrelatedCwd,
        encoding: 'utf8',
        env: { ...process.env, LPC_TOOLKIT_NODE_ENTRY: fakeCli },
      },
    );
    assert.equal(result.status, 0, result.stderr);
    assert.equal(JSON.parse(result.stdout).ok, true);
  } finally {
    rmSync(unrelatedCwd, { recursive: true, force: true });
  }
});

test('reports a missing executable without throwing', () => {
  const result = checkCli({
    binary: 'lpc-toolkit',
    spawn: () => ({ error: Object.assign(new Error('missing'), { code: 'ENOENT' }) }),
  });
  assert.equal(result.ok, false);
  assert.equal(result.errors[0].code, 'cli_not_found');
});
