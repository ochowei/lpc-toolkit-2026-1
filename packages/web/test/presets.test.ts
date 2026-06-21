import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  createCatalog,
  type Catalog,
  type FilePath,
  type ItemDefinition,
  type TypeName,
} from '@lpc-toolkit/core';
import { CLOTHING_TYPES, PRESETS } from '../src/presets';
import { TRANSLATIONS } from '../src/i18n';

const here = path.dirname(fileURLToPath(import.meta.url));
const sheetDefsDir = path.resolve(here, '../../../assets/sheet_definitions');
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
  it('has 5 presets with unique ids', () => {
    expect(PRESETS).toHaveLength(5);
    expect(new Set(PRESETS.map((p) => p.id)).size).toBe(5);
  });

  it('every preset item type is a clearable clothing category or allowed personal appearance', () => {
    const allowedNonClothing = new Set<TypeName>([
      'body',
      'head',
      'expression',
      'hair',
    ]);
    for (const preset of PRESETS) {
      for (const item of preset.items) {
        expect(
          CLOTHING_TYPES.has(item.typeName) || allowedNonClothing.has(item.typeName),
          `${preset.id}: "${item.typeName}" not in CLOTHING_TYPES or allowed personal appearance`,
        ).toBe(true);
      }
    }
  });

  it('every preset labelKey exists in the translations', () => {
    for (const preset of PRESETS) {
      expect(Object.keys(TRANSLATIONS.en)).toContain(preset.labelKey);
    }
  });

  it('every preset is a complete outfit (torso + legs + feet)', () => {
    // A preset must dress the whole character: applying it clears all
    // clothing, so a missing layer leaves the body bare there.
    const TORSO = new Set(['clothes', 'armour', 'chainmail']);
    const LEGS = new Set(['legs', 'overalls']);
    const FEET = new Set(['feet', 'shoes']);
    for (const preset of PRESETS) {
      const types = new Set(preset.items.map((i) => i.typeName));
      const covers = (group: Set<string>) =>
        [...types].some((t) => group.has(t));
      expect(covers(TORSO), `${preset.id}: no torso item`).toBe(true);
      expect(covers(LEGS), `${preset.id}: no legs item`).toBe(true);
      expect(covers(FEET), `${preset.id}: no feet item`).toBe(true);
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
