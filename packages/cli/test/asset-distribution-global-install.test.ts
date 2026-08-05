import { createHash } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import type {
  AssetDistributionRelease,
  AssetDistributionTrustDecision,
} from '@lpc-toolkit/core';
import { createDirectoryAssetStore } from '../src/asset-store.js';
import { createRuntimeContext } from '../src/context.js';
import { createD3WebCliFixtures } from './fixtures/d3-web-cli-fixtures.js';
import {
  assetDistributionRegistryRecordDigest,
  captureAssetDistributionRegistryResponse,
  type AssetDistributionRegistryCapture,
} from '../src/asset-distribution-transport.js';
import { readAssetPackArchive } from '../src/asset-pack-archive-format.js';
import {
  initializeAssetWorkspace,
  type AssetWorkspace,
} from '../src/asset-workspace.js';
import {
  installAssetDistributionToConsumerPrefix,
  type AssetDistributionConsumerInstallResult,
} from '../src/asset-distribution-global-install.js';
import type { RuntimeAssets } from '../src/runtime-assets.js';
import type {
  AssetPackInstallAction,
  AssetPackInstallResult,
} from '../src/asset-pack-install.js';

const DIGEST_A = `sha256:${'a'.repeat(64)}`;
const DIGEST_B = `sha256:${'b'.repeat(64)}`;

function sha256(bytes: Uint8Array): string {
  return `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
}

interface Fixture {
  readonly root: string;
  readonly archivePath: string;
  readonly archiveBytes: Buffer;
  readonly workspace: AssetWorkspace;
  readonly runtime: RuntimeAssets;
  readonly capture: AssetDistributionRegistryCapture;
  readonly release: AssetDistributionRelease;
}

function trustedDecision(release: AssetDistributionRelease): AssetDistributionTrustDecision {
  return {
    status: 'trusted',
    policyId: release.authorization.namespacePolicyId,
    namespace: release.release.namespace,
    keyId: release.signature.keyId,
  };
}

async function createFixture(): Promise<Fixture> {
  const d3 = await createD3WebCliFixtures();
  const archiveBytes = Buffer.from(d3.archiveBytes);
  const archiveResult = await readAssetPackArchive({
    archivePath: 'd4-global-install-fixture.lpc-assets.zip',
    archiveBytes,
  });
  if (!archiveResult.ok) throw new Error(JSON.stringify(archiveResult.diagnostics));
  const snapshot = archiveResult.snapshot;
  const root = mkdtempSync(path.join(os.tmpdir(), 'lpc-d4-global-install-'));
  const assetsRoot = path.join(root, 'base-assets');
  mkdirSync(path.join(assetsRoot, 'sheet_definitions'), { recursive: true });
  mkdirSync(path.join(assetsRoot, 'palette_definitions'), { recursive: true });
  mkdirSync(path.join(assetsRoot, 'spritesheets'), { recursive: true });
  writeFileSync(path.join(assetsRoot, 'CREDITS.csv'), 'filename,notes,authors,licenses,urls\n');
  const workspace = initializeAssetWorkspace(path.join(root, 'consumer-prefix'));
  const store = createDirectoryAssetStore(assetsRoot);
  const runtime: RuntimeAssets = {
    context: createRuntimeContext({
      cwd: root,
      assetsRoot,
      customAssetsRoot: workspace.outputRoot,
      spritesheetsBaseUrl: store.baseUrl,
    }),
    store,
    source: 'working-directory',
  };
  const archivePath = path.join(root, 'release.lpc-assets.zip');
  writeFileSync(archivePath, archiveBytes);
  const sourceDigests = [...snapshot.payload.sourceDigests]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([pathName, digest]) => ({ path: pathName, digest }));
  const release: AssetDistributionRelease = {
    schema: 'lpc-toolkit.asset-distribution-release.v1',
    release: {
      namespace: 'example',
      packId: snapshot.payload.pack.id,
      version: snapshot.payload.pack.version,
      archiveKind: 'formal',
      archiveDigest: snapshot.archiveDigest,
      byteLength: archiveBytes.byteLength,
      manifestDigest: sha256(snapshot.manifestBytes),
      contentDigest: snapshot.payload.contentDigest,
      sourceDigests,
      creditsDigest: DIGEST_A,
      licenseEvidenceDigest: DIGEST_B,
      requiredCapabilities: [],
    },
    authorization: {
      namespacePolicyId: 'example-policy-v1',
      releaseEvidenceDigest: DIGEST_A,
    },
    signature: {
      keyId: DIGEST_A,
      algorithm: 'ed25519',
      payloadDigest: DIGEST_B,
      value: 'ZmFrZS1zaWduYXR1cmU',
    },
  };
  const captureResult = captureAssetDistributionRegistryResponse({
    request: {
      namespace: release.release.namespace,
      packId: release.release.packId,
      version: release.release.version,
    },
    response: {
      record: release,
      archiveBytes,
      availability: 'available',
      transport: { sourceId: 'fixture-registry', statusCode: 200 },
      observedAt: '2026-08-06T12:00:00.000Z',
    },
  });
  if (!captureResult.ok) throw new Error(JSON.stringify(captureResult.diagnostics));
  return { root, archivePath, archiveBytes, workspace, runtime, capture: captureResult.capture, release };
}

function publishableEvidence(release: AssetDistributionRelease): Extract<AssetDistributionConsumerInstallResult, { ok: true }>['evidence'] {
  return {
    ok: true,
    decision: 'publishable',
    releaseEvidenceDigest: release.authorization.releaseEvidenceDigest,
    creditsDigest: release.release.creditsDigest,
    licenseEvidenceDigest: release.release.licenseEvidenceDigest,
  };
}

function fakeInstallSuccess(
  release: AssetDistributionRelease,
  action: AssetPackInstallAction = 'installed',
): AssetPackInstallResult {
  return {
    ok: true,
    action,
    packId: release.release.packId,
    version: release.release.version,
    archiveDigest: release.release.archiveDigest,
    installedDirectory: '/temporary-consumer-prefix/installed/example',
    generatedFileCount: 0,
  };
}

describe('asset distribution consumer-prefix install', () => {
  it('refuses a system-wide prefix before any filesystem mutation', async () => {
    const fixture = await createFixture();
    const before = readFileSync(fixture.workspace.configPath);
    const result = await installAssetDistributionToConsumerPrefix({
      prefixKind: 'system-wide-prefix',
      confirm: true,
      archivePath: fixture.archivePath,
      capture: fixture.capture,
      release: fixture.release,
      trustDecision: trustedDecision(fixture.release),
      evidence: publishableEvidence(fixture.release),
      workspace: fixture.workspace,
      runtime: fixture.runtime,
      supportedCapabilities: [],
    });
    expect(result).toMatchObject({
      ok: false,
      diagnostics: [{ code: 'asset_distribution_external_mutation_blocked' }],
    });
    expect(readFileSync(fixture.workspace.configPath)).toEqual(before);
  });

  it('returns confirmation-required without calling the transactional installer', async () => {
    const fixture = await createFixture();
    const install = vi.fn(async () => fakeInstallSuccess(fixture.release));
    const before = readFileSync(fixture.workspace.configPath);
    const result = await installAssetDistributionToConsumerPrefix({
      prefixKind: 'temporary-consumer-prefix',
      confirm: false,
      archivePath: fixture.archivePath,
      capture: fixture.capture,
      release: fixture.release,
      trustDecision: trustedDecision(fixture.release),
      evidence: publishableEvidence(fixture.release),
      workspace: fixture.workspace,
      runtime: fixture.runtime,
      supportedCapabilities: [],
      install,
    });
    expect(result).toMatchObject({
      ok: true,
      state: 'needs-user-action',
      action: 'confirmation-required',
    });
    expect(install).not.toHaveBeenCalled();
    expect(readFileSync(fixture.workspace.configPath)).toEqual(before);
  });

  it('blocks untrusted, withdrawn, tampered, and incompatible releases before mutation', async () => {
    const fixture = await createFixture();
    const install = vi.fn(async () => fakeInstallSuccess(fixture.release));
    const untrusted = await installAssetDistributionToConsumerPrefix({
      prefixKind: 'temporary-consumer-prefix',
      confirm: true,
      archivePath: fixture.archivePath,
      capture: fixture.capture,
      release: fixture.release,
      trustDecision: {
        status: 'key-untrusted',
        code: 'asset_distribution_key_untrusted',
        policyId: 'example-policy-v1',
        namespace: 'example',
        keyId: DIGEST_A,
      },
      evidence: publishableEvidence(fixture.release),
      workspace: fixture.workspace,
      runtime: fixture.runtime,
      supportedCapabilities: [],
      install,
    });
    expect(untrusted).toMatchObject({ ok: false, diagnostics: [{ code: 'asset_distribution_untrusted' }] });

    const withdrawn = await installAssetDistributionToConsumerPrefix({
      prefixKind: 'temporary-consumer-prefix',
      confirm: true,
      archivePath: fixture.archivePath,
      capture: { ...fixture.capture, availability: 'withdrawn' },
      release: fixture.release,
      trustDecision: trustedDecision(fixture.release),
      evidence: publishableEvidence(fixture.release),
      workspace: fixture.workspace,
      runtime: fixture.runtime,
      supportedCapabilities: [],
      install,
    });
    expect(withdrawn).toMatchObject({ ok: false, diagnostics: [{ code: 'asset_distribution_withdrawn' }] });

    const incompatibleRelease = {
      ...fixture.release,
      release: { ...fixture.release.release, requiredCapabilities: ['asset-pack-global-install.v1'] },
    } satisfies AssetDistributionRelease;
    const incompatible = await installAssetDistributionToConsumerPrefix({
      prefixKind: 'temporary-consumer-prefix',
      confirm: true,
      archivePath: fixture.archivePath,
      capture: {
        ...fixture.capture,
        release: incompatibleRelease,
        recordDigest: assetDistributionRegistryRecordDigest(incompatibleRelease),
      },
      release: incompatibleRelease,
      trustDecision: trustedDecision(fixture.release),
      evidence: publishableEvidence(fixture.release),
      workspace: fixture.workspace,
      runtime: fixture.runtime,
      supportedCapabilities: [],
      install,
    });
    expect(incompatible).toMatchObject({ ok: false, diagnostics: [{ code: 'asset_distribution_capability_unsupported' }] });

    const tamperedPath = path.join(fixture.root, 'tampered.lpc-assets.zip');
    writeFileSync(tamperedPath, Buffer.concat([fixture.archiveBytes, Buffer.from('tampered')]));
    const tampered = await installAssetDistributionToConsumerPrefix({
      prefixKind: 'temporary-consumer-prefix',
      confirm: true,
      archivePath: tamperedPath,
      capture: fixture.capture,
      release: fixture.release,
      trustDecision: trustedDecision(fixture.release),
      evidence: publishableEvidence(fixture.release),
      workspace: fixture.workspace,
      runtime: fixture.runtime,
      supportedCapabilities: [],
      install,
    });
    expect(tampered).toMatchObject({ ok: false, diagnostics: [{ code: 'asset_distribution_archive_tampered' }] });
    expect(install).not.toHaveBeenCalled();
  });

  it('requires an explicit downgrade choice and passes that choice to the installer seam', async () => {
    const fixture = await createFixture();
    const installed = await installAssetDistributionToConsumerPrefix({
      prefixKind: 'temporary-consumer-prefix',
      confirm: true,
      archivePath: fixture.archivePath,
      capture: fixture.capture,
      release: fixture.release,
      trustDecision: trustedDecision(fixture.release),
      evidence: publishableEvidence(fixture.release),
      workspace: fixture.workspace,
      runtime: fixture.runtime,
      supportedCapabilities: [],
    });
    expect(installed).toMatchObject({ ok: true, state: 'installed', action: 'installed' });

    const lowerRelease = {
      ...fixture.release,
      release: { ...fixture.release.release, version: '1.2.3' },
    } satisfies AssetDistributionRelease;
    const lowerCapture: AssetDistributionRegistryCapture = {
      ...fixture.capture,
      release: lowerRelease,
      identityKey: `${lowerRelease.release.namespace}/${lowerRelease.release.packId}@${lowerRelease.release.version}#${lowerRelease.release.archiveDigest}`,
      recordDigest: assetDistributionRegistryRecordDigest(lowerRelease),
    };
    const install = vi.fn(async () => fakeInstallSuccess(lowerRelease, 'downgraded'));
    const base = {
      prefixKind: 'temporary-consumer-prefix' as const,
      confirm: true,
      archivePath: fixture.archivePath,
      capture: lowerCapture,
      release: lowerRelease,
      trustDecision: trustedDecision(lowerRelease),
      evidence: publishableEvidence(lowerRelease),
      workspace: fixture.workspace,
      runtime: fixture.runtime,
      supportedCapabilities: [],
      install,
    };
    const blocked = await installAssetDistributionToConsumerPrefix(base);
    expect(blocked).toMatchObject({
      ok: false,
      diagnostics: [{ code: 'asset_distribution_downgrade_requires_confirmation' }],
    });
    expect(install).not.toHaveBeenCalled();

    const permitted = await installAssetDistributionToConsumerPrefix({
      ...base,
      allowDowngrade: true,
    });
    expect(permitted).toMatchObject({ ok: true, state: 'installed', action: 'downgraded' });
    expect(install).toHaveBeenCalledTimes(1);
  });

  it('delegates an explicitly confirmed exact release to the existing installer', async () => {
    const fixture = await createFixture();
    const result = await installAssetDistributionToConsumerPrefix({
      prefixKind: 'temporary-consumer-prefix',
      confirm: true,
      archivePath: fixture.archivePath,
      capture: fixture.capture,
      release: fixture.release,
      trustDecision: trustedDecision(fixture.release),
      evidence: publishableEvidence(fixture.release),
      workspace: fixture.workspace,
      runtime: fixture.runtime,
      supportedCapabilities: [],
    });
    if (!result.ok) throw new Error(JSON.stringify(result.diagnostics));
    expect(result).toMatchObject({ ok: true, state: 'installed', action: 'installed' });
    if (!result.ok || result.state !== 'installed') throw new Error('Expected an installed result.');
    expect(existsSync(result.install.installedDirectory)).toBe(true);
    expect(readFileSync(path.join(fixture.workspace.outputRoot, 'CREDITS.csv')).toString()).toContain(
      'filename,notes,authors,licenses,urls',
    );

    const registryBeforeRepeat = readFileSync(fixture.workspace.registryPath);
    const repeated = await installAssetDistributionToConsumerPrefix({
      prefixKind: 'temporary-consumer-prefix',
      confirm: true,
      archivePath: fixture.archivePath,
      capture: fixture.capture,
      release: fixture.release,
      trustDecision: trustedDecision(fixture.release),
      evidence: publishableEvidence(fixture.release),
      workspace: fixture.workspace,
      runtime: fixture.runtime,
      supportedCapabilities: [],
    });
    expect(repeated).toMatchObject({ ok: true, state: 'installed', action: 'unchanged' });
    if (!repeated.ok || repeated.state !== 'installed') throw new Error('Expected an unchanged result.');
    expect(repeated.install.installedDirectory).toBe(result.install.installedDirectory);
    expect(readFileSync(fixture.workspace.registryPath)).toEqual(registryBeforeRepeat);
  });
});
