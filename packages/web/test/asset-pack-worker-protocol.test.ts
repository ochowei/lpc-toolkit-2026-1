import { describe, expect, it } from 'vitest';
import type { AssetPackWorkerRequest, AssetPackWorkerResponse } from '../src/lib/asset-pack-worker-protocol';
import { isAssetPackWorkerRequest, isAssetPackWorkerResponse } from '../src/lib/asset-pack-worker-protocol';

describe('asset-pack Worker protocol', () => {
  it('keeps requests and responses structured-clone serializable with IDs and revisions', () => {
    const request: AssetPackWorkerRequest = {
      type: 'remove-source',
      requestId: 12,
      revision: 3,
      path: 'sprites/acme/walk.png',
    };
    const response: AssetPackWorkerResponse = {
      type: 'failed',
      requestId: 12,
      revision: 3,
      diagnostic: {
        code: 'asset_worker_stale_revision',
        severity: 'error',
        message: 'The request is stale.',
        scope: 'release',
      },
    };

    expect(isAssetPackWorkerRequest(request)).toBe(true);
    expect(isAssetPackWorkerResponse(response)).toBe(true);
    expect(structuredClone(request)).toEqual(request);
    expect(structuredClone(response)).toEqual(response);
  });

  it('rejects protocol values without a numeric request ID and revision', () => {
    expect(isAssetPackWorkerRequest({ type: 'remove-source', path: 'x' })).toBe(false);
    expect(isAssetPackWorkerResponse({ type: 'progress', stage: 'reading-archive' })).toBe(false);
  });

  it('allows preview bytes only as referenced destination mappings', () => {
    const response: AssetPackWorkerResponse = {
      type: 'session',
      requestId: 1,
      revision: 0,
      outcome: 'editing',
      workbench: {
        revision: 0,
        manifestText: '{}',
        sourceSummaries: [],
        diagnostics: [],
        acknowledgementRecords: [],
        draftSerializable: false,
        preview: {
          revision: 0,
          packId: 'acme.demo',
          compilePlan: {
            definitions: [],
            sprites: [],
            credits: [],
            ownership: [],
            diagnostics: [],
          },
          sources: [{
            destinationPath: 'spritesheets/acme/demo.png',
            sourcePath: 'sprites/demo.png',
            bytes: new Uint8Array([1, 2]),
          }],
        },
      },
    };
    expect(structuredClone(response)).toEqual(response);
    expect(response.type).toBe('session');
  });
});
