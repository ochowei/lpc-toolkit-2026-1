import { createCanvas } from '@napi-rs/canvas';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createDirectoryAssetStore } from '../src/asset-store.js';
import { assetAuthoringContractMetadataPath } from '../src/asset-authoring-contract.js';
import {
  assetAuthoringSessionPath,
  createAssetAuthoringSessionStore,
} from '../src/asset-authoring-session.js';
import { initializeAssetWorkspace } from '../src/asset-workspace.js';
import { createRuntimeContext } from '../src/context.js';
import { runCli } from '../src/main.js';
import type { RuntimeAssets } from '../src/runtime-assets.js';

const CONTRACT_DIGEST = `sha256:${'a'.repeat(64)}`;
const SESSION_ID = '00000000-0000-4000-8000-000000000000';
const temporaryDirectories: string[] = [];

const NEW_ITEM_PLAN = {
  schema: 'lpc-toolkit.asset-authoring-plan.v1',
  goal: 'new-item',
  pack: {
    id: 'acme.provider-fixture',
    version: '1.0.0',
    displayName: 'ACME Provider Fixture',
  },
  asset: {
    kind: 'new-item',
    localId: 'moon-braid',
    displayName: 'Moon Braid',
    typeName: 'hair',
    bodyTypes: ['male'],
    animations: ['walk'],
    layers: [{ id: 'foreground', zPos: 120, bodyTypes: ['male'] }],
  },
  scope: {
    packId: 'acme.provider-fixture',
    assetId: 'moon-braid',
    bodyTypes: ['male'],
    animations: ['walk'],
    paths: ['sprites/moon-braid/foreground/walk.png'],
  },
  draftCredits: {
    authors: ['Provider Fixture Artist'],
    licenses: ['GPL 3.0'],
    urls: ['https://example.test/provider-fixture'],
    notes: 'Provider preflight fixture.',
  },
} as const;

const VALID_DESCRIPTOR = {
  schema: 'lpc-toolkit.asset-provider-descriptor.v1',
  id: 'provider.example',
  adapter: {
    id: 'agent-adapter.example',
    version: '1.0.0',
    cliRange: '>=0.2.0 <0.3.0',
  },
  capabilities: ['sprite-candidate.v1'],
  contractVersions: ['lpc-toolkit.sprite-drawing-contract.v1'],
  limits: {
    maxCandidateBytes: 67108864,
    timeoutSeconds: 600,
    maxReferences: 8,
  },
  network: {
    required: false,
    declaredHosts: [],
  },
  credentials: {
    required: true,
    handledOutsideCli: true,
  },
} as const;

function createDirectory(prefix: string): string {
  const directory = mkdtempSync(path.join(tmpdir(), prefix));
  temporaryDirectories.push(directory);
  return directory;
}

function writeJson(root: string, name: string, value: unknown): string {
  const filePath = path.join(root, name);
  mkdirSync(path.dirname(filePath), { recursive: true });
  writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
  return filePath;
}

function writeRuntimeSource(filePath: string): void {
  const canvas = createCanvas(576, 320);
  const context = canvas.getContext('2d');
  context.fillStyle = 'rgb(80, 120, 160)';
  context.fillRect(8, 8, 48, 48);
  mkdirSync(path.dirname(filePath), { recursive: true });
  writeFileSync(filePath, canvas.toBuffer('image/png'));
}

function createRuntime(root: string, workspaceRoot: string): RuntimeAssets {
  const assetsRoot = path.join(root, 'assets');
  writeJson(root, path.join('assets', 'sheet_definitions', 'hair', 'fixture.json'), {
    name: 'Provider Fixture Hair',
    type_name: 'hair',
    animations: ['walk'],
    credits: [{
      file: 'hair/fixture',
      authors: ['Provider Fixture Artist'],
      licenses: ['GPL 3.0'],
      urls: ['https://example.test/provider-fixture'],
      notes: 'Provider fixture source.',
    }],
    layer_1: { zPos: 50, male: 'hair/fixture/' },
  });
  writeRuntimeSource(path.join(assetsRoot, 'spritesheets/hair/fixture/walk.png'));
  writeJson(root, path.join('assets', 'palette_definitions', 'skin', 'meta_skin.json'), {
    type: 'material',
    default: 'ulpc',
    base: 'light',
  });
  writeJson(root, path.join('assets', 'palette_definitions', 'skin', 'skin_ulpc.json'), {
    light: ['#775533'],
  });
  writeFileSync(
    path.join(assetsRoot, 'CREDITS.csv'),
    'filename,notes,authors,licenses,urls\nhair/fixture/walk.png,Fixture,Provider Fixture Artist,GPL 3.0,https://example.test/provider-fixture\n',
  );
  const store = createDirectoryAssetStore(assetsRoot);
  return {
    context: createRuntimeContext({
      cwd: workspaceRoot,
      assetsRoot,
      customAssetsRoot: path.join(workspaceRoot, 'assets_custom'),
      spritesheetsBaseUrl: store.baseUrl,
    }),
    store,
    source: 'working-directory',
  };
}

function sessionIdFrom(response: Record<string, unknown>): string {
  const data = response.data;
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('Missing response data.');
  const sessionId = (data as Record<string, unknown>).sessionId;
  if (typeof sessionId !== 'string') throw new Error('Missing session id.');
  return sessionId;
}

function contractDigestFrom(response: Record<string, unknown>): string {
  const data = response.data;
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('Missing contract data.');
  const checkpoint = (data as Record<string, unknown>).checkpoint;
  if (!checkpoint || typeof checkpoint !== 'object' || Array.isArray(checkpoint)) throw new Error('Missing contract checkpoint.');
  const digest = (checkpoint as Record<string, unknown>).digest;
  if (typeof digest !== 'string') throw new Error('Missing contract digest.');
  return digest;
}

async function createContractFixture(): Promise<{
  readonly root: string;
  readonly workspace: ReturnType<typeof initializeAssetWorkspace>;
  readonly sessionId: string;
  readonly contractDigest: string;
  readonly contractPath: string;
  readonly metadataPath: string;
}> {
  const root = createDirectory('lpc-provider-preflight-');
  const workspace = initializeAssetWorkspace(path.join(root, 'workspace'));
  const runtime = createRuntime(path.join(root, 'runtime'), workspace.root);
  const planPath = writeJson(root, 'plan.json', NEW_ITEM_PLAN);
  const started = await runJson([
    'asset', 'authoring', 'start', '--plan', planPath,
  ], workspace.root);
  if (started.code !== 0) throw new Error('Could not create provider session fixture.');
  const sessionId = sessionIdFrom(started.response);
  const prepareRuntimeAssets = vi.fn(async () => runtime);
  const contract = await runJson([
    'asset', 'authoring', 'contract', '--session', sessionId,
  ], workspace.root, { prepareRuntimeAssets });
  if (contract.code !== 0) throw new Error(JSON.stringify(contract.response));
  const contractDigest = contractDigestFrom(contract.response);
  const metadataPath = assetAuthoringContractMetadataPath(workspace, sessionId);
  const contractPath = path.join(path.dirname(metadataPath), 'contract.json');
  return {
    root,
    workspace,
    sessionId,
    contractDigest,
    contractPath,
    metadataPath,
  };
}

function handoffConsent(
  fixture: Awaited<ReturnType<typeof createContractFixture>>,
  overrides: Readonly<Record<string, unknown>> = {},
): Record<string, unknown> {
  const contract = JSON.parse(readFileSync(fixture.contractPath, 'utf8')) as {
    readonly targets: readonly { readonly id: string }[];
  };
  return {
    targetIds: contract.targets.map((target) => target.id),
    contractDigest: fixture.contractDigest,
    referenceDigests: [],
    network: { enabled: false, hosts: [] },
    limits: { ...VALID_DESCRIPTOR.limits },
    confirmed: true,
    ...overrides,
  };
}

async function runJson(
  argv: readonly string[],
  cwd: string,
  dependencies?: Parameters<typeof runCli>[2],
): Promise<{ readonly code: number; readonly response: Record<string, unknown>; readonly stderr: readonly string[] }> {
  const stdout: string[] = [];
  const stderr: string[] = [];
  const code = await runCli([...argv, '--json'], {
    cwd,
    stdout: (text) => stdout.push(text),
    stderr: (text) => stderr.push(text),
  }, dependencies);
  return {
    code,
    response: JSON.parse(stdout.join('')) as Record<string, unknown>,
    stderr,
  };
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe('asset provider CLI', () => {
  it('discovers explicitly supplied providers in stable order without preparing assets', async () => {
    const cwd = createDirectory('lpc-provider-discovery-');
    const descriptorsPath = writeJson(cwd, 'providers.json', [
      {
        availability: 'available',
        descriptor: {
          ...VALID_DESCRIPTOR,
          id: 'zeta.provider',
        },
      },
      {
        availability: 'available',
        descriptor: {
          ...VALID_DESCRIPTOR,
          id: 'network.provider',
          network: {
            required: true,
            declaredHosts: ['provider.example'],
          },
        },
      },
      {
        availability: 'unavailable',
        descriptor: {
          ...VALID_DESCRIPTOR,
          id: 'missing.provider',
        },
      },
      {
        availability: 'available',
        descriptor: {
          ...VALID_DESCRIPTOR,
          id: 'unsupported.provider',
          capabilities: ['other-operation.v1'],
        },
      },
    ]);
    const before = readFileSync(descriptorsPath, 'utf8');
    const beforeEntries = readdirSync(cwd).sort();
    const prepareRuntimeAssets = vi.fn(async () => {
      throw new Error('provider discovery must not prepare runtime assets');
    });

    const result = await runJson([
      'asset', 'authoring', 'provider', 'discover',
      '--session', SESSION_ID,
      '--contract-digest', CONTRACT_DIGEST,
      '--descriptors', descriptorsPath,
    ], cwd, { prepareRuntimeAssets });

    expect(result.code).toBe(0);
    expect(result.stderr).toEqual([]);
    expect(prepareRuntimeAssets).not.toHaveBeenCalled();
    expect(result.response).toMatchObject({
      ok: true,
      command: 'asset authoring provider discover',
      data: {
        sessionId: SESSION_ID,
        contractDigest: CONTRACT_DIGEST,
        cliVersion: '0.2.0',
        entries: [
          { id: 'missing.provider', status: 'unavailable' },
          { id: 'network.provider', status: 'consent-required' },
          { id: 'unsupported.provider', status: 'unsupported' },
          { id: 'zeta.provider', status: 'supported' },
        ],
      },
      warnings: [],
      errors: [],
    });
    expect(readFileSync(descriptorsPath, 'utf8')).toBe(before);
    expect(readdirSync(cwd).sort()).toEqual(beforeEntries);
  });

  it('rejects duplicate, invalid, and over-limit discovery input without partial output', async () => {
    const cwd = createDirectory('lpc-provider-discovery-invalid-');
    const duplicatePath = writeJson(cwd, 'duplicate.json', [
      { availability: 'available', descriptor: VALID_DESCRIPTOR },
      { availability: 'unavailable', descriptor: VALID_DESCRIPTOR },
    ]);
    const duplicate = await runJson([
      'asset', 'authoring', 'provider', 'discover',
      '--session', SESSION_ID,
      '--contract-digest', CONTRACT_DIGEST,
      '--descriptors', duplicatePath,
    ], cwd);
    expect(duplicate.code).toBe(1);
    expect(duplicate.response.errors).toEqual([
      expect.objectContaining({ code: 'asset_provider_schema_invalid', path: '$.entries' }),
    ]);

    const invalidPath = writeJson(cwd, 'invalid.json', [{
      availability: 'available',
      descriptor: {
        ...VALID_DESCRIPTOR,
        credentials: { required: true, handledOutsideCli: false },
      },
    }]);
    const invalid = await runJson([
      'asset', 'authoring', 'provider', 'discover',
      '--session', SESSION_ID,
      '--contract-digest', CONTRACT_DIGEST,
      '--descriptors', invalidPath,
    ], cwd);
    expect(invalid.code).toBe(1);
    expect(invalid.response.errors).toEqual([
      expect.objectContaining({ code: 'asset_provider_private_data' }),
    ]);

    const overLimitPath = writeJson(cwd, 'over-limit.json', Array.from(
      { length: 33 },
      (_, index) => ({
        availability: 'available',
        descriptor: { ...VALID_DESCRIPTOR, id: `provider-${String(index)}.example` },
      }),
    ));
    const overLimit = await runJson([
      'asset', 'authoring', 'provider', 'discover',
      '--session', SESSION_ID,
      '--contract-digest', CONTRACT_DIGEST,
      '--descriptors', overLimitPath,
    ], cwd);
    expect(overLimit.code).toBe(1);
    expect(overLimit.response.errors).toEqual([
      expect.objectContaining({ code: 'asset_provider_limit_exceeded' }),
    ]);
  });

  it('preflights the current contract read-only and checks session, scope, limits, and protected roots', async () => {
    const fixture = await createContractFixture();
    const descriptorPath = writeJson(fixture.root, 'provider.json', VALID_DESCRIPTOR);
    const sessionPath = assetAuthoringSessionPath(fixture.workspace, fixture.sessionId);
    const sessionBefore = readFileSync(sessionPath, 'utf8');
    const contractBefore = readFileSync(fixture.contractPath, 'utf8');
    const metadataBefore = readFileSync(fixture.metadataPath, 'utf8');
    const prepareRuntimeAssets = vi.fn(async () => {
      throw new Error('provider preflight must not prepare runtime assets');
    });

    const result = await runJson([
      'asset', 'authoring', 'provider', 'preflight',
      '--session', fixture.sessionId,
      '--contract-digest', fixture.contractDigest,
      '--descriptor', descriptorPath,
      '--workspace', fixture.workspace.root,
    ], fixture.workspace.root, { prepareRuntimeAssets });

    expect(result.code).toBe(0);
    expect(result.stderr).toEqual([]);
    expect(prepareRuntimeAssets).not.toHaveBeenCalled();
    expect(result.response).toMatchObject({
      ok: true,
      command: 'asset authoring provider preflight',
      data: {
        schema: 'lpc-toolkit.asset-provider-preflight.v1',
        sessionId: fixture.sessionId,
        contractDigest: fixture.contractDigest,
        status: 'supported',
        checks: {
          cliRange: true,
          capability: true,
          contractVersion: true,
          candidateBytes: true,
          references: true,
          targetScope: true,
          referenceScope: true,
          credentials: true,
          protectedRoot: true,
          network: true,
        },
        refusal: null,
      },
      warnings: [],
      errors: [],
    });
    expect(readFileSync(sessionPath, 'utf8')).toBe(sessionBefore);
    expect(readFileSync(fixture.contractPath, 'utf8')).toBe(contractBefore);
    expect(readFileSync(fixture.metadataPath, 'utf8')).toBe(metadataBefore);
    expect(existsSync(path.join(path.dirname(sessionPath), 'provider-candidates'))).toBe(false);
  });

  it('returns stable preflight statuses for consent, incompatible limits, scope, and stale or missing contracts', async () => {
    const fixture = await createContractFixture();
    const runPreflight = async (descriptor: unknown, extra: readonly string[] = []) => {
      const descriptorPath = writeJson(fixture.root, 'scenario-provider.json', descriptor);
      return runJson([
        'asset', 'authoring', 'provider', 'preflight',
        '--session', fixture.sessionId,
        '--contract-digest', fixture.contractDigest,
        '--descriptor', descriptorPath,
        '--workspace', fixture.workspace.root,
        ...extra,
      ], fixture.workspace.root);
    };

    const network = await runPreflight({
      ...VALID_DESCRIPTOR,
      network: { required: true, declaredHosts: ['provider.example'] },
    });
    expect(network.code).toBe(0);
    expect(network.response).toMatchObject({
      data: {
        status: 'consent-required',
        refusal: { code: 'asset_provider_consent_required' },
      },
    });

    const incompatibleCli = await runPreflight({
      ...VALID_DESCRIPTOR,
      adapter: { ...VALID_DESCRIPTOR.adapter, cliRange: '>=0.3.0 <0.4.0' },
    });
    expect(incompatibleCli.response).toMatchObject({
      data: {
        status: 'unsupported',
        refusal: { code: 'asset_provider_contract_mismatch' },
      },
    });

    const missingCapability = await runPreflight({
      ...VALID_DESCRIPTOR,
      capabilities: ['other-operation.v1'],
    });
    expect(missingCapability.response).toMatchObject({
      data: {
        status: 'unsupported',
        refusal: { code: 'asset_provider_capability_unsupported' },
      },
    });

    const missingContractVersion = await runPreflight({
      ...VALID_DESCRIPTOR,
      contractVersions: ['other-contract.v1'],
    });
    expect(missingContractVersion.response).toMatchObject({
      data: {
        status: 'unsupported',
        refusal: { code: 'asset_provider_contract_mismatch' },
      },
    });

    const credentialPolicy = await runPreflight({
      ...VALID_DESCRIPTOR,
      credentials: { required: true, handledOutsideCli: false },
    });
    expect(credentialPolicy.code).toBe(1);
    expect(credentialPolicy.response.errors).toEqual([
      expect.objectContaining({ code: 'asset_provider_private_data' }),
    ]);

    const limited = await runPreflight({
      ...VALID_DESCRIPTOR,
      limits: { ...VALID_DESCRIPTOR.limits, maxCandidateBytes: 1 },
    });
    expect(limited.code).toBe(0);
    expect(limited.response).toMatchObject({
      data: {
        status: 'unsupported',
        refusal: { code: 'asset_provider_scope_violation' },
      },
    });

    const targetScope = await runPreflight(VALID_DESCRIPTOR, ['--target', 'not-in-contract']);
    expect(targetScope.code).toBe(0);
    expect(targetScope.response).toMatchObject({
      data: {
        status: 'unsupported',
        refusal: { code: 'asset_provider_scope_violation' },
      },
    });

    const protectedRoot = await runPreflight(
      VALID_DESCRIPTOR,
      ['--candidate-root', path.join(fixture.workspace.root, 'assets_custom')],
    );
    expect(protectedRoot.code).toBe(0);
    expect(protectedRoot.response).toMatchObject({
      data: {
        status: 'unsupported',
        refusal: { code: 'asset_provider_scope_violation' },
      },
    });

    const stale = await runJson([
      'asset', 'authoring', 'provider', 'preflight',
      '--session', fixture.sessionId,
      '--contract-digest', CONTRACT_DIGEST,
      '--descriptor', writeJson(fixture.root, 'stale.json', VALID_DESCRIPTOR),
      '--workspace', fixture.workspace.root,
    ], fixture.workspace.root);
    expect(stale.code).toBe(1);
    expect(stale.response.errors).toEqual([
      expect.objectContaining({ code: 'asset_provider_contract_stale' }),
    ]);

    rmSync(fixture.contractPath);
    const missing = await runJson([
      'asset', 'authoring', 'provider', 'preflight',
      '--session', fixture.sessionId,
      '--contract-digest', fixture.contractDigest,
      '--descriptor', writeJson(fixture.root, 'missing.json', VALID_DESCRIPTOR),
      '--workspace', fixture.workspace.root,
    ], fixture.workspace.root);
    expect(missing.code).toBe(1);
    expect(missing.response.errors).toEqual([
      expect.objectContaining({ code: 'asset_provider_contract_missing' }),
    ]);
  });

  it('requires the consent file and explicit confirmation without mutating the session', async () => {
    const fixture = await createContractFixture();
    const descriptorPath = writeJson(fixture.root, 'handoff-provider.json', VALID_DESCRIPTOR);
    const consentPath = writeJson(fixture.root, 'handoff-consent.json', handoffConsent(fixture));
    const sessionPath = assetAuthoringSessionPath(fixture.workspace, fixture.sessionId);
    const sessionBefore = readFileSync(sessionPath, 'utf8');

    const missingConsent = await runJson([
      'asset', 'authoring', 'provider', 'handoff',
      '--session', fixture.sessionId,
      '--descriptor', descriptorPath,
      '--workspace', fixture.workspace.root,
    ], fixture.workspace.root);
    expect(missingConsent.code).toBe(1);
    expect(missingConsent.response.errors).toEqual([
      expect.objectContaining({ code: 'missing_argument', path: '--consent' }),
    ]);

    const missingConfirmation = await runJson([
      'asset', 'authoring', 'provider', 'handoff',
      '--session', fixture.sessionId,
      '--descriptor', descriptorPath,
      '--consent', consentPath,
      '--workspace', fixture.workspace.root,
    ], fixture.workspace.root);
    expect(missingConfirmation.code).toBe(0);
    expect(missingConfirmation.response).toMatchObject({
      ok: true,
      command: 'asset authoring provider handoff',
      data: {
        status: 'consent-required',
        safety: 'requires-confirmation',
        invocation: null,
        nextActions: [
          expect.objectContaining({
            safety: 'requires-confirmation',
            requiredInputs: ['confirm'],
          }),
        ],
      },
      warnings: [],
      errors: [],
    });
    expect(readFileSync(sessionPath, 'utf8')).toBe(sessionBefore);
    expect(createAssetAuthoringSessionStore(fixture.workspace).read(fixture.sessionId).receipts)
      .toMatchObject({ providerInvocation: null, providerResult: null });
    expect(existsSync(path.join(path.dirname(sessionPath), 'provider-candidates'))).toBe(false);
  });

  it('persists one bounded invocation and reuses it for an unchanged scope', async () => {
    const fixture = await createContractFixture();
    const descriptorPath = writeJson(fixture.root, 'handoff-provider.json', VALID_DESCRIPTOR);
    const consentPath = writeJson(fixture.root, 'handoff-consent.json', handoffConsent(fixture));
    const handoff = async (extra: readonly string[] = []) => runJson([
      'asset', 'authoring', 'provider', 'handoff',
      '--session', fixture.sessionId,
      '--descriptor', descriptorPath,
      '--consent', consentPath,
      '--workspace', fixture.workspace.root,
      '--confirm',
      ...extra,
    ], fixture.workspace.root);

    const created = await handoff();
    expect(created.code).toBe(0);
    expect(created.response).toMatchObject({
      ok: true,
      command: 'asset authoring provider handoff',
      data: {
        status: 'created',
        safety: 'safe',
        invocationDigest: expect.stringMatching(/^sha256:[0-9a-f]{64}$/u),
        invocation: {
          schema: 'lpc-toolkit.asset-provider-invocation.v1',
          sessionId: fixture.sessionId,
          contractDigest: fixture.contractDigest,
          provider: {
            id: VALID_DESCRIPTOR.id,
            adapter: {
              id: VALID_DESCRIPTOR.adapter.id,
              version: VALID_DESCRIPTOR.adapter.version,
            },
          },
          targetIds: [expect.any(String)],
          consent: {
            confirmed: true,
            network: { enabled: false, hosts: [] },
            referenceDigests: [],
          },
          candidate: {
            stagingId: `${VALID_DESCRIPTOR.id}/${fixture.sessionId}`,
            targetIds: [expect.any(String)],
          },
        },
        nextActions: [],
      },
    });
    const createdData = created.response.data as Record<string, unknown>;
    const createdInvocation = createdData.invocation as Record<string, unknown>;
    const sessionAfterCreate = createAssetAuthoringSessionStore(fixture.workspace).read(fixture.sessionId);
    expect(sessionAfterCreate.receipts.providerInvocation).toEqual(createdInvocation);
    expect(sessionAfterCreate.receipts.providerResult).toBeNull();

    const sessionBeforeRetry = readFileSync(
      assetAuthoringSessionPath(fixture.workspace, fixture.sessionId),
      'utf8',
    );
    const reused = await handoff();
    expect(reused.code).toBe(0);
    expect(reused.response).toMatchObject({
      ok: true,
      data: {
        status: 'reused',
        invocation: createdInvocation,
        invocationDigest: createdData.invocationDigest,
        safety: 'safe',
        nextActions: [],
      },
    });
    expect(readFileSync(assetAuthoringSessionPath(fixture.workspace, fixture.sessionId), 'utf8'))
      .toBe(sessionBeforeRetry);
  });

  it('requires new consent for provider changes and refuses expanded scopes', async () => {
    const fixture = await createContractFixture();
    const descriptorPath = writeJson(fixture.root, 'handoff-provider.json', VALID_DESCRIPTOR);
    const consentPath = writeJson(fixture.root, 'handoff-consent.json', handoffConsent(fixture));
    const initial = await runJson([
      'asset', 'authoring', 'provider', 'handoff',
      '--session', fixture.sessionId,
      '--descriptor', descriptorPath,
      '--consent', consentPath,
      '--workspace', fixture.workspace.root,
      '--confirm',
    ], fixture.workspace.root);
    expect(initial.code).toBe(0);
    const sessionPath = assetAuthoringSessionPath(fixture.workspace, fixture.sessionId);
    const sessionBeforeChanges = readFileSync(sessionPath, 'utf8');

    const changedDescriptorPath = writeJson(fixture.root, 'changed-provider.json', {
      ...VALID_DESCRIPTOR,
      id: 'provider.changed',
      adapter: { ...VALID_DESCRIPTOR.adapter, id: 'agent-adapter.changed', version: '2.0.0' },
    });
    const changedProviderConsentPath = writeJson(
      fixture.root,
      'changed-provider-consent.json',
      handoffConsent(fixture, { confirmed: false }),
    );
    const changedProvider = await runJson([
      'asset', 'authoring', 'provider', 'handoff',
      '--session', fixture.sessionId,
      '--descriptor', changedDescriptorPath,
      '--consent', changedProviderConsentPath,
      '--workspace', fixture.workspace.root,
    ], fixture.workspace.root);
    expect(changedProvider.code).toBe(0);
    expect(changedProvider.response).toMatchObject({
      data: { status: 'consent-required', safety: 'requires-confirmation', invocation: null },
    });
    expect(readFileSync(sessionPath, 'utf8')).toBe(sessionBeforeChanges);

    const expandedCases: readonly [string, Record<string, unknown>, string][] = [
      ['reference', { referenceDigests: [`sha256:${'b'.repeat(64)}`] }, 'asset_provider_scope_violation'],
      ['network', { network: { enabled: true, hosts: ['provider.example'] } }, 'asset_provider_network_denied'],
      ['target', { targetIds: [
        ...(JSON.parse(readFileSync(fixture.contractPath, 'utf8')) as {
          readonly targets: readonly { readonly id: string }[];
        }).targets.map((target) => target.id),
        'acme.provider-fixture/acme.provider-fixture--moon-braid/foreground/male/extra/extra/default',
      ] }, 'asset_provider_scope_violation'],
      ['limit', { limits: { ...VALID_DESCRIPTOR.limits, maxCandidateBytes: VALID_DESCRIPTOR.limits.maxCandidateBytes } }, 'asset_provider_scope_violation'],
    ];
    const limitedDescriptorPath = writeJson(fixture.root, 'limited-provider.json', {
      ...VALID_DESCRIPTOR,
      limits: { ...VALID_DESCRIPTOR.limits, maxCandidateBytes: VALID_DESCRIPTOR.limits.maxCandidateBytes - 1 },
    });
    for (const [label, overrides, code] of expandedCases) {
      const expandedConsentPath = writeJson(
        fixture.root,
        `expanded-${label}.json`,
        handoffConsent(fixture, overrides),
      );
      const expanded = await runJson([
        'asset', 'authoring', 'provider', 'handoff',
        '--session', fixture.sessionId,
        '--descriptor', label === 'limit' ? limitedDescriptorPath : descriptorPath,
        '--consent', expandedConsentPath,
        '--workspace', fixture.workspace.root,
        '--confirm',
      ], fixture.workspace.root);
      expect(expanded.code, label).toBe(0);
      expect(expanded.response).toMatchObject({
        ok: true,
        data: { status: 'unsupported', refusal: { code } },
      });
      expect(readFileSync(sessionPath, 'utf8'), label).toBe(sessionBeforeChanges);
    }

    const changedProviderConfirmedPath = writeJson(
      fixture.root,
      'changed-provider-confirmed-consent.json',
      handoffConsent(fixture),
    );
    const changedProviderConfirmed = await runJson([
      'asset', 'authoring', 'provider', 'handoff',
      '--session', fixture.sessionId,
      '--descriptor', changedDescriptorPath,
      '--consent', changedProviderConfirmedPath,
      '--workspace', fixture.workspace.root,
      '--confirm',
    ], fixture.workspace.root);
    expect(changedProviderConfirmed.code).toBe(0);
    expect(changedProviderConfirmed.response).toMatchObject({
      data: {
        status: 'created',
        invocation: {
          provider: {
            id: 'provider.changed',
            adapter: { id: 'agent-adapter.changed', version: '2.0.0' },
          },
        },
      },
    });
    const sessionAfterProviderChange = readFileSync(sessionPath, 'utf8');
    expect(sessionAfterProviderChange).not.toBe(sessionBeforeChanges);

    const staleContractConsentPath = writeJson(
      fixture.root,
      'stale-contract-consent.json',
      handoffConsent(fixture, { contractDigest: CONTRACT_DIGEST }),
    );
    const staleContract = await runJson([
      'asset', 'authoring', 'provider', 'handoff',
      '--session', fixture.sessionId,
      '--descriptor', descriptorPath,
      '--consent', staleContractConsentPath,
      '--workspace', fixture.workspace.root,
      '--confirm',
    ], fixture.workspace.root);
    expect(staleContract.code).toBe(1);
    expect(staleContract.response.errors).toEqual([
      expect.objectContaining({ code: 'asset_provider_contract_mismatch' }),
    ]);
    expect(readFileSync(sessionPath, 'utf8')).toBe(sessionAfterProviderChange);
  });
});
