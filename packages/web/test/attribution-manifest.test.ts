import { describe, expect, it } from 'vitest';
import type {
  Catalog,
  CreditsManifest,
  ItemDefinition,
  TypeName,
} from '@lpc-toolkit/core';
import type { AnimationFilter } from '../src/slice/animation-filter';
import {
  ALL_LICENSE_GROUPS,
  type LicenseFilter,
} from '../src/slice/license-filter';
import type { SliceState } from '../src/slice/selection';
import { attributionRows } from '../src/components/layer-stack/popovers/attribution-manifest';

const SELECTED_ITEM = {
  name: 'mixed_hair',
  type_name: 'hair',
  animations: ['walk'],
  credits: [
    {
      file: 'hair/mixed_hair/resolved',
      notes: '',
      authors: ['Resolved Artist'],
      licenses: ['CC0'],
      urls: [],
    },
    {
      file: 'hair/mixed_hair/unmatched',
      notes: '',
      authors: ['Unmatched Artist'],
      licenses: ['GPL 3.0'],
      urls: [],
    },
  ],
  layer_1: { zPos: 10, male: 'hair/mixed_hair/' },
} as ItemDefinition;

const CATALOG = {
  byTypeName: new Map<TypeName, ItemDefinition[]>([
    ['hair', [SELECTED_ITEM]],
  ]),
} as unknown as Catalog;

const STATE = {
  bodyType: 'male',
  selections: {
    hair: { typeName: 'hair', name: SELECTED_ITEM.name },
  },
  anim: 'walk',
  dir: 'down',
  playing: false,
  zoom: 4,
  layout: 'single',
} as SliceState;

const ALL_ANIMATIONS: AnimationFilter = new Set(['walk']);

const MANIFEST: CreditsManifest = {
  entries: [SELECTED_ITEM.credits[0]!],
  resolvedPaths: ['spritesheets/hair/mixed_hair/walk.png'],
  licenses: ['CC0'],
};

describe('attributionRows', () => {
  it('uses only manifest credit records and licenses for actual attribution', () => {
    const result = attributionRows(
      MANIFEST,
      CATALOG,
      STATE,
      ALL_LICENSE_GROUPS,
      ALL_ANIMATIONS,
    );

    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]).toMatchObject({
      file: 'hair/mixed_hair/resolved',
      authors: ['Resolved Artist'],
      licenses: ['CC0'],
      effective: 'CC0',
      resolvedPath: 'spritesheets/hair/mixed_hair/walk.png',
    });
    expect(result.rows.some((row) => row.file.includes('unmatched'))).toBe(false);
    expect(result.empty).toBe(false);
    expect(result.incompatibleTypeNames).toEqual([]);
  });

  it('keeps manifest rows unchanged while reporting catalog filter incompatibility', () => {
    const onlyCcBy: LicenseFilter = new Set(['CC-BY']);

    const compatible = attributionRows(
      MANIFEST,
      CATALOG,
      STATE,
      ALL_LICENSE_GROUPS,
      ALL_ANIMATIONS,
    );
    const incompatible = attributionRows(
      MANIFEST,
      CATALOG,
      STATE,
      onlyCcBy,
      ALL_ANIMATIONS,
    );

    expect(incompatible.rows).toEqual(compatible.rows);
    expect(incompatible.incompatibleTypeNames).toEqual(['hair']);
  });

  it('returns a deliberate empty result for an empty manifest', () => {
    const emptyManifest: CreditsManifest = {
      entries: [],
      resolvedPaths: [],
      licenses: [],
    };
    const emptyState = { ...STATE, selections: {} } as SliceState;

    expect(
      attributionRows(
        emptyManifest,
        CATALOG,
        emptyState,
        ALL_LICENSE_GROUPS,
        ALL_ANIMATIONS,
      ),
    ).toEqual({
      rows: [],
      empty: true,
      incompatibleTypeNames: [],
    });
  });
});
