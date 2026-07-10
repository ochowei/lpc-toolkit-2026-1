import { readFileSync } from 'node:fs';
import {
  createCatalog,
  type Catalog,
  type FilePath,
  type ItemDefinition,
  type PaletteMaterialMeta,
  type PaletteMetadata,
  type RawRecolors,
  type RecolorConfig,
} from '@lpc-toolkit/core';
import type { CliIssue } from './response.js';

export interface TokenDecodeData {
  readonly catalog: Catalog;
  readonly palettes: PaletteMetadata;
  readonly warnings: readonly CliIssue[];
}

function objectValue(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  return value as Record<string, unknown>;
}

function stringValue(value: unknown, label: string): string {
  if (typeof value !== 'string') throw new Error(`${label} must be a string`);
  return value;
}

function optionalString(
  record: Record<string, unknown>,
  key: string,
  label: string,
): string | undefined {
  const value = record[key];
  return value === undefined ? undefined : stringValue(value, `${label}.${key}`);
}

function stringArray(value: unknown, label: string): readonly string[] {
  if (!Array.isArray(value) || !value.every((entry): entry is string => typeof entry === 'string')) {
    throw new Error(`${label} must be an array of strings`);
  }
  return value;
}

function optionalStringArray(
  record: Record<string, unknown>,
  key: string,
  label: string,
): readonly string[] | undefined {
  const value = record[key];
  return value === undefined ? undefined : stringArray(value, `${label}.${key}`);
}

function optionalStringRecord(
  record: Record<string, unknown>,
  key: string,
  label: string,
): Readonly<Record<string, string>> | undefined {
  const value = record[key];
  if (value === undefined) return undefined;
  const source = objectValue(value, `${label}.${key}`);
  const result: Record<string, string> = {};
  for (const [entryKey, entryValue] of Object.entries(source)) {
    result[entryKey] = stringValue(entryValue, `${label}.${key}.${entryKey}`);
  }
  return result;
}

function recolorConfig(value: unknown, label: string): RecolorConfig {
  const record = objectValue(value, label);
  const source = optionalStringArray(record, 'source', label);
  const typeName = optionalString(record, 'type_name', label);
  const base = optionalString(record, 'base', label);
  const configLabel = optionalString(record, 'label', label);
  return {
    material: stringValue(record.material, `${label}.material`),
    palettes: stringArray(record.palettes, `${label}.palettes`),
    ...(typeName !== undefined ? { type_name: typeName } : {}),
    ...(base !== undefined ? { base } : {}),
    ...(source !== undefined ? { source } : {}),
    ...(configLabel !== undefined ? { label: configLabel } : {}),
  };
}

function optionalRecolors(
  record: Record<string, unknown>,
  label: string,
): RawRecolors | undefined {
  const value = record.recolors;
  if (value === undefined) return undefined;
  const recolors = objectValue(value, `${label}.recolors`);
  if ('material' in recolors) return recolorConfig(recolors, `${label}.recolors`);

  const multi: { [key: `color_${number}`]: RecolorConfig | undefined } = {};
  for (const [key, entry] of Object.entries(recolors)) {
    if (!/^color_\d+$/u.test(key)) {
      throw new Error(`${label}.recolors.${key} is not a color_N entry`);
    }
    multi[key as `color_${number}`] = recolorConfig(
      entry,
      `${label}.recolors.${key}`,
    );
  }
  return multi;
}

function catalogRecords(value: unknown): Readonly<Record<FilePath, ItemDefinition>> {
  const source = objectValue(value, 'token decode metadata items');
  const records: Record<FilePath, ItemDefinition> = {};
  for (const [sourcePath, itemValue] of Object.entries(source)) {
    const label = `token decode metadata item ${sourcePath}`;
    const item = objectValue(itemValue, label);
    const variants = optionalStringArray(item, 'variants', label);
    const recolors = optionalRecolors(item, label);
    const aliases = optionalStringRecord(item, 'aliases', label);
    records[sourcePath as FilePath] = {
      name: stringValue(item.name, `${label}.name`),
      type_name: stringValue(item.type_name, `${label}.type_name`),
      animations: [],
      credits: [],
      ...(variants !== undefined ? { variants } : {}),
      ...(recolors !== undefined ? { recolors } : {}),
      ...(aliases !== undefined ? { aliases } : {}),
    };
  }
  return records;
}

function paletteMaterials(value: unknown): PaletteMetadata['materials'] {
  const source = objectValue(value, 'token decode metadata materials');
  const materials: Record<string, PaletteMaterialMeta> = {};
  for (const [materialName, materialValue] of Object.entries(source)) {
    const label = `token decode metadata material ${materialName}`;
    const material = objectValue(materialValue, label);
    const paletteSource = objectValue(material.palettes, `${label}.palettes`);
    const palettes: Record<string, Record<string, readonly string[]>> = {};
    for (const [version, colorNames] of Object.entries(paletteSource)) {
      const colors: Record<string, readonly string[]> = {};
      for (const colorName of stringArray(colorNames, `${label}.palettes.${version}`)) {
        colors[colorName] = [];
      }
      palettes[version] = colors;
    }
    const defaultVersion = optionalString(material, 'default', label);
    const base = optionalString(material, 'base', label);
    materials[materialName] = {
      palettes,
      ...(defaultVersion !== undefined ? { default: defaultVersion } : {}),
      ...(base !== undefined ? { base } : {}),
    };
  }
  return materials;
}

let cachedData: TokenDecodeData | undefined;

export function loadBundledTokenDecodeData(): TokenDecodeData {
  if (cachedData !== undefined) return cachedData;

  const parsed = JSON.parse(
    readFileSync(new URL('./token-decode-metadata.json', import.meta.url), 'utf8'),
  ) as unknown;
  const metadata = objectValue(parsed, 'token decode metadata');
  if (metadata.schemaVersion !== 1) {
    throw new Error('token decode metadata has an unsupported schema version');
  }
  const catalogResult = createCatalog(catalogRecords(metadata.items));
  cachedData = {
    catalog: catalogResult.catalog,
    palettes: { materials: paletteMaterials(metadata.materials), versions: {} },
    warnings: catalogResult.warnings.map((warning) => ({
      code: 'catalog_warning',
      message: warning.message,
      path: warning.path,
    })),
  };
  return cachedData;
}
