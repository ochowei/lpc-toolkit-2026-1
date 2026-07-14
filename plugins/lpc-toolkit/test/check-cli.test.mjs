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
  assert.equal(compareSemver('0.1.3', '0.1.3'), 0);
  assert.equal(compareSemver('0.1.4', '0.1.3'), 1);
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

test('reports a missing executable without throwing', () => {
  const result = checkCli({
    binary: 'lpc-toolkit',
    spawn: () => ({ error: Object.assign(new Error('missing'), { code: 'ENOENT' }) }),
  });
  assert.equal(result.ok, false);
  assert.equal(result.errors[0].code, 'cli_not_found');
});
