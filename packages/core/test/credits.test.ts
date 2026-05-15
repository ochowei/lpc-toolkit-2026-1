import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { createCatalog } from '../src/catalog.js';
import {
  computeEffectiveLicense,
  getCredits,
} from '../src/credits.js';
import type {
  Catalog,
  FilePath,
  ItemDefinition,
  License,
  Selections,
} from '../src/types.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const upstreamRoot = path.join(here, '../../../upstream/sheet_definitions');

function loadFixture(relPath: FilePath): ItemDefinition {
  return JSON.parse(
    readFileSync(path.join(upstreamRoot, relPath), 'utf8'),
  ) as ItemDefinition;
}

function loadCatalog(rels: readonly FilePath[]): Catalog {
  const records: Record<FilePath, ItemDefinition> = {};
  for (const rel of rels) records[rel] = loadFixture(rel);
  return createCatalog(records).catalog;
}

describe('getCredits with real upstream JSON', () => {
  it('returns only the body credit row matching bodyType=male', () => {
    const catalog = loadCatalog(['body/body.json']);
    const selections: Selections = {
      bodyType: 'male',
      items: { body: { typeName: 'body', name: 'Body Color' } },
    };

    const manifest = getCredits(selections, catalog);

    // body.json has separate credit rows per bodyType folder; only male
    // should match the male used path.
    const files = manifest.entries.map((e) => e.file);
    expect(files).toContain('body/bodies/male');
    expect(files).not.toContain('body/bodies/female');
    expect(files).not.toContain('body/bodies/child');
  });

  it('returns the female credit row when bodyType=female', () => {
    const catalog = loadCatalog(['body/body.json']);
    const selections: Selections = {
      bodyType: 'female',
      items: { body: { typeName: 'body', name: 'Body Color' } },
    };
    const manifest = getCredits(selections, catalog);
    const files = manifest.entries.map((e) => e.file);
    expect(files).toContain('body/bodies/female');
    expect(files).not.toContain('body/bodies/male');
  });

  it('matches the face_blush credit via the resolved ${head} path', () => {
    // face_blush layer path is `head/faces/${head}/blush/`. With
    // head=Human Male the substitution produces `head/faces/male/blush/`
    // and the used PNG is `head/faces/male/blush/walk.png`. The credit
    // row `file: "head/faces"` is a folder prefix and should match.
    const catalog = loadCatalog([
      'head/heads/human/heads_human_male.json',
      'head/faces/face_blush.json',
    ]);
    const selections: Selections = {
      bodyType: 'male',
      items: {
        head: { typeName: 'head', name: 'Human Male' },
        expression: { typeName: 'expression', name: 'Blush' },
      },
    };

    const manifest = getCredits(selections, catalog);
    const blushFiles = manifest.entries
      .filter((e) => e.file.startsWith('head/faces'))
      .map((e) => e.file);
    expect(blushFiles).toContain('head/faces');
    // The elderly-specific row (file: "head/faces/elderly/blush") must
    // NOT match the male used path.
    expect(blushFiles).not.toContain('head/faces/elderly/blush');
  });

  it('aggregates licenses across selected items, deduped, in first-seen order', () => {
    const catalog = loadCatalog([
      'body/body.json',
      'head/heads/human/heads_human_male.json',
    ]);
    const selections: Selections = {
      bodyType: 'male',
      items: {
        body: { typeName: 'body', name: 'Body Color' },
        head: { typeName: 'head', name: 'Human Male' },
      },
    };

    const manifest = getCredits(selections, catalog);

    // Licenses are deduped: no value appears twice.
    expect(manifest.licenses.length).toBe(new Set(manifest.licenses).size);
    // body's male credit row carries OGA-BY 3.0 + CC-BY-SA 3.0 + GPL 3.0.
    for (const expected of [
      'OGA-BY 3.0',
      'CC-BY-SA 3.0',
      'GPL 3.0',
    ] as const) {
      expect(manifest.licenses).toContain(expected);
    }
  });

  it('returns empty manifest for empty selections', () => {
    const catalog = loadCatalog(['body/body.json']);
    const manifest = getCredits(
      { bodyType: 'male', items: {} },
      catalog,
    );
    expect(manifest.entries).toEqual([]);
    expect(manifest.licenses).toEqual([]);
  });

  it('skips selections that do not resolve in the catalog', () => {
    const catalog = loadCatalog(['body/body.json']);
    const selections: Selections = {
      bodyType: 'male',
      items: {
        body: { typeName: 'body', name: 'Body Color' },
        head: { typeName: 'head', name: 'No Such Head' },
      },
    };
    const manifest = getCredits(selections, catalog);
    // Body still resolves; the missing head is silently skipped.
    expect(manifest.entries.length).toBeGreaterThan(0);
    expect(manifest.entries.every((e) => e.file.startsWith('body'))).toBe(true);
  });
});

describe('getCredits dedupe logic', () => {
  // Synthetic catalog so we can control credit overlaps precisely.
  function makeCatalog(items: ItemDefinition[]): Catalog {
    const records: Record<FilePath, ItemDefinition> = {};
    for (let i = 0; i < items.length; i++) {
      const slug = items[i]!.name.toLowerCase().replaceAll(' ', '_');
      records[`item_${i}_${slug}.json`] = items[i]!;
    }
    return createCatalog(records).catalog;
  }

  it('dedupes by credit.file across items with the same credit row', () => {
    // Two items pointing at the same shared base folder should produce
    // only one credit entry for the shared file.
    const sharedCredit = {
      file: 'shared/folder',
      notes: '',
      authors: ['Alice'],
      licenses: ['CC-BY 4.0'] as readonly License[],
      urls: [],
    };
    const a: ItemDefinition = {
      name: 'A',
      type_name: 'a',
      animations: ['walk'],
      credits: [sharedCredit],
      layer_1: { zPos: 1, male: 'shared/folder/' },
    };
    const b: ItemDefinition = {
      name: 'B',
      type_name: 'b',
      animations: ['walk'],
      credits: [sharedCredit],
      layer_1: { zPos: 2, male: 'shared/folder/' },
    };
    const manifest = getCredits(
      {
        bodyType: 'male',
        items: {
          a: { typeName: 'a', name: 'A' },
          b: { typeName: 'b', name: 'B' },
        },
      },
      makeCatalog([a, b]),
    );
    expect(manifest.entries.map((e) => e.file)).toEqual(['shared/folder']);
    expect(manifest.licenses).toEqual(['CC-BY 4.0']);
  });

  it('omits credits whose file path does not match any used layer path', () => {
    const item: ItemDefinition = {
      name: 'Sparse',
      type_name: 'sparse',
      animations: ['walk'],
      credits: [
        {
          file: 'sparse/used',
          notes: '',
          authors: ['used'],
          licenses: ['CC0'],
          urls: [],
        },
        {
          file: 'sparse/unused',
          notes: '',
          authors: ['unused'],
          licenses: ['GPL 3.0'],
          urls: [],
        },
      ],
      layer_1: { zPos: 1, male: 'sparse/used/' },
    };
    const manifest = getCredits(
      {
        bodyType: 'male',
        items: { sparse: { typeName: 'sparse', name: 'Sparse' } },
      },
      makeCatalog([item]),
    );
    expect(manifest.entries.map((e) => e.file)).toEqual(['sparse/used']);
    expect(manifest.licenses).toEqual(['CC0']);
  });
});

describe('computeEffectiveLicense', () => {
  it('picks GPL when GPL is present alongside any other group', () => {
    expect(
      computeEffectiveLicense({
        entries: [],
        licenses: ['CC0', 'CC-BY 4.0', 'GPL 2.0'],
      }),
    ).toBe('GPL 2.0');
  });

  it('picks the higher GPL version within the GPL group', () => {
    expect(
      computeEffectiveLicense({
        entries: [],
        licenses: ['GPL 2.0', 'GPL 3.0'],
      }),
    ).toBe('GPL 3.0');
  });

  it('picks CC-BY-SA over CC-BY and OGA-BY when no GPL is present', () => {
    expect(
      computeEffectiveLicense({
        entries: [],
        licenses: ['CC-BY 4.0', 'OGA-BY 4.0', 'CC-BY-SA 3.0'],
      }),
    ).toBe('CC-BY-SA 3.0');
  });

  it('within CC-BY: bare < 3.0 < 3.0+ < 4.0', () => {
    expect(
      computeEffectiveLicense({
        entries: [],
        licenses: ['CC-BY', 'CC-BY 3.0', 'CC-BY 3.0+'],
      }),
    ).toBe('CC-BY 3.0+');
    expect(
      computeEffectiveLicense({
        entries: [],
        licenses: ['CC-BY', 'CC-BY 3.0', 'CC-BY 3.0+', 'CC-BY 4.0'],
      }),
    ).toBe('CC-BY 4.0');
  });

  it('within OGA-BY: 3.0 < 3.0+ < 4.0', () => {
    expect(
      computeEffectiveLicense({
        entries: [],
        licenses: ['OGA-BY 3.0', 'OGA-BY 3.0+'],
      }),
    ).toBe('OGA-BY 3.0+');
    expect(
      computeEffectiveLicense({
        entries: [],
        licenses: ['OGA-BY 3.0', 'OGA-BY 3.0+', 'OGA-BY 4.0'],
      }),
    ).toBe('OGA-BY 4.0');
  });

  it('returns the only license when there is exactly one', () => {
    expect(
      computeEffectiveLicense({ entries: [], licenses: ['CC0'] }),
    ).toBe('CC0');
  });

  it('throws on empty licenses', () => {
    expect(() =>
      computeEffectiveLicense({ entries: [], licenses: [] }),
    ).toThrow(/empty CreditsManifest/);
  });

  it('integrates: getCredits + computeEffectiveLicense on real body.json', () => {
    const catalog = loadCatalog(['body/body.json']);
    const manifest = getCredits(
      {
        bodyType: 'male',
        items: { body: { typeName: 'body', name: 'Body Color' } },
      },
      catalog,
    );
    // body's male row contains GPL 3.0 → effective license is GPL 3.0.
    expect(computeEffectiveLicense(manifest)).toBe('GPL 3.0');
  });
});
