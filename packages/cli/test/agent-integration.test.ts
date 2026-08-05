import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { runCli } from '../src/main.js';

const VALID_MANIFEST = {
  schema: 'lpc-toolkit.agent-integration-manifest.v1',
  id: 'agent.example.lpc-authoring',
  version: '1.0.0',
  cliRange: '>=0.2.0 <0.3.0',
  requiredCapabilities: ['asset-authoring-session.v1'],
  optionalCapabilities: ['future-provider-capability.v1'],
  supportedGoals: ['new-item'],
  providerAdapters: [],
} as const;

const INVALID_MANIFEST_CASES = [
  ['private path', { ...VALID_MANIFEST, id: '/tmp/provider' }, 'asset_provider_private_data'],
  ['URL', { ...VALID_MANIFEST, id: 'https://provider.example' }, 'asset_provider_private_data'],
  ['credential', { ...VALID_MANIFEST, id: 'api_key=secret' }, 'asset_provider_private_data'],
  ['unknown field', { ...VALID_MANIFEST, extra: true }, 'asset_provider_schema_invalid'],
  ['unsupported goal', { ...VALID_MANIFEST, supportedGoals: ['render'] }, 'asset_provider_schema_invalid'],
  ['invalid SemVer', { ...VALID_MANIFEST, version: 'not-semver' }, 'asset_provider_semver_invalid'],
  [
    'duplicate capability',
    { ...VALID_MANIFEST, requiredCapabilities: ['asset-authoring-session.v1', 'asset-authoring-session.v1'] },
    'asset_provider_schema_invalid',
  ],
  [
    'required/optional overlap',
    { ...VALID_MANIFEST, optionalCapabilities: ['asset-authoring-session.v1'] },
    'asset_provider_schema_invalid',
  ],
] as const;

describe('Agent integration CLI', () => {
  it('preflights a missing manifest before loading runtime assets', async () => {
    const cwd = mkdtempSync(path.join(tmpdir(), 'lpc-agent-integration-preflight-'));
    const stdout: string[] = [];
    const stderr: string[] = [];
    const prepare = vi.fn(async () => {
      throw new Error('Agent integration preflight must not prepare runtime assets.');
    });

    const code = await runCli([
      'agent',
      'integration',
      'check',
      '--json',
    ], {
      cwd,
      stdout: (text) => stdout.push(text),
      stderr: (text) => stderr.push(text),
    }, { prepareRuntimeAssets: prepare });

    expect(code).toBe(1);
    expect(prepare).not.toHaveBeenCalled();
    expect(stderr).toEqual([]);
    expect(JSON.parse(stdout.join(''))).toMatchObject({
      ok: false,
      command: 'agent integration check',
      data: null,
      errors: [{ code: 'missing_argument', path: '--manifest' }],
    });
  });

  it('checks a manifest without preparing asset runtime and reports optional fallback', async () => {
    const cwd = mkdtempSync(path.join(tmpdir(), 'lpc-agent-integration-'));
    const manifestPath = path.join(cwd, 'manifest.json');
    writeFileSync(manifestPath, `${JSON.stringify(VALID_MANIFEST)}\n`);
    const stdout: string[] = [];
    const stderr: string[] = [];
    const prepare = vi.fn(async () => {
      throw new Error('Agent integration checks must not prepare runtime assets.');
    });

    const code = await runCli([
      'agent',
      'integration',
      'check',
      '--manifest',
      manifestPath,
      '--json',
    ], {
      cwd,
      stdout: (text) => stdout.push(text),
      stderr: (text) => stderr.push(text),
    }, { prepareRuntimeAssets: prepare });

    expect(code).toBe(0);
    expect(prepare).not.toHaveBeenCalled();
    expect(stderr).toEqual([]);
    expect(JSON.parse(stdout.join(''))).toMatchObject({
      ok: true,
      command: 'agent integration check',
      data: {
        manifest: {
          id: VALID_MANIFEST.id,
          version: VALID_MANIFEST.version,
        },
        cliVersion: '0.2.0',
        compatible: true,
        missingRequiredCapabilities: [],
        missingOptionalCapabilities: ['future-provider-capability.v1'],
        optionalFallback: true,
        refusal: null,
      },
      warnings: [],
      errors: [],
    });
    expect(stdout.join('')).not.toContain(manifestPath);
  });

  it('keeps the human response aligned with the structured compatibility result', async () => {
    const cwd = mkdtempSync(path.join(tmpdir(), 'lpc-agent-integration-human-'));
    const manifestPath = path.join(cwd, 'manifest.json');
    writeFileSync(manifestPath, `${JSON.stringify(VALID_MANIFEST)}\n`);
    const stdout: string[] = [];
    const stderr: string[] = [];

    const code = await runCli([
      'agent',
      'integration',
      'check',
      '--manifest',
      manifestPath,
    ], {
      cwd,
      stdout: (text) => stdout.push(text),
      stderr: (text) => stderr.push(text),
    });

    expect(code).toBe(0);
    expect(stderr).toEqual([]);
    expect(stdout.join('')).toContain('Agent integration: compatible');
    expect(stdout.join('')).toContain('Manifest: agent.example.lpc-authoring 1.0.0');
    expect(stdout.join('')).toContain('CLI version: 0.2.0');
    expect(stdout.join('')).toContain('Optional fallback: future-provider-capability.v1');
    expect(stdout.join('')).not.toContain(manifestPath);
  });

  it('returns the stable refusal code when a required capability is unavailable', async () => {
    const cwd = mkdtempSync(path.join(tmpdir(), 'lpc-agent-integration-required-'));
    const manifestPath = path.join(cwd, 'manifest.json');
    writeFileSync(manifestPath, JSON.stringify({
      ...VALID_MANIFEST,
      requiredCapabilities: ['future-required-capability.v1'],
      optionalCapabilities: [],
    }));
    const stdout: string[] = [];
    const stderr: string[] = [];

    const code = await runCli([
      'agent',
      'integration',
      'check',
      '--manifest',
      manifestPath,
      '--json',
    ], {
      cwd,
      stdout: (text) => stdout.push(text),
      stderr: (text) => stderr.push(text),
    });

    expect(code).toBe(1);
    expect(stderr).toEqual([]);
    expect(JSON.parse(stdout.join(''))).toMatchObject({
      ok: false,
      command: 'agent integration check',
      data: null,
      errors: [{
        code: 'agent_integration_capability_unsupported',
        path: '$.requiredCapabilities',
      }],
    });
    expect(stdout.join('')).toContain('future-required-capability.v1');
    expect(stdout.join('')).not.toContain(manifestPath);
  });

  it('returns the same refusal code when the CLI range is incompatible', async () => {
    const cwd = mkdtempSync(path.join(tmpdir(), 'lpc-agent-integration-range-'));
    const manifestPath = path.join(cwd, 'manifest.json');
    writeFileSync(manifestPath, JSON.stringify({
      ...VALID_MANIFEST,
      cliRange: '>=9.0.0 <10.0.0',
      optionalCapabilities: [],
    }));
    const stdout: string[] = [];
    const stderr: string[] = [];

    const code = await runCli([
      'agent',
      'integration',
      'check',
      '--manifest',
      manifestPath,
      '--json',
    ], {
      cwd,
      stdout: (text) => stdout.push(text),
      stderr: (text) => stderr.push(text),
    });

    expect(code).toBe(1);
    expect(stderr).toEqual([]);
    expect(JSON.parse(stdout.join(''))).toMatchObject({
      ok: false,
      command: 'agent integration check',
      errors: [{
        code: 'agent_integration_capability_unsupported',
        path: '$.cliRange',
      }],
    });
    expect(stdout.join('')).not.toContain(manifestPath);
  });

  it.each(INVALID_MANIFEST_CASES)(
    'refuses %s manifest input through the CLI schema boundary',
    async (_label, manifest, expectedCode) => {
      const cwd = mkdtempSync(path.join(tmpdir(), 'lpc-agent-integration-invalid-'));
      const manifestPath = path.join(cwd, 'manifest.json');
      writeFileSync(manifestPath, JSON.stringify(manifest));
      const stdout: string[] = [];
      const stderr: string[] = [];

      const code = await runCli([
        'agent',
        'integration',
        'check',
        '--manifest',
        manifestPath,
        '--json',
      ], {
        cwd,
        stdout: (text) => stdout.push(text),
        stderr: (text) => stderr.push(text),
      });

      expect(code).toBe(1);
      expect(stderr).toEqual([]);
      const response = JSON.parse(stdout.join('')) as {
        readonly errors: readonly [{ readonly code: string }];
      };
      expect(response.errors[0]!.code).toBe(expectedCode);
      expect(stdout.join('')).not.toContain(manifestPath);
    },
  );
});
