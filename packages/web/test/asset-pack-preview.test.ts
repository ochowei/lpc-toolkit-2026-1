import {
  createCatalog,
  getSpritePathsForSelections,
  type AssetPackCompilePlan,
  type Catalog,
  type CreditEntry,
  type ItemDefinition,
  type PaletteMetadata,
} from '@lpc-toolkit/core';
import { describe, expect, it } from 'vitest';
import type { AssetPackPreviewPayload } from '../src/lib/asset-pack-worker-protocol';
import {
  buildAssetPackPreview,
  createAssetPackPreviewCatalog,
  createOfficialAssetPackPreviewPathAuthorizer,
  previewAnimationOptions,
  previewBodyTypeOptions,
} from '../src/lib/asset-pack-preview';

const credit: CreditEntry = {
  file: 'packages/acme.demo/hair/foreground/male/walk.png',
  authors: ['Pack Artist'],
  licenses: ['CC-BY 4.0'],
  urls: ['https://example.com/pack-artist'],
  notes: 'Pack contribution.',
};

const baseCredit: CreditEntry = {
  file: 'body/male/walk.png',
  authors: ['Official Artist'],
  licenses: ['GPL 3.0'],
  urls: ['https://example.com/official'],
  notes: 'Official base release.',
};

const femaleBaseCredit: CreditEntry = {
  ...baseCredit,
  file: 'body/female/walk.png',
};

const definition = (
  name: string,
  typeName: string,
  path: string,
  credits: readonly CreditEntry[],
): ItemDefinition => ({
  name,
  type_name: typeName,
  animations: ['walk'],
  credits,
  layer_1: {
    zPos: typeName === 'hair' ? 100 : 0,
    male: path,
    female: path.replace('/male/', '/female/'),
  },
});

const baselineCatalog: Catalog = createCatalog({
  'body/body.json': definition('Body', 'body', 'body/male/', [baseCredit, femaleBaseCredit]),
  'head/heads_human_male.json': definition('Head', 'head', 'head/', []),
  'expression/face_neutral.json': definition('Neutral', 'expression', 'expression/', []),
}).catalog;

const palettes: PaletteMetadata = { materials: {}, versions: {} };
const packDefinition = definition(
  'Pack Hair',
  'hair',
  'packages/acme.demo/hair/foreground/male/',
  [credit],
);
const plan: AssetPackCompilePlan = {
  definitions: [{
    packId: 'acme.demo',
    assetId: 'acme.demo--hair',
    logicalPath: 'sheet_definitions/hair/acme.demo--hair.json',
    basename: 'acme.demo--hair.json',
    definition: packDefinition,
  }],
  sprites: [{
    packId: 'acme.demo',
    assetId: 'acme.demo--hair',
    sourcePath: 'sprites/hair/walk.png',
    destinationPath: 'spritesheets/packages/acme.demo/hair/foreground/male/walk.png',
    animation: 'walk',
    consumers: [{ itemId: 'acme.demo--hair', typeName: 'hair', layer: 'layer_1', bodyTypes: ['male'] }],
  }],
  credits: [credit],
  ownership: [{ packId: 'acme.demo', logicalPaths: ['sheet_definitions/hair/acme.demo--hair.json'] }],
  diagnostics: [],
};

const payload: AssetPackPreviewPayload = {
  revision: 4,
  packId: 'acme.demo',
  compilePlan: plan,
  sources: [{
    sourcePath: 'sprites/hair/walk.png',
    destinationPath: 'spritesheets/packages/acme.demo/hair/foreground/male/walk.png',
    bytes: new Uint8Array([1, 2, 3]),
  }],
};

describe('asset-pack preview model', () => {
  it('merges compiled definitions and makes a focused new item replace only its type', () => {
    const catalog = createAssetPackPreviewCatalog(baselineCatalog, plan);
    const result = buildAssetPackPreview({
      baselineCatalog,
      palettes,
      payload,
      focusedAssetId: 'acme.demo--hair',
    });

    expect(catalog.byItemId.has('acme.demo--hair')).toBe(true);
    expect(result.selections.items.body?.name).toBe('Body');
    expect(result.selections.items.hair?.name).toBe('Pack Hair');
    expect(result.selections.items.head?.name).toBe('Head');
    expect(result.credits.entries.map((entry) => entry.authors[0])).toEqual([
      'Official Artist',
      'Pack Artist',
    ]);
    expect(result.effectiveLicense).toBe('GPL 3.0');
  });

  it('validates imported selections against the compiled catalog before applying the focused item', () => {
    expect(() => buildAssetPackPreview({
      baselineCatalog,
      palettes,
      payload,
      focusedAssetId: 'acme.demo--hair',
      importedSelections: {
        bodyType: 'male',
        items: { hair: { typeName: 'hair', name: 'Not in compiled catalog' } },
      },
    })).toThrow('Unknown canonical item');
  });

  it('rejects a selected asset with no matching credit data', () => {
    const uncredited = {
      ...packDefinition,
      credits: [],
    };
    const uncreditedPlan = {
      ...plan,
      definitions: [{ ...plan.definitions[0]!, definition: uncredited }],
      credits: [],
    } satisfies AssetPackCompilePlan;
    expect(() => buildAssetPackPreview({
      baselineCatalog,
      palettes,
      payload: { ...payload, compilePlan: uncreditedPlan },
      focusedAssetId: 'acme.demo--hair',
    })).toThrow('credit');
  });

  it('exposes only valid body and animation controls from the compiled catalog', () => {
    const catalog = createAssetPackPreviewCatalog(baselineCatalog, plan);
    expect(previewBodyTypeOptions(catalog)).toContain('male');
    expect(previewBodyTypeOptions(catalog)).not.toContain('invalid');
    expect(previewAnimationOptions(catalog)).toContain('walk');
  });

  it('passes the selected body type into standard preview selections and paths', () => {
    const result = buildAssetPackPreview({
      baselineCatalog,
      palettes,
      payload,
      bodyType: 'female',
    });

    expect(result.selections.bodyType).toBe('female');
    expect(getSpritePathsForSelections(result.selections, result.catalog)[0]?.path)
      .toContain('/female/walk.png');
  });

  it('authorizes only known official baseline paths and excludes compiled destinations', () => {
    const isOfficialPath = createOfficialAssetPackPreviewPathAuthorizer(baselineCatalog, plan);

    expect(isOfficialPath('spritesheets/body/male/walk.png')).toBe(true);
    expect(isOfficialPath('spritesheets/body/male/not-in-catalog.png')).toBe(false);
    expect(isOfficialPath('spritesheets/packages/acme.demo/hair/foreground/male/walk.png')).toBe(false);
  });
});
