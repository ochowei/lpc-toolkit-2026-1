import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  createCatalog,
  getSpritePathsForSelections,
  type ItemDefinition,
  type Selection,
  type TypeName,
} from '@lpc-toolkit/core';
import { describe, expect, it } from 'vitest';
import { itemSupportsBodyType } from '../src/slice/catalog-tree';
import { CATEGORY_GROUPS } from '../src/slice/category-groups';
import { selectionForItem } from '../src/slice/selection';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '../../..');
const sheetDefsDir = path.join(repoRoot, 'assets/sheet_definitions');
const spritesheetsDir = path.join(repoRoot, 'assets/spritesheets');
const DEFAULT_EXCLUDED_GROUPS = new Set(['fx']);
const KNOWN_DEFAULT_VARIANT_PATH_GAPS = new Set([
  'facial_glasses_shades',
]);
const KNOWN_UNRESOLVED_STRICT_PATH_GAPS = new Set<string>();
const CATALOG_COPIED_ASSET_MISMATCH_TARGETS = [
  'hat_helmet_bascinet_pigface',
  'hat_helmet_bascinet_pigface_raised',
  'shield_two_engrailed_trim',
] as const;

function walkJson(dir: string): Record<string, ItemDefinition> {
  const out: Record<string, ItemDefinition> = {};
  const walk = (current: string): void => {
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else if (entry.name.endsWith('.json')) {
        const rel = path.relative(sheetDefsDir, full).replaceAll(path.sep, '/');
        out[rel] = JSON.parse(readFileSync(full, 'utf8')) as ItemDefinition;
      }
    }
  };
  walk(dir);
  return out;
}

function randomCoveredTypeNames(): Set<TypeName> {
  return new Set(
    CATEGORY_GROUPS
      .filter((group) => !DEFAULT_EXCLUDED_GROUPS.has(group.id))
      .flatMap((group) => group.typeNames),
  );
}

function spritePathExists(spritePath: string): boolean {
  const rel = spritePath.replace(/^spritesheets\//, '');
  return existsSync(path.join(spritesheetsDir, rel));
}

function expectedRepresentativeLayerCount(
  item: ItemDefinition,
  bodyType: string,
): number {
  let count = 0;
  for (let n = 1; n < 10; n++) {
    const layer = item[`layer_${n}`];
    if (!layer) break;
    const bodyPath = layer[bodyType];
    if (typeof bodyPath !== 'string') continue;
    if (bodyPath.includes('${')) continue;
    count++;
  }
  return count;
}

describe('random outfit variant path audit', () => {
  it('catalog/copied asset mismatch cleanup targets resolve every representative sprite path', () => {
    const { catalog } = createCatalog(walkJson(sheetDefsDir));
    const failures: string[] = [];

    for (const itemId of CATALOG_COPIED_ASSET_MISMATCH_TARGETS) {
      const item = catalog.byItemId.get(itemId);
      if (!item) {
        failures.push(`${itemId} missing from catalog`);
        continue;
      }

      const selection = selectionForItem(item.type_name, item);
      const layers = getSpritePathsForSelections(
        {
          bodyType: 'male',
          items: { [item.type_name]: selection },
        },
        catalog,
        { pathExists: spritePathExists },
      );

      if (layers.length === 0) {
        failures.push(
          `${item.type_name}/${item.name} (${itemId}) produced no representative layers`,
        );
        continue;
      }

      const expectedLayerCount = expectedRepresentativeLayerCount(item, 'male');
      if (layers.length !== expectedLayerCount) {
        failures.push(
          `${item.type_name}/${item.name} (${itemId}) variant=${selection.variant ?? ''} resolved ${layers.length}/${expectedLayerCount} representative layers`,
        );
      }

      for (const layer of layers) {
        if (spritePathExists(layer.path)) continue;
        failures.push(
          `${item.type_name}/${item.name} (${itemId}) variant=${selection.variant ?? ''} missing ${layer.path}`,
        );
      }
    }

    expect(
      failures,
      `${failures.length} catalog/copied asset mismatch target failure(s):\n${failures.join('\n')}`,
    ).toEqual([]);
  });

  it('random-covered variant-backed male items resolve every representative sprite path', () => {
    const { catalog } = createCatalog(walkJson(sheetDefsDir));
    const coveredTypes = randomCoveredTypeNames();
    const failures: string[] = [];
    let auditedItems = 0;

    for (const [itemId, item] of catalog.byItemId) {
      if (!coveredTypes.has(item.type_name)) continue;
      if (!itemSupportsBodyType(item, 'male')) continue;
      if (!item.variants || item.variants.length === 0) continue;
      if (KNOWN_UNRESOLVED_STRICT_PATH_GAPS.has(itemId)) continue;

      auditedItems++;
      const selection = selectionForItem(item.type_name, item);
      const items: Record<TypeName, Selection> = {
        [item.type_name]: selection,
      };
      const layers = getSpritePathsForSelections(
        { bodyType: 'male', items },
        catalog,
        { pathExists: spritePathExists },
      );

      if (layers.length === 0) {
        failures.push(
          `${item.type_name}/${item.name} (${itemId}) produced no representative layers`,
        );
        continue;
      }

      const expectedLayerCount = expectedRepresentativeLayerCount(item, 'male');
      if (layers.length !== expectedLayerCount) {
        failures.push(
          `${item.type_name}/${item.name} (${itemId}) variant=${selection.variant ?? ''} resolved ${layers.length}/${expectedLayerCount} representative layers`,
        );
      }

      for (const layer of layers) {
        if (spritePathExists(layer.path)) continue;
        failures.push(
          `${item.type_name}/${item.name} (${itemId}) variant=${selection.variant ?? ''} missing ${layer.path}`,
        );
      }
    }

    expect(auditedItems).toBeGreaterThan(0);
    expect(
      failures,
      `${failures.length} missing representative sprite path(s):\n${failures.join('\n')}`,
    ).toEqual([]);
  });

  it('random-covered variant-backed male items resolve at least one representative sprite path', () => {
    const { catalog } = createCatalog(walkJson(sheetDefsDir));
    const coveredTypes = randomCoveredTypeNames();
    const failures: string[] = [];
    let auditedItems = 0;

    for (const [itemId, item] of catalog.byItemId) {
      if (!coveredTypes.has(item.type_name)) continue;
      if (!itemSupportsBodyType(item, 'male')) continue;
      if (!item.variants || item.variants.length === 0) continue;
      if (KNOWN_DEFAULT_VARIANT_PATH_GAPS.has(itemId)) continue;

      auditedItems++;
      const selection = selectionForItem(item.type_name, item);
      const items: Record<TypeName, Selection> = {
        [item.type_name]: selection,
      };
      const layers = getSpritePathsForSelections(
        { bodyType: 'male', items },
        catalog,
      );

      if (layers.length === 0) {
        failures.push(
          `${item.type_name}/${item.name} (${itemId}) produced no representative layers`,
        );
        continue;
      }

      const existingLayers = layers.filter((layer) =>
        spritePathExists(layer.path),
      );
      if (existingLayers.length === 0) {
        const missingPaths = layers.map((layer) => layer.path).join(', ');
        failures.push(
          `${item.type_name}/${item.name} (${itemId}) variant=${selection.variant ?? ''} produced no existing representative paths: ${missingPaths}`,
        );
      }
    }

    expect(auditedItems).toBeGreaterThan(0);
    expect(
      failures,
      `${failures.length} random-covered variant path failure(s):\n${failures.join('\n')}`,
    ).toEqual([]);
  });
});
