import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  createCatalog,
  type Catalog,
  type FilePath,
  type ItemDefinition,
} from '@lpc-toolkit/core';
import { CLOTHING_TYPES, PRESETS } from '../src/presets';
import { TRANSLATIONS } from '../src/i18n';

const here = path.dirname(fileURLToPath(import.meta.url));
const sheetDefsDir = path.resolve(here, '../../../upstream/sheet_definitions');
const haveUpstream = existsSync(sheetDefsDir);

function walkJson(dir: string, base = dir): Record<FilePath, ItemDefinition> {
  const out: Record<FilePath, ItemDefinition> = {};
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) Object.assign(out, walkJson(full, base));
    else if (e.name.endsWith('.json')) {
      const key = path.relative(base, full).split(path.sep).join('/');
      out[key] = JSON.parse(readFileSync(full, 'utf8')) as ItemDefinition;
    }
  }
  return out;
}

describe('PRESETS data', () => {
  it('has 6 presets with unique ids', () => {
    expect(PRESETS).toHaveLength(6);
    expect(new Set(PRESETS.map((p) => p.id)).size).toBe(6);
  });

  it('every preset item type is a clearable clothing category', () => {
    for (const preset of PRESETS) {
      for (const item of preset.items) {
        expect(
          CLOTHING_TYPES.has(item.typeName),
          `${preset.id}: "${item.typeName}" not in CLOTHING_TYPES`,
        ).toBe(true);
      }
    }
  });

  it('every preset labelKey exists in the translations', () => {
    for (const preset of PRESETS) {
      expect(Object.keys(TRANSLATIONS.en)).toContain(preset.labelKey);
    }
  });
});

describe.runIf(haveUpstream)('PRESETS catalog validation', () => {
  let catalog: Catalog;

  beforeAll(() => {
    catalog = createCatalog(walkJson(sheetDefsDir)).catalog;
  });

  function findDef(typeName: string, name: string) {
    return (catalog.byTypeName.get(typeName) ?? []).find(
      (d) => d.name === name,
    );
  }

  it('every preset item resolves in the catalog', () => {
    for (const preset of PRESETS) {
      for (const item of preset.items) {
        expect(
          findDef(item.typeName, item.name),
          `${preset.id}: ${item.typeName}/"${item.name}" not found in catalog`,
        ).toBeDefined();
      }
    }
  });

  it('preset variants are consistent with the catalog item variants', () => {
    for (const preset of PRESETS) {
      for (const item of preset.items) {
        const def = findDef(item.typeName, item.name)!;
        const variants = def.variants ?? [];
        if (variants.length > 0) {
          expect(
            item.variant,
            `${preset.id}/"${item.name}" must specify a variant`,
          ).toBeDefined();
          expect(
            variants,
            `${preset.id}/"${item.name}" variant "${item.variant}"`,
          ).toContain(item.variant);
        } else {
          expect(
            item.variant,
            `${preset.id}/"${item.name}" must not specify a variant`,
          ).toBeUndefined();
        }
      }
    }
  });
});
