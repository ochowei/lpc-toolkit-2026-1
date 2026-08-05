import { createHash } from 'node:crypto';
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type {
  AssetDistributionRelease,
  AssetDistributionTrustPolicy,
} from '@lpc-toolkit/core';
import { describe, expect, it } from 'vitest';
import { inspectAssetDistributionPackage } from '../src/asset-distribution-package.js';
import { createDirectoryAssetStore } from '../src/asset-store.js';
import { initializeAssetWorkspace } from '../src/asset-workspace.js';
import { createRuntimeContext } from '../src/context.js';
import { runCli } from '../src/main.js';
import type { RuntimeAssets } from '../src/runtime-assets.js';

const DIGEST_A = `sha256:${'a'.repeat(64)}`;
const DIGEST_B = `sha256:${'b'.repeat(64)}`;
const DIGEST_C = `sha256:${'c'.repeat(64)}`;
const DIGEST_D = `sha256:${'d'.repeat(64)}`;
const ARCHIVE = Buffer.from('local distribution command fixture');

function sha256(bytes: Uint8Array): string {
  return `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
}

function release(): AssetDistributionRelease {
  return {
    schema: 'lpc-toolkit.asset-distribution-release.v1',
    release: {
      namespace: 'example',
      packId: 'example.hair',
      version: '1.2.3',
      archiveKind: 'formal',
      archiveDigest: sha256(ARCHIVE),
      byteLength: ARCHIVE.byteLength,
      manifestDigest: DIGEST_A,
      contentDigest: DIGEST_B,
      sourceDigests: [{ path: 'sprites/hair.png', digest: DIGEST_C }],
      creditsDigest: DIGEST_D,
      licenseEvidenceDigest: DIGEST_A,
      requiredCapabilities: [],
    },
    authorization: {
      namespacePolicyId: 'example-policy-v1',
      releaseEvidenceDigest: DIGEST_B,
    },
    signature: {
      keyId: DIGEST_A,
      algorithm: 'ed25519',
      payloadDigest: DIGEST_C,
      value: 'ZmFrZS1zaWduYXR1cmU',
    },
  };
}

function trustPolicy(): AssetDistributionTrustPolicy {
  return {
    schema: 'lpc-toolkit.asset-distribution-trust-policy.v1',
    policyId: 'example-policy-v1',
    allowedAlgorithms: ['ed25519'],
    keys: [{
      keyId: DIGEST_A,
      fingerprint: DIGEST_B,
      namespace: 'example',
      status: 'active',
      validFrom: '2026-01-01T00:00:00.000Z',
    }],
  };
}

function writeDistributionFixture(root: string): {
  readonly archivePath: string;
  readonly recordPath: string;
  readonly policyPath: string;
  readonly verifierPath: string;
  readonly evidencePath: string;
  readonly release: AssetDistributionRelease;
} {
  const archivePath = path.join(root, 'release.lpc-assets.zip');
  const recordPath = path.join(root, 'release.json');
  const policyPath = path.join(root, 'trust-policy.json');
  const verifierPath = path.join(root, 'verifier.json');
  const evidencePath = path.join(root, 'evidence.json');
  const selected = release();
  writeFileSync(archivePath, ARCHIVE);
  writeFileSync(recordPath, `${JSON.stringify(selected)}\n`);
  writeFileSync(policyPath, `${JSON.stringify(trustPolicy())}\n`);
  writeFileSync(verifierPath, `${JSON.stringify({
    signatureValid: true,
    publicKeyFingerprint: DIGEST_B,
    observedAt: '2026-08-06T00:00:00.000Z',
  })}\n`);
  writeFileSync(evidencePath, `${JSON.stringify({
    ok: true,
    decision: 'publishable',
    releaseEvidenceDigest: selected.authorization.releaseEvidenceDigest,
    creditsDigest: selected.release.creditsDigest,
    licenseEvidenceDigest: selected.release.licenseEvidenceDigest,
  })}\n`);
  return { archivePath, recordPath, policyPath, verifierPath, evidencePath, release: selected };
}

function assetArgs(fixture: ReturnType<typeof writeDistributionFixture>): string[] {
  return [
    '--namespace', fixture.release.release.namespace,
    '--pack-id', fixture.release.release.packId,
    '--version', fixture.release.release.version,
    '--record', fixture.recordPath,
    '--archive', fixture.archivePath,
  ];
}

async function runJson(
  argv: readonly string[],
  cwd: string,
  options: Parameters<typeof runCli>[2] = {},
): Promise<{ readonly code: number; readonly response: Record<string, unknown>; readonly stderr: string }> {
  const stdout: string[] = [];
  const stderr: string[] = [];
  const code = await runCli(argv, {
    cwd,
    stdout: (text) => stdout.push(text),
    stderr: (text) => stderr.push(text),
  }, options);
  return {
    code,
    response: JSON.parse(stdout.join('')) as Record<string, unknown>,
    stderr: stderr.join(''),
  };
}

function createRuntime(cwd: string): RuntimeAssets {
  const assetsRoot = path.join(cwd, 'base-assets');
  mkdirSync(assetsRoot, { recursive: true });
  writeFileSync(path.join(assetsRoot, 'CREDITS.csv'), 'filename,notes,authors,licenses,urls\n');
  const store = createDirectoryAssetStore(assetsRoot);
  return {
    context: createRuntimeContext({
      cwd,
      assetsRoot,
      spritesheetsBaseUrl: store.baseUrl,
    }),
    store,
    source: 'working-directory',
  };
}

describe('public asset distribution CLI contracts', () => {
  it('inspects exact local fixture bytes without exposing paths or payloads', async () => {
    const cwd = mkdtempSync(path.join(tmpdir(), 'lpc-d4-command-inspect-'));
    const fixture = writeDistributionFixture(cwd);
    const result = await runJson([
      'asset', 'distribution', 'inspect',
      ...assetArgs(fixture),
      '--json',
    ], cwd);

    expect(result.code).toBe(0);
    expect(result.response).toMatchObject({
      ok: true,
      command: 'asset distribution inspect',
      data: {
        schema: 'lpc-toolkit.asset-distribution-verification.v1',
        operation: 'inspect',
        state: 'verified',
        mutation: 'none',
        publication: 'not-performed',
        identity: {
          namespace: 'example',
          packId: 'example.hair',
          version: '1.2.3',
          archiveDigest: fixture.release.release.archiveDigest,
        },
      },
    });
    const serialized = JSON.stringify(result.response);
    expect(serialized).not.toContain(cwd);
    expect(serialized).not.toContain(ARCHIVE.toString());
    expect(result.stderr).toBe('');

    const fetched = await runJson([
      'asset', 'distribution', 'fetch',
      ...assetArgs(fixture),
      '--source-id', 'fixture-registry',
      '--json',
    ], cwd);
    expect(fetched.code).toBe(0);
    expect(fetched.response).toMatchObject({
      ok: true,
      data: {
        operation: 'fetch',
        state: 'verified',
        scope: 'local-fixture-fetch',
        mutation: 'none',
      },
    });
  });

  it('uses stable human wording for the local-only boundary and next action', async () => {
    const cwd = mkdtempSync(path.join(tmpdir(), 'lpc-d4-command-human-'));
    const fixture = writeDistributionFixture(cwd);
    const stdout: string[] = [];
    const stderr: string[] = [];
    const code = await runCli([
      'asset', 'distribution', 'inspect',
      ...assetArgs(fixture),
    ], {
      cwd,
      stdout: (text) => stdout.push(text),
      stderr: (text) => stderr.push(text),
    });

    expect(code).toBe(0);
    expect(stderr).toEqual([]);
    expect(stdout.join('')).toContain('D4 distribution inspect: verified.');
    expect(stdout.join('')).toContain('no remote service, key creation, or real publication was performed');
    expect(stdout.join('')).toContain('Next action: Evaluate the supplied local trust policy');
  });

  it('verifies a local trust-policy and deterministic verifier fixture', async () => {
    const cwd = mkdtempSync(path.join(tmpdir(), 'lpc-d4-command-verify-'));
    const fixture = writeDistributionFixture(cwd);
    const result = await runJson([
      'asset', 'distribution', 'verify',
      ...assetArgs(fixture),
      '--trust-policy', fixture.policyPath,
      '--verifier', fixture.verifierPath,
      '--json',
    ], cwd);

    expect(result.code).toBe(0);
    expect(result.response).toMatchObject({
      ok: true,
      data: {
        operation: 'verify',
        state: 'verified',
        trust: {
          status: 'trusted',
          policyId: 'example-policy-v1',
          keyId: DIGEST_A,
          signatureVerified: true,
        },
        nextActions: [{ id: 'install-temporary-prefix', requiresConfirmation: true }],
      },
    });
  });

  it('returns a stable untrusted response and non-zero exit without bypassing policy', async () => {
    const cwd = mkdtempSync(path.join(tmpdir(), 'lpc-d4-command-untrusted-'));
    const fixture = writeDistributionFixture(cwd);
    writeFileSync(fixture.verifierPath, `${JSON.stringify({
      signatureValid: false,
      publicKeyFingerprint: DIGEST_B,
      observedAt: '2026-08-06T00:00:00.000Z',
    })}\n`);
    const result = await runJson([
      'asset', 'distribution', 'verify',
      ...assetArgs(fixture),
      '--trust-policy', fixture.policyPath,
      '--verifier', fixture.verifierPath,
      '--json',
    ], cwd);

    expect(result.code).toBe(1);
    expect(result.response).toMatchObject({
      ok: true,
      data: {
        operation: 'verify',
        state: 'untrusted',
        trust: { status: 'signature-invalid', signatureVerified: false },
        nextActions: [{ id: 'authorized-trust-policy' }],
      },
    });
  });

  it('requires explicit confirmation for the temporary-prefix mutation seam', async () => {
    const cwd = mkdtempSync(path.join(tmpdir(), 'lpc-d4-command-install-'));
    const fixture = writeDistributionFixture(cwd);
    const workspaceRoot = path.join(cwd, 'consumer-prefix');
    initializeAssetWorkspace(workspaceRoot);
    const before = readFileSync(path.join(workspaceRoot, 'lpc-asset-workspace.json'), 'utf8');
    const result = await runJson([
      'asset', 'distribution', 'install',
      ...assetArgs(fixture),
      '--trust-policy', fixture.policyPath,
      '--verifier', fixture.verifierPath,
      '--evidence', fixture.evidencePath,
      '--workspace', workspaceRoot,
      '--prefix-kind', 'temporary-consumer-prefix',
      '--json',
    ], cwd, { prepareRuntimeAssets: async () => createRuntime(cwd) });

    expect(result.code).toBe(0);
    expect(result.response).toMatchObject({
      ok: true,
      data: {
        operation: 'install',
        state: 'needs-user-action',
        mutation: 'temporary-consumer-prefix-only',
        nextActions: [{ id: 'confirm-install', requiresConfirmation: true }],
      },
    });
    expect(readFileSync(path.join(workspaceRoot, 'lpc-asset-workspace.json'), 'utf8')).toBe(before);
  });

  it('refuses a system-wide prefix with no mutation', async () => {
    const cwd = mkdtempSync(path.join(tmpdir(), 'lpc-d4-command-system-prefix-'));
    const fixture = writeDistributionFixture(cwd);
    const workspaceRoot = path.join(cwd, 'consumer-prefix');
    initializeAssetWorkspace(workspaceRoot);
    const before = readFileSync(path.join(workspaceRoot, 'lpc-asset-workspace.json'), 'utf8');
    const result = await runJson([
      'asset', 'distribution', 'install',
      ...assetArgs(fixture),
      '--trust-policy', fixture.policyPath,
      '--verifier', fixture.verifierPath,
      '--evidence', fixture.evidencePath,
      '--workspace', workspaceRoot,
      '--prefix-kind', 'system-wide-prefix',
      '--json',
    ], cwd, { prepareRuntimeAssets: async () => createRuntime(cwd) });

    expect(result.code).toBe(1);
    expect(result.response).toMatchObject({
      ok: true,
      data: {
        operation: 'install',
        state: 'blocked',
        mutation: 'none',
        nextActions: [{ id: 'temporary-prefix-only' }],
      },
    });
    expect(readFileSync(path.join(workspaceRoot, 'lpc-asset-workspace.json'), 'utf8')).toBe(before);
  });

  it('returns explicit rollback selection and fake post-publication verification', async () => {
    const cwd = mkdtempSync(path.join(tmpdir(), 'lpc-d4-command-audit-'));
    const priorIdentity = `example/example.hair@1.2.2#${DIGEST_B}`;
    const candidatesPath = path.join(cwd, 'candidates.json');
    writeFileSync(candidatesPath, `${JSON.stringify([{
      identityKey: priorIdentity,
      namespace: 'example',
      packId: 'example.hair',
      version: '1.2.2',
      archiveDigest: DIGEST_B,
      recordDigest: DIGEST_C,
      state: 'verified',
    }])}\n`);
    const rollback = await runJson([
      'asset', 'distribution', 'rollback',
      '--candidates', candidatesPath,
      '--selected', priorIdentity,
      '--current', `example/example.hair@1.2.3#${DIGEST_A}`,
      '--prior-receipt-digest', DIGEST_D,
      '--json',
    ], cwd);
    expect(rollback.code).toBe(0);
    expect(rollback.response).toMatchObject({
      ok: true,
      data: {
        operation: 'rollback',
        state: 'needs-user-action',
        mutation: 'none',
        nextActions: [{ id: 'confirm-consumer-install', requiresConfirmation: true }],
      },
    });

    const packageInput = {
      expected: { packageName: '@lpc-toolkit/cli', version: '0.2.0' },
      tarballBytes: Buffer.from('package fixture'),
      entries: [
        { path: 'package/', kind: 'directory' as const },
        { path: 'package/package.json', kind: 'file' as const, bytes: Buffer.from(JSON.stringify({
          name: '@lpc-toolkit/cli',
          version: '0.2.0',
          license: 'GPL-3.0-or-later',
          type: 'module',
          bin: { 'lpc-toolkit': './dist/index.js' },
          files: ['dist', 'README.md'],
        })) },
        { path: 'package/dist/', kind: 'directory' as const },
        { path: 'package/dist/index.js', kind: 'file' as const, bytes: Buffer.from('entrypoint') },
      ],
      entrypoint: {
        path: 'package/dist/index.js',
        help: 'Usage: lpc-toolkit <command>\n',
        version: '0.2.0\n',
      },
      releaseEvidence: {
        commit: '0123456789abcdef0123456789abcdef01234567',
        tag: 'v0.2.0',
        ciEvidenceDigest: DIGEST_A,
      },
    };
    const inspected = inspectAssetDistributionPackage(packageInput);
    expect(inspected.ok).toBe(true);
    if (!inspected.ok) throw new Error(JSON.stringify(inspected.diagnostics));
    const inspectionPath = path.join(cwd, 'inspection.json');
    const receiptPath = path.join(cwd, 'receipt.json');
    writeFileSync(inspectionPath, `${JSON.stringify(inspected.inspection)}\n`);
    writeFileSync(receiptPath, `${JSON.stringify({
      schema: 'lpc-toolkit.asset-distribution-package-receipt.v1',
      transport: { kind: 'fake-npm', sourceId: 'fixture-npm', credentialsUsed: false },
      packageName: inspected.inspection.package.name,
      version: inspected.inspection.package.version,
      tarballSha256: inspected.inspection.tarball.sha256,
      integrity: inspected.inspection.tarball.integrity,
      status: 'published',
      publicationId: 'fixture-publication',
      packageInspectionDigest: inspected.inspection.inspectionDigest,
    })}\n`);
    const publication = await runJson([
      'asset', 'distribution', 'post-publication',
      '--inspection', inspectionPath,
      '--receipt', receiptPath,
      '--transport', 'fake-npm',
      '--json',
    ], cwd);
    expect(publication.code).toBe(0);
    expect(publication.response).toMatchObject({
      ok: true,
      data: {
        operation: 'post-publication',
        state: 'verified',
        publication: 'fake-receipt-verified',
        nextActions: [{ id: 'real-publication-approval-required' }],
      },
    });
    expect(JSON.stringify(publication.response)).not.toContain(cwd);
  });
});
