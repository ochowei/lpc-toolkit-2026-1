import assert from 'node:assert/strict';
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

test('accepts the supported beta CLI range', () => {
  assert.deepEqual(SUPPORTED_CLI, {
    min: '0.1.3-alpha-1',
    maxExclusive: '0.2.0',
  });
  assert.deepEqual(evaluateVersion('0.1.3-alpha-1\n'), {
    ok: true,
    installedVersion: '0.1.3-alpha-1',
    supportedRange: '>=0.1.3-alpha-1 <0.2.0',
    errors: [],
  });
});

test('rejects older and next-minor CLI versions', () => {
  assert.equal(evaluateVersion('0.1.2').errors[0].code, 'cli_version_unsupported');
  assert.equal(evaluateVersion('0.2.0').errors[0].code, 'cli_version_unsupported');
});

test('rejects malformed semantic versions', () => {
  for (const version of ['00.1.4', '0.1.4-alpha..1', '0.1.4-alpha.01']) {
    assert.equal(evaluateVersion(version).errors[0].code, 'cli_version_invalid');
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
