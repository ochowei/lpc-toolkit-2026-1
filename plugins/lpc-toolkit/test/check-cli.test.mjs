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
} from '../scripts/check-cli.mjs';

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

test('documents the public stable CLI installation contract once for all workflows', () => {
  const manifest = JSON.parse(readFileSync(new URL('../.codex-plugin/plugin.json', import.meta.url), 'utf8'));
  const metadata = JSON.parse(readFileSync(new URL('../compatibility.json', import.meta.url), 'utf8'));
  const compatibility = readFileSync(new URL('../references/compatibility.md', import.meta.url), 'utf8')
    .replace(/\s+/gu, ' ');
  for (const required of [
      `npm install -g '@lpc-toolkit/cli@${metadata.cliRange}'`,
      `Plugin version \`${manifest.version}\` supports \`@lpc-toolkit/cli ${metadata.cliRange}\``,
      '`asset-authoring-draft-recovery.v1`',
      '`lpc-toolkit.asset-authoring-draft-receipt.v1`',
      '`lpc-toolkit.asset-authoring-formal-archive-receipt.v1`',
      '`lpc-toolkit.asset-authoring-archive-inspection-receipt.v1`',
      '`lpc-toolkit.asset-authoring-install-receipt.v1`',
      '`asset-authoring-consumer-install.v1`',
      '`acknowledge`, `declare`, `accept-preview`, `sync`, `pack`, `inspect`,',
      'human-confirmed follow-up actions',
    ]) {
      assert.equal(
        compatibility.includes(required),
        true,
        `missing shared compatibility guidance: ${required}`,
      );
    }
});

test('documents and runs one checker by resolved absolute plugin path from another cwd', () => {
  const pluginRoot = fileURLToPath(new URL('../', import.meta.url));
  const unrelatedCwd = mkdtempSync(path.join(os.tmpdir(), 'lpc-check-cli-cwd-'));
  const fakeCli = path.join(unrelatedCwd, 'fake-cli.mjs');
  writeFileSync(fakeCli, "process.stdout.write('0.2.0\\n');\n");
  try {
    const compatibility = readFileSync(path.join(pluginRoot, 'references/compatibility.md'), 'utf8');
    for (const skillName of ['animation-asset-audit', 'asset-authoring', 'character-authoring']) {
      const skill = readFileSync(path.join(pluginRoot, 'skills', skillName, 'SKILL.md'), 'utf8');
      for (const documentation of [skill, compatibility]) {
        assert.match(documentation, /PLUGIN_ROOT/);
        assert.match(documentation, /node "\$PLUGIN_ROOT\/scripts\/check-cli\.mjs"/);
      }
    }
    const result = spawnSync(process.execPath, [path.join(pluginRoot, 'scripts/check-cli.mjs')], {
      cwd: unrelatedCwd,
      encoding: 'utf8',
      env: { ...process.env, LPC_TOOLKIT_NODE_ENTRY: fakeCli },
    });
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
