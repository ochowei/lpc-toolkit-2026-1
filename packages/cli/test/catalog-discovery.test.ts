import { createPaletteCatalog, type ItemDefinition } from '@lpc-toolkit/core';
import { describe, expect, it } from 'vitest';
import { parseArgs } from '../src/args.js';
import {
  discoverItems,
  discoveryPaginationIssue,
  readDiscoveryPagination,
  toDiscoveryCandidate,
  toDiscoveryDetail,
} from '../src/catalog-discovery.js';

const palettes = createPaletteCatalog({}).palettes;
const braid: ItemDefinition = {
  name: 'Braid',
  display_name: 'Single Braid',
  type_name: 'hair',
  animations: ['walk'],
  variants: ['plain'],
  credits: [{
    file: 'hair/braid',
    notes: 'Fixture credit.',
    authors: ['Artist'],
    licenses: ['GPL 3.0'],
    urls: ['https://example.test/braid'],
  }],
  layer_1: { zPos: 50, male: 'hair/braid/', female: 'hair/braid/' },
};

describe('catalog discovery', () => {
  it('projects bounded summary and complete detail fields', () => {
    const candidate = toDiscoveryCandidate({ ...braid, itemId: 'hair_braid' }, palettes)!;
    expect(candidate.summary).toEqual({
      itemId: 'hair_braid',
      typeName: 'hair',
      name: 'Single Braid',
      supportedBodyTypes: ['male', 'female'],
      variants: ['plain'],
      recolors: [],
      animations: ['walk'],
      licenses: ['GPL'],
      creditCount: 1,
    });
    expect(toDiscoveryDetail({ ...braid, itemId: 'hair_braid' }, palettes)).toEqual({
      ...candidate.summary,
      credits: braid.credits,
    });
  });

  it('matches all identity fields, sorts deterministically, and paginates', () => {
    const candidates = [
      { summary: { ...toDiscoveryCandidate({ ...braid, itemId: 'z-id' }, palettes)!.summary, name: 'beta' }, internalName: 'Needle' },
      { summary: { ...toDiscoveryCandidate({ ...braid, itemId: 'a-id' }, palettes)!.summary, name: 'Alpha' }, internalName: 'Thread' },
    ];
    const page = discoverItems(candidates, {
      pagination: { all: false, limit: 1, offset: 0 },
    });
    expect(page.items.map((item) => item.itemId)).toEqual(['a-id']);
    expect(page.page).toEqual({
      limit: 1,
      offset: 0,
      returned: 1,
      total: 2,
      hasMore: true,
      nextOffset: 1,
    });
    expect(discoverItems(candidates, {
      query: 'needle',
      pagination: { all: false, limit: 20, offset: 0 },
    }).items[0]?.itemId).toBe('z-id');
  });

  it('preserves an offset at total on an empty terminal page', () => {
    const candidates = [
      toDiscoveryCandidate({ ...braid, itemId: 'a-id' }, palettes)!,
      toDiscoveryCandidate({ ...braid, itemId: 'b-id' }, palettes)!,
    ];

    const result = discoverItems(candidates, {
      pagination: { all: false, limit: 1, offset: 2 },
    });

    expect(result.items).toEqual([]);
    expect(result.page).toEqual({
      limit: 1,
      offset: 2,
      returned: 0,
      total: 2,
      hasMore: false,
      nextOffset: null,
    });
  });

  it('returns all results explicitly and bounded edit-distance suggestions', () => {
    const candidates = Array.from({ length: 7 }, (_, index) => ({
      summary: {
        ...toDiscoveryCandidate({ ...braid, itemId: `braid-${index}` }, palettes)!.summary,
        itemId: `braid-${index}`,
        name: `Braid ${index}`,
      },
      internalName: `Braid ${index}`,
    }));
    const result = discoverItems(candidates, {
      query: 'braidd',
      pagination: { all: true, limit: 20, offset: 0 },
    });
    expect(result.items).toEqual([]);
    expect(result.suggestions).toHaveLength(5);
    expect(result.page).toEqual({
      limit: null,
      offset: 0,
      returned: 0,
      total: 0,
      hasMore: false,
      nextOffset: null,
    });
  });

  it('validates pagination flags and reads defaults', () => {
    expect(readDiscoveryPagination(parseArgs(['catalog', 'items']).flags)).toEqual({
      all: false,
      limit: 20,
      offset: 0,
    });
    expect(discoveryPaginationIssue(parseArgs([
      'catalog', 'items', '--all', '--limit', '10',
    ]).flags)).toMatchObject({ code: 'invalid_option', path: '--all' });
    expect(discoveryPaginationIssue(parseArgs([
      'catalog', 'items', '--limit', '101',
    ]).flags)).toMatchObject({ code: 'invalid_option', path: '--limit' });
    expect(discoveryPaginationIssue(parseArgs([
      'catalog', 'items', '--offset', '-1',
    ]).flags)).toMatchObject({ code: 'invalid_option', path: '--offset' });
  });

  it('accepts the maximum discovery limit', () => {
    const flags = parseArgs(['catalog', 'items', '--limit', '100']).flags;

    expect(discoveryPaginationIssue(flags)).toBeUndefined();
    expect(readDiscoveryPagination(flags)).toEqual({
      all: false,
      limit: 100,
      offset: 0,
    });
  });

  it('rejects an offset outside the safe integer range', () => {
    const flags = parseArgs([
      'catalog', 'items', '--offset', '9'.repeat(400),
    ]).flags;

    expect(discoveryPaginationIssue(flags)).toMatchObject({
      code: 'invalid_option',
      message: '--offset must be a non-negative integer.',
      path: '--offset',
    });
  });
});
