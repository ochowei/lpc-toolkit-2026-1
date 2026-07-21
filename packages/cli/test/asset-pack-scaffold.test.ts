import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type {
  CliResponse,
} from '../src/response.js';
import type {
  AssetAnimationAuditReport,
  BlankAnimationFramesFinding,
  MissingAnimationFileFinding,
} from '../src/animation-audit.js';
import {
  scaffoldAuditAssetPack,
  scaffoldNewAssetPack,
  type AuditAssetPackScaffoldRequest,
  type NewAssetPackScaffoldRequest,
} from '../src/asset-pack-scaffold.js';

const temporaryDirectories: string[] = [];

const PACK_CREDITS = {
  authors: ['Alice'],
  licenses: ['CC-BY-SA 4.0'],
  urls: ['https://example.com/alice'],
  notes: '',
} as const;

function createDirectory(prefix: string): string {
  const directory = mkdtempSync(path.join(os.tmpdir(), prefix));
  temporaryDirectories.push(directory);
  return directory;
}

function readJson(filePath: string): unknown {
  return JSON.parse(readFileSync(filePath, 'utf8')) as unknown;
}

function newRequest(target: string, advanced = false): NewAssetPackScaffoldRequest {
  return {
    packId: 'acme.wind-braid',
    version: '1.0.0',
    displayName: 'ACME Wind Braid',
    localId: 'wind-braid',
    typeName: 'hair',
    bodyTypes: ['male', 'female'],
    animations: ['walk', 'climb'],
    credits: PACK_CREDITS,
    advanced,
    outputDirectory: path.join(target, 'acme.wind-braid'),
  };
}

function auditEnvelope(
  report: Partial<AssetAnimationAuditReport>,
  overrides?: Partial<CliResponse<AssetAnimationAuditReport>>,
): CliResponse<AssetAnimationAuditReport> {
  return {
    ok: true,
    command: 'catalog audit-animations',
    warnings: [],
    errors: [],
    data: {
      targets: ['walk', 'climb'],
      scope: {},
      summary: {
        itemsScanned: 2,
        incompleteItems: 1,
        unsupported: 0,
        missingFiles: 0,
        blankFrames: 0,
        errors: 0,
      },
      unsupported: [],
      missingFiles: [],
      blankFrames: [],
      errors: [],
      ...report,
    },
    ...overrides,
  };
}

function writeAuditReport(filePath: string, value: unknown): void {
  mkdirSync(path.dirname(filePath), { recursive: true });
  writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function missingFinding(
  pathName: string,
  consumers: MissingAnimationFileFinding['consumers'],
): MissingAnimationFileFinding {
  return {
    path: pathName,
    animation: 'climb',
    sourceAnimation: 'walk',
    consumers,
  };
}

function blankFinding(
  pathName: string,
  consumers: BlankAnimationFramesFinding['consumers'],
): BlankAnimationFramesFinding {
  return {
    path: pathName,
    animation: 'climb',
    sourceAnimation: 'walk',
    sourceRow: 0,
    direction: 'down',
    frames: [{ sourceColumn: 0, logicalFrameIndices: [0] }],
    consumers,
  };
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe('scaffoldNewAssetPack', () => {
  it('publishes a simple scaffold with one foreground layer, no recolor, and no blank PNG files', () => {
    const target = createDirectory('lpc-asset-pack-scaffold-new-');

    const result = scaffoldNewAssetPack(newRequest(target));

    expect(result).toMatchObject({
      ok: true,
      packRoot: path.join(target, 'acme.wind-braid'),
      manifestPath: path.join(target, 'acme.wind-braid', 'asset-pack.json'),
    });
    if (!result.ok) throw new Error('Expected scaffold to succeed.');

    expect(readJson(result.manifestPath)).toEqual({
      schema: 'lpc-toolkit.asset-pack.v1',
      id: 'acme.wind-braid',
      version: '1.0.0',
      displayName: 'ACME Wind Braid',
      credits: PACK_CREDITS,
      assets: [{
        kind: 'new-item',
        localId: 'wind-braid',
        displayName: 'Wind Braid',
        typeName: 'hair',
        bodyTypes: ['male', 'female'],
        animations: ['walk', 'climb'],
        layers: [{
          id: 'foreground',
          zPos: 120,
          sprites: [
            { animation: 'walk', source: 'sprites/wind-braid/foreground/walk.png' },
            { animation: 'climb', source: 'sprites/wind-braid/foreground/climb.png' },
          ],
        }],
      }],
    });
    expect(existsSync(path.join(result.packRoot, 'sprites', 'wind-braid', 'foreground'))).toBe(true);
    expect(readdirSync(path.join(result.packRoot, 'sprites', 'wind-braid', 'foreground'))).toEqual([]);
    expect(existsSync(path.join(result.packRoot, 'README.md'))).toBe(false);
  });

  it('publishes an advanced scaffold with sibling README documentation while keeping asset-pack.json strict JSON', () => {
    const target = createDirectory('lpc-asset-pack-scaffold-advanced-');

    const result = scaffoldNewAssetPack(newRequest(target, true));

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('Expected scaffold to succeed.');
    const manifestText = readFileSync(result.manifestPath, 'utf8');
    expect(manifestText).not.toContain('\n//');
    expect(manifestText).not.toContain('recolor');
    expect(manifestText).not.toContain('variants');
    expect(manifestText).not.toContain('creditOverrides');
    expect(readFileSync(path.join(result.packRoot, 'README.md'), 'utf8')).toContain('Optional next steps');
  });

  it('refuses to publish over an existing pack and leaves no sibling temporary directory behind', () => {
    const target = createDirectory('lpc-asset-pack-scaffold-existing-');
    const packRoot = path.join(target, 'acme.wind-braid');
    mkdirSync(packRoot, { recursive: true });
    writeFileSync(path.join(packRoot, 'keep.txt'), 'existing');

    const result = scaffoldNewAssetPack(newRequest(target));

    expect(result).toEqual({
      ok: false,
      diagnostics: [
        expect.objectContaining({
          code: 'asset_pack_output_exists_v1',
          path: packRoot,
        }),
      ],
    });
    expect(readFileSync(path.join(packRoot, 'keep.txt'), 'utf8')).toBe('existing');
    expect(
      readdirSync(target).filter((entry) => entry !== 'acme.wind-braid'),
    ).toEqual([]);
  });
});

describe('scaffoldAuditAssetPack', () => {
  it('builds audit-derived extend-item scaffolds from exact missing files and inferred unsupported paths', () => {
    const target = createDirectory('lpc-asset-pack-scaffold-audit-');
    const reportPath = path.join(target, 'audit.json');
    writeAuditReport(reportPath, auditEnvelope({
      summary: {
        itemsScanned: 2,
        incompleteItems: 2,
        unsupported: 1,
        missingFiles: 1,
        blankFrames: 0,
        errors: 1,
      },
      unsupported: [{
        itemId: 'hair_messy',
        typeName: 'hair',
        animation: 'climb',
        nativeAnimations: ['walk'],
        compatibleAnimations: ['walk'],
        requirements: [{
          itemId: 'hair_messy',
          typeName: 'hair',
          layer: 'layer_1',
          bodyTypes: ['female'],
          variant: 'dark brown',
          recolors: ['primary'],
          expectedPath: 'spritesheets/hair/messy/climb/dark_brown.png',
          pathConfidence: 'inferred',
        }, {
          itemId: 'hair_messy',
          typeName: 'hair',
          layer: 'layer_1',
          bodyTypes: ['male'],
          variant: 'dark brown',
          recolors: ['primary'],
          expectedPath: 'spritesheets/hair/messy/climb/dark_brown.png',
          pathConfidence: 'inferred',
        }],
      }],
      missingFiles: [missingFinding(
        'spritesheets/hair/messy/climb/front.png',
        [{
          itemId: 'hair_messy',
          typeName: 'hair',
          layer: 'layer_2',
          bodyTypes: ['female', 'male'],
          recolors: ['secondary'],
        }],
      )],
      errors: [{
        kind: 'asset_read_failed',
        message: 'kept as report context only',
        path: 'spritesheets/hair/ignored.png',
        consumers: [{
          itemId: 'hair_messy',
          typeName: 'hair',
          layer: 'layer_9',
          bodyTypes: ['female'],
          recolors: ['ignored'],
        }],
      }],
    }));

    const request: AuditAssetPackScaffoldRequest = {
      reportPath,
      itemIds: ['hair_messy'],
      typeNames: [],
      animations: ['climb'],
      bodyTypes: ['female', 'male'],
      pack: {
        packId: 'acme.audit-braid',
        version: '1.0.0',
        displayName: 'ACME Audit Braid',
        credits: PACK_CREDITS,
        outputDirectory: path.join(target, 'acme.audit-braid'),
      },
    };

    const result = scaffoldAuditAssetPack(request, {
      definitionDigests: new Map([['hair_messy', 'sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa']]),
      creditDigests: new Map([['hair_messy', 'sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb']]),
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('Expected audit scaffold to succeed.');
    expect(readJson(result.manifestPath)).toEqual({
      schema: 'lpc-toolkit.asset-pack.v1',
      id: 'acme.audit-braid',
      version: '1.0.0',
      displayName: 'ACME Audit Braid',
      credits: PACK_CREDITS,
      assets: [{
        kind: 'extend-item',
        itemId: 'hair_messy',
        baseDefinitionDigest: 'sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
        baseCreditDigest: 'sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
        addAnimations: [{
          animation: 'climb',
          layers: [{
            layer: 'layer_1',
            bodyTypes: ['female', 'male'],
            source: 'sprites/hair-messy/climb/layer-1-dark-brown.png',
            destination: {
              path: 'spritesheets/hair/messy/climb/dark_brown.png',
              evidence: 'audit-inferred',
              accepted: false,
            },
            variant: 'dark brown',
            consumers: [{
              itemId: 'hair_messy',
              typeName: 'hair',
              layer: 'layer_1',
              bodyTypes: ['female'],
              variant: 'dark brown',
              recolors: ['primary'],
            }, {
              itemId: 'hair_messy',
              typeName: 'hair',
              layer: 'layer_1',
              bodyTypes: ['male'],
              variant: 'dark brown',
              recolors: ['primary'],
            }],
          }, {
            layer: 'layer_2',
            bodyTypes: ['female', 'male'],
            source: 'sprites/hair-messy/climb/layer-2.png',
            destination: {
              path: 'spritesheets/hair/messy/climb/front.png',
              evidence: 'audit-exact',
              accepted: true,
            },
            consumers: [{
              itemId: 'hair_messy',
              typeName: 'hair',
              layer: 'layer_2',
              bodyTypes: ['female', 'male'],
              recolors: ['secondary'],
            }],
          }],
        }],
      }],
    });
    expect(existsSync(path.join(result.packRoot, 'sprites', 'hair-messy', 'climb'))).toBe(true);
    expect(
      readdirSync(path.join(result.packRoot, 'sprites', 'hair-messy', 'climb')),
    ).toEqual([]);
    expect(readFileSync(result.manifestPath, 'utf8')).not.toContain('ignored');
  });

  it('aborts before publication when selected findings are not scaffoldable and returns every finding_not_scaffoldable_v1 diagnostic', () => {
    const target = createDirectory('lpc-asset-pack-scaffold-audit-blocked-');
    const reportPath = path.join(target, 'audit.json');
    writeAuditReport(reportPath, auditEnvelope({
      summary: {
        itemsScanned: 2,
        incompleteItems: 2,
        unsupported: 1,
        missingFiles: 0,
        blankFrames: 1,
        errors: 0,
      },
      unsupported: [{
        itemId: 'hair_messy',
        typeName: 'hair',
        animation: 'climb',
        nativeAnimations: ['walk'],
        compatibleAnimations: ['walk'],
        requirements: [{
          itemId: 'hair_messy',
          typeName: 'hair',
          layer: 'layer_1',
          bodyTypes: ['female'],
          recolors: [],
          pathConfidence: 'manual-review',
          manualReviewReason: 'Path depends on an unresolved ${weapon} token.',
        }],
      }],
      blankFrames: [blankFinding(
        'spritesheets/hair/messy/climb/front.png',
        [{
          itemId: 'hair_messy',
          typeName: 'hair',
          layer: 'layer_2',
          bodyTypes: ['female'],
          recolors: [],
        }],
      )],
    }));

    const result = scaffoldAuditAssetPack({
      reportPath,
      itemIds: ['hair_messy'],
      typeNames: [],
      animations: ['climb'],
      bodyTypes: ['female'],
      pack: {
        packId: 'acme.audit-braid',
        version: '1.0.0',
        displayName: 'ACME Audit Braid',
        credits: PACK_CREDITS,
        outputDirectory: path.join(target, 'acme.audit-braid'),
      },
    }, {
      definitionDigests: new Map([['hair_messy', 'sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa']]),
      creditDigests: new Map([['hair_messy', 'sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb']]),
    });

    expect(result).toEqual({
      ok: false,
      diagnostics: [
        expect.objectContaining({
          code: 'finding_not_scaffoldable_v1',
          findingType: 'unsupported',
        }),
        expect.objectContaining({
          code: 'finding_not_scaffoldable_v1',
          findingType: 'blankFrames',
        }),
      ],
    });
    expect(existsSync(path.join(target, 'acme.audit-braid'))).toBe(false);
  });

  it('requires a successful audit envelope with the exact command and at least one item or type selector', () => {
    const target = createDirectory('lpc-asset-pack-scaffold-audit-invalid-');
    const reportPath = path.join(target, 'audit.json');
    writeAuditReport(reportPath, {
      ok: true,
      command: 'catalog list-items',
      warnings: [],
      errors: [],
      data: {
        targets: ['walk'],
        scope: {},
        summary: {
          itemsScanned: 0,
          incompleteItems: 0,
          unsupported: 0,
          missingFiles: 0,
          blankFrames: 0,
          errors: 0,
        },
        unsupported: [],
        missingFiles: [],
        blankFrames: [],
        errors: [],
      },
    });

    const wrongCommand = scaffoldAuditAssetPack({
      reportPath,
      itemIds: [],
      typeNames: ['hair'],
      animations: [],
      bodyTypes: [],
      pack: {
        packId: 'acme.audit-braid',
        version: '1.0.0',
        displayName: 'ACME Audit Braid',
        credits: PACK_CREDITS,
        outputDirectory: path.join(target, 'acme.audit-braid'),
      },
    }, {
      definitionDigests: new Map(),
      creditDigests: new Map(),
    });

    expect(wrongCommand).toEqual({
      ok: false,
      diagnostics: [
        expect.objectContaining({
          code: 'audit_report_invalid_v1',
          path: reportPath,
        }),
      ],
    });

    writeAuditReport(reportPath, auditEnvelope({}));
    const missingSelection = scaffoldAuditAssetPack({
      reportPath,
      itemIds: [],
      typeNames: [],
      animations: [],
      bodyTypes: [],
      pack: {
        packId: 'acme.audit-braid',
        version: '1.0.0',
        displayName: 'ACME Audit Braid',
        credits: PACK_CREDITS,
        outputDirectory: path.join(target, 'acme.audit-braid'),
      },
    }, {
      definitionDigests: new Map(),
      creditDigests: new Map(),
    });

    expect(missingSelection).toEqual({
      ok: false,
      diagnostics: [
        expect.objectContaining({
          code: 'audit_report_invalid_v1',
          message: expect.stringContaining('at least one --item or --type'),
        }),
      ],
    });
  });

  it('rejects malformed successful audit findings with invalid pathConfidence and publishes no partial pack', () => {
    const target = createDirectory('lpc-asset-pack-scaffold-audit-malformed-');
    const reportPath = path.join(target, 'audit.json');
    writeAuditReport(reportPath, auditEnvelope({
      summary: {
        itemsScanned: 2,
        incompleteItems: 2,
        unsupported: 1,
        missingFiles: 1,
        blankFrames: 0,
        errors: 0,
      },
      unsupported: [{
        itemId: 'hair_messy',
        typeName: 'hair',
        animation: 'climb',
        nativeAnimations: ['walk'],
        compatibleAnimations: ['walk'],
        requirements: [{
          itemId: 'hair_messy',
          typeName: 'hair',
          layer: 'layer_1',
          bodyTypes: ['female'],
          recolors: [],
          expectedPath: 'spritesheets/hair/messy/climb/front.png',
          pathConfidence: 'ok' as unknown as 'inferred',
        }],
      }],
      missingFiles: [missingFinding(
        'spritesheets/hair/messy/climb/back.png',
        [{
          itemId: 'hair_messy',
          typeName: 'hair',
          layer: 'layer_2',
          bodyTypes: ['female'],
          recolors: [],
        }],
      )],
    }));

    const result = scaffoldAuditAssetPack({
      reportPath,
      itemIds: ['hair_messy'],
      typeNames: [],
      animations: ['climb'],
      bodyTypes: ['female'],
      pack: {
        packId: 'acme.audit-braid',
        version: '1.0.0',
        displayName: 'ACME Audit Braid',
        credits: PACK_CREDITS,
        outputDirectory: path.join(target, 'acme.audit-braid'),
      },
    }, {
      definitionDigests: new Map([['hair_messy', 'sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa']]),
      creditDigests: new Map([['hair_messy', 'sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb']]),
    });

    expect(result).toEqual({
      ok: false,
      diagnostics: [
        expect.objectContaining({
          code: 'audit_report_invalid_v1',
          path: '$.data.unsupported[0].requirements[0].pathConfidence',
          message: expect.stringContaining('pathConfidence'),
        }),
      ],
    });
    expect(existsSync(path.join(target, 'acme.audit-braid'))).toBe(false);
  });
});
