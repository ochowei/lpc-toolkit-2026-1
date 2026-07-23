import { describe, expect, it, vi } from 'vitest';
import {
  ASSET_PACK_ARCHIVE_LIMITS,
  createAssetPackArchive,
  type AssetPackFormatRuntime,
  type AssetPackPngDecoder,
} from '@lpc-toolkit/asset-pack-format';
import { createCatalog, createPaletteCatalog } from '@lpc-toolkit/core';
import { createBrowserAssetPackFormatRuntime } from '../src/adapter/asset-pack-format-runtime';
import type { AssetPackWorkerBaseline, AssetPackWorkerResponse } from '../src/lib/asset-pack-worker-protocol';
import {
  createAssetPackWorkerSession,
  openAssetPackWorkerSession,
  type AssetPackWorkerSession,
} from '../src/workers/asset-pack-worker-session';

const SOURCE_PATH = 'sprites/demo/foreground/walk.png';
const CREDITS = {
  authors: ['Alice'],
  licenses: ['CC-BY-SA 4.0'],
  urls: ['https://example.com/alice'],
  notes: 'Demo credit.',
} as const;

const manifest = {
  schema: 'lpc-toolkit.asset-pack.v1',
  id: 'acme.demo',
  version: '1.0.0',
  displayName: 'ACME Demo',
  credits: CREDITS,
  assets: [{
    kind: 'new-item',
    localId: 'demo',
    displayName: 'Demo',
    typeName: 'hair',
    bodyTypes: ['male', 'female'],
    animations: ['walk'],
    layers: [{
      id: 'foreground',
      zPos: 100,
      sprites: [{ animation: 'walk', source: SOURCE_PATH }],
    }],
  }],
} as const;

function sha(value: string): `sha256:${string}` {
  return `sha256:${value.repeat(64)}`;
}

function runtime(): AssetPackFormatRuntime {
  return createBrowserAssetPackFormatRuntime({ crypto: globalThis.crypto });
}

function decoder(options?: { readonly error?: boolean }): AssetPackPngDecoder {
    return {
    decode: async () => {
      if (options?.error) throw new Error('decode failed');
      return {
        width: 576,
        height: 256,
        pixels: new Uint8ClampedArray(576 * 256 * 4).fill(255),
      };
    },
  };
}

function baseline(): AssetPackWorkerBaseline {
  const catalog = createCatalog({
    'hair/base.json': {
      name: 'base',
      type_name: 'hair',
      animations: ['walk'],
      credits: [],
      layer_1: { zPos: 1, male: 'base/', female: 'base/' },
    },
  }).catalog;
  const palettes = createPaletteCatalog({}).palettes;
  return {
    releaseTag: 'assets-v2026.06.05-initial',
    cliVersion: '0.0.0',
    catalog,
    palettes,
    definitionDigests: new Map<string, `sha256:${string}`>(),
    creditDigests: new Map<string, `sha256:${string}`>(),
  };
}

function file(bytes: Uint8Array, name = 'asset-pack.zip'): File {
  return new File([bytes], name, { type: 'application/zip' });
}

function validPngHeader(): Uint8Array {
  const bytes = new Uint8Array(33);
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const view = new DataView(bytes.buffer);
  view.setUint32(8, 13);
  bytes.set([0x49, 0x48, 0x44, 0x52], 12);
  view.setUint32(16, 576);
  view.setUint32(20, 256);
  bytes.set([8, 6, 0, 0, 0], 24);
  view.setUint32(29, pngCrc32(bytes.subarray(12, 29)));
  return bytes;
}

function pngCrc32(bytes: Uint8Array): number {
  let crc = 0xffff_ffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ ((crc & 1) === 0 ? 0 : 0xedb8_8320);
  }
  return (crc ^ 0xffff_ffff) >>> 0;
}

function deferred<T>(): {
  readonly promise: Promise<T>;
  readonly resolve: (value: T) => void;
} {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

async function archiveFor(
  document: Readonly<Record<string, unknown>> = manifest,
  sources: ReadonlyMap<string, Uint8Array> = new Map([[SOURCE_PATH, validPngHeader()]]),
): Promise<File> {
  const created = await createAssetPackArchive({
    kind: document.status === 'draft' ? 'draft' : 'formal',
    manifestDocument: document,
    sourceBytes: sources,
    runtime: runtime(),
  });
  return file(created.archiveBytes);
}

async function open(
  input: File,
  options?: { readonly decoder?: AssetPackPngDecoder },
): Promise<{ readonly session?: AssetPackWorkerSession; readonly responses: readonly AssetPackWorkerResponse[] }> {
  return openAssetPackWorkerSession({
    file: input,
    baseline: baseline(),
    runtime: runtime(),
    decoder: options?.decoder ?? decoder(),
    requestId: 1,
  });
}

describe('asset-pack Worker session', () => {
  it('size-gates before reading an oversized File', async () => {
    const arrayBuffer = vi.fn(async () => new ArrayBuffer(0));
    const result = await open({
      size: ASSET_PACK_ARCHIVE_LIMITS.archiveBytes + 1,
      arrayBuffer,
    } as unknown as File);
    expect(arrayBuffer).not.toHaveBeenCalled();
    expect(result.session).toBeUndefined();
    expect(result.responses).toContainEqual(expect.objectContaining({
      type: 'session',
      outcome: 'unsafe',
      diagnostics: [expect.objectContaining({ code: 'asset_archive_limit_exceeded' })],
    }));
  });

  it('does not create a session for unsafe archive metadata', async () => {
    const result = await open(file(new Uint8Array([1, 2, 3])));
    expect(result.session).toBeUndefined();
    expect(result.responses[0]).toMatchObject({ type: 'session', outcome: 'unsafe', revision: 0 });
  });

  it('opens safe checksum/schema failures in repair mode with source summaries', async () => {
    const valid = await archiveFor();
    const bytes = new Uint8Array(await valid.arrayBuffer());
    bytes[bytes.length - 1] = 0;
    const result = await open(file(bytes));
    expect(result.session).toBeDefined();
    expect(result.responses).toContainEqual(expect.objectContaining({ type: 'session', outcome: 'editing' }));
    const sessionResponse = result.responses.find((response) => response.type === 'session' && response.outcome === 'editing');
    expect(sessionResponse).toMatchObject({ revision: 0 });
    if (sessionResponse?.type === 'session' && sessionResponse.outcome === 'editing') {
      expect(sessionResponse.workbench.sourceSummaries).toEqual(expect.arrayContaining([
        expect.objectContaining({ path: SOURCE_PATH, byteLength: 33 }),
      ]));
    }
  });

  it('preserves uploaded archive digest, version/status, and baseline release tag', async () => {
    const formal = await archiveFor();
    const draft = await archiveFor({ ...manifest, status: 'draft' });
    for (const input of [formal, draft]) {
      const result = await open(input);
      const response = result.responses.find((candidate) => candidate.type === 'session' && candidate.outcome === 'editing');
      expect(response).toMatchObject({ type: 'session', outcome: 'editing' });
      if (response?.type !== 'session' || response.outcome !== 'editing') continue;
      expect(response.workbench.manifestText).toContain('1.0.0');
      expect(response.workbench.diagnostics).not.toEqual(expect.arrayContaining([
        expect.objectContaining({ code: 'asset_pack_baseline_release_missing' }),
      ]));
    }
  });

  it('opens invalid JSON and non-object manifests as raw repair without draft serialization', async () => {
    const raw = await archiveFor({ ...manifest, status: 'draft' });
    const bytes = new Uint8Array(await raw.arrayBuffer());
    const result = await open(file(bytes));
    expect(result.session).toBeDefined();

    const rawResult = await result.session?.replaceManifest({
      requestId: 2,
      revision: 1,
      manifestText: '{not-json',
      origin: 'raw-repair',
    });
    expect(rawResult).toContainEqual(expect.objectContaining({
      type: 'session',
      outcome: 'editing',
    }));
    const editing = rawResult?.find((response) => response.type === 'session' && response.outcome === 'editing');
    if (editing?.type === 'session' && editing.outcome === 'editing') {
      expect(editing.workbench.draftSerializable).toBe(false);
      expect(editing.workbench.diagnostics).toContainEqual(expect.objectContaining({ code: 'asset_pack_manifest_json_invalid' }));
    }
  });

  it('accepts only monotonic revisions, copies source bytes, and reports source diagnostics', async () => {
    const result = await open(await archiveFor());
    const session = result.session;
    expect(session).toBeDefined();
    if (!session) return;
    const stale = await session.removeSource({ requestId: 2, revision: 2, path: SOURCE_PATH });
    expect(stale).toContainEqual(expect.objectContaining({ type: 'failed', revision: 2 }));
    expect(stale).toContainEqual(expect.objectContaining({ diagnostic: expect.objectContaining({ code: 'asset_worker_stale_revision' }) }));

    const replacement = new Uint8Array([9, 8, 7]);
    const accepted = await session.replaceSource({ requestId: 3, revision: 1, path: SOURCE_PATH, file: file(replacement, 'replacement.png') });
    replacement[0] = 1;
    expect(accepted).toContainEqual(expect.objectContaining({ type: 'session', revision: 1 }));
    const response = accepted.find((item) => item.type === 'session' && item.outcome === 'editing');
    if (response?.type === 'session' && response.outcome === 'editing') {
      expect(response.workbench.sourceSummaries).toEqual(expect.arrayContaining([
        expect.objectContaining({ path: SOURCE_PATH, byteLength: 3 }),
      ]));
    }

    const removed = await session.removeSource({ requestId: 4, revision: 2, path: SOURCE_PATH });
    const removedResponse = removed.find((item) => item.type === 'session' && item.outcome === 'editing');
    if (removedResponse?.type === 'session' && removedResponse.outcome === 'editing') {
      expect(removedResponse.workbench.sourceSummaries).toEqual(expect.arrayContaining([
        expect.objectContaining({ path: SOURCE_PATH, state: 'missing' }),
      ]));
    }
  });

  it('rejects direct acknowledgement edits and accepts governed candidates only', async () => {
    const result = await open(await archiveFor());
    const session = result.session;
    expect(session).toBeDefined();
    if (!session) return;
    const manifestText = JSON.stringify({ ...manifest, acknowledgements: [{
      code: 'asset_optional_frame_blank',
      subject: { assetId: 'acme.demo--demo' },
      contentDigest: sha('old'),
      reason: 'not allowed',
    }] });
    const forbidden = await session.replaceManifest({ requestId: 2, revision: 1, manifestText, origin: 'advanced-json' });
    expect(forbidden).toContainEqual(expect.objectContaining({ diagnostic: expect.objectContaining({ code: 'asset_acknowledgement_edit_forbidden' }) }));
  });

  it('rejects acknowledgement injection when the current manifest is invalid', async () => {
    const result = await open(await archiveFor());
    const session = result.session;
    expect(session).toBeDefined();
    if (!session) return;

    await session.replaceManifest({
      requestId: 2,
      revision: 1,
      manifestText: '{not-json',
      origin: 'raw-repair',
    });
    const injected = await session.replaceManifest({
      requestId: 3,
      revision: 2,
      manifestText: JSON.stringify({
        ...manifest,
        acknowledgements: [{
          code: 'asset_optional_frame_blank',
          subject: { assetId: 'acme.demo--demo' },
          contentDigest: sha('forged'),
          reason: 'forged acknowledgement',
        }],
      }),
      origin: 'advanced-json',
    });

    expect(injected).toContainEqual(expect.objectContaining({
      requestId: 3,
      revision: 2,
      diagnostic: expect.objectContaining({ code: 'asset_acknowledgement_edit_forbidden' }),
    }));
  });

  it('rejects acknowledgement-origin edits that change unrelated manifest fields', async () => {
    const result = await open(await archiveFor());
    const session = result.session;
    expect(session).toBeDefined();
    if (!session) return;

    const forbidden = await session.replaceManifest({
      requestId: 2,
      revision: 1,
      manifestText: JSON.stringify({ ...manifest, version: '2.0.0', acknowledgements: [] }),
      origin: 'acknowledgement',
    });

    expect(forbidden).toContainEqual(expect.objectContaining({
      requestId: 2,
      revision: 1,
      diagnostic: expect.objectContaining({ code: 'asset_acknowledgement_edit_forbidden' }),
    }));
  });

  it('serializes same-revision source edits and rejects the later stale request', async () => {
    const result = await open(await archiveFor());
    const session = result.session;
    expect(session).toBeDefined();
    if (!session) return;

    const gate = deferred<ArrayBuffer>();
    const first = session.replaceSource({
      requestId: 2,
      revision: 1,
      path: SOURCE_PATH,
      file: { size: 3, arrayBuffer: () => gate.promise } as unknown as File,
    });
    await Promise.resolve();
    const second = session.replaceSource({
      requestId: 3,
      revision: 1,
      path: SOURCE_PATH,
      file: file(new Uint8Array([4, 5, 6]), 'replacement.png'),
    });
    gate.resolve(new Uint8Array([1, 2, 3]).buffer);

    const [firstResponses, secondResponses] = await Promise.all([first, second]);
    expect(firstResponses).toContainEqual(expect.objectContaining({
      type: 'session',
      requestId: 2,
      revision: 1,
    }));
    expect(secondResponses).toContainEqual(expect.objectContaining({
      type: 'failed',
      requestId: 3,
      revision: 1,
      diagnostic: expect.objectContaining({ code: 'asset_worker_stale_revision' }),
    }));
  });

  it('rejects oversized source files before reading them', async () => {
    const result = await open(await archiveFor());
    const session = result.session;
    expect(session).toBeDefined();
    if (!session) return;

    const arrayBuffer = vi.fn(async () => new ArrayBuffer(0));
    const responses = await session.replaceSource({
      requestId: 2,
      revision: 1,
      path: SOURCE_PATH,
      file: {
        size: ASSET_PACK_ARCHIVE_LIMITS.entryBytes + 1,
        arrayBuffer,
      } as unknown as File,
    });

    expect(arrayBuffer).not.toHaveBeenCalled();
    expect(responses).toContainEqual(expect.objectContaining({
      diagnostic: expect.objectContaining({ code: 'asset_archive_limit_exceeded' }),
    }));
  });

  it('rejects unsafe source paths before reading them', async () => {
    const result = await open(await archiveFor());
    const session = result.session;
    expect(session).toBeDefined();
    if (!session) return;

    const arrayBuffer = vi.fn(async () => new ArrayBuffer(1));
    const responses = await session.replaceSource({
      requestId: 2,
      revision: 1,
      path: 'sprites/../escape.png',
      file: { size: 1, arrayBuffer } as unknown as File,
    });

    expect(arrayBuffer).not.toHaveBeenCalled();
    expect(responses).toContainEqual(expect.objectContaining({
      diagnostic: expect.objectContaining({ code: 'asset_archive_unsafe' }),
    }));
  });

  it('rejects replacements that would exceed the source entry count before reading them', async () => {
    const sourceBytes = new Map<string, Uint8Array>();
    for (let index = 0; index < ASSET_PACK_ARCHIVE_LIMITS.entries - 2; index += 1) {
      sourceBytes.set(`sprites/fill-${String(index)}.png`, new Uint8Array());
    }
    const session = createAssetPackWorkerSession({
      baseline: baseline(),
      manifestText: '{not-json',
      sourceBytes,
      runtime: runtime(),
      decoder: decoder(),
    });
    const arrayBuffer = vi.fn(async () => new ArrayBuffer(1));
    const responses = await session.replaceSource({
      requestId: 1,
      revision: 1,
      path: 'sprites/new.png',
      file: { size: 1, arrayBuffer } as unknown as File,
    });

    expect(arrayBuffer).not.toHaveBeenCalled();
    expect(responses).toContainEqual(expect.objectContaining({
      diagnostic: expect.objectContaining({ code: 'asset_archive_limit_exceeded' }),
    }));
  });

  it('returns previews only without errors, maps every destination to current bytes, and includes release fingerprint credits', async () => {
    const result = await open(await archiveFor(), { decoder: decoder() });
    const session = result.session;
    expect(session).toBeDefined();
    if (!session) return;
    const response = result.responses.find((item) => item.type === 'session' && item.outcome === 'editing');
    if (response?.type === 'session' && response.outcome === 'editing') {
      expect(response.workbench.preview).toBeDefined();
      expect(response.workbench.preview?.sources).toEqual(expect.arrayContaining([
        expect.objectContaining({ sourcePath: SOURCE_PATH, bytes: expect.any(Uint8Array) }),
      ]));
      expect(response.workbench.preview?.compilePlan.credits.length).toBeGreaterThan(0);
      expect(response.workbench.releaseFingerprint).toMatch(/^sha256:/u);
    }
    const bad = await session.replaceSource({ requestId: 2, revision: 1, path: SOURCE_PATH, file: file(new Uint8Array([1])) });
    const badResponse = bad.find((item) => item.type === 'session' && item.outcome === 'editing');
    if (badResponse?.type === 'session' && badResponse.outcome === 'editing') {
      expect(badResponse.workbench.preview).toBeUndefined();
      expect(badResponse.workbench.diagnostics.some((diagnostic) => diagnostic.severity === 'error')).toBe(true);
    }
  });

  it('caches formal candidates only after readback and assembles draft/formal bytes', async () => {
    const result = await open(await archiveFor(), { decoder: decoder() });
    const session = result.session;
    expect(session).toBeDefined();
    if (!session) return;
    const initial = result.responses.find((item) => item.type === 'session' && item.outcome === 'editing');
    if (initial?.type === 'session' && initial.outcome === 'editing') {
      expect(initial.workbench.formalCandidate).toBeDefined();
    }
    const formal = await session.assemble({ requestId: 2, revision: 0, kind: 'formal' });
    expect(formal).toContainEqual(expect.objectContaining({ type: 'assembled', kind: 'formal', revision: 0 }));
    const draft = await session.assemble({ requestId: 3, revision: 0, kind: 'draft' });
    expect(draft).toContainEqual(expect.objectContaining({ type: 'assembled', kind: 'draft', revision: 0 }));
    const stale = await session.assemble({ requestId: 4, revision: 1, kind: 'formal' });
    expect(stale).toContainEqual(expect.objectContaining({ diagnostic: expect.objectContaining({ code: 'candidate-not-verified' }) }));
  });

  it('wires worker requests to one session and preserves request IDs and revisions', async () => {
    const { createAssetPackWorkerHandler } = await import('../src/workers/asset-pack-worker');
    const posted: AssetPackWorkerResponse[] = [];
    const handler = createAssetPackWorkerHandler({
      postMessage: (response) => posted.push(response),
      baseline: baseline(),
      runtime: runtime(),
      decoder: decoder(),
    });
    const input = await archiveFor();
    await handler({ data: { type: 'open', requestId: 9, revision: 0, file: input, baseline: baseline() } });
    expect(posted.some((response) => response.requestId === 9 && response.revision === 0)).toBe(true);
  });
});
