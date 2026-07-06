import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import {
  createCatalog,
  createPaletteCatalog,
  type Catalog,
  type FilePath,
  type ItemDefinition,
  type PaletteMetadata,
} from '@lpc-toolkit/core';
import type { CliIssue } from './response.js';

export interface JsonRecordsResult {
  readonly records: Record<string, unknown>;
  readonly warnings: readonly CliIssue[];
}

function isJsonObjectRecord(record: unknown): record is Record<string, unknown> {
  return typeof record === 'object' && record !== null && !Array.isArray(record);
}

function walkJsonFiles(root: string): readonly string[] {
  if (!existsSync(root)) return [];
  const out: string[] = [];
  for (const entry of readdirSync(root)) {
    const full = path.join(root, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) out.push(...walkJsonFiles(full));
    else if (entry.endsWith('.json')) out.push(full);
  }
  return out;
}

function toPosixRelative(root: string, file: string): string {
  return path.relative(root, file).split(path.sep).join('/');
}

export function loadJsonRecords(root: string): JsonRecordsResult {
  const records: Record<string, unknown> = {};
  const warnings: CliIssue[] = [];
  for (const file of walkJsonFiles(root)) {
    const key = toPosixRelative(root, file);
    try {
      records[key] = JSON.parse(readFileSync(file, 'utf8')) as unknown;
    } catch (error) {
      warnings.push({
        code: 'invalid_json',
        message: error instanceof Error ? error.message : 'Invalid JSON',
        path: key,
      });
    }
  }
  return { records, warnings };
}

function filterJsonObjectRecords(
  records: Record<string, unknown>,
  warningCode: 'catalog_warning' | 'palette_warning',
): { readonly records: Record<FilePath, Record<string, unknown>>; readonly warnings: readonly CliIssue[] } {
  const filtered: Record<FilePath, Record<string, unknown>> = {};
  const warnings: CliIssue[] = [];

  for (const [recordPath, record] of Object.entries(records)) {
    if (isJsonObjectRecord(record)) {
      filtered[recordPath as FilePath] = record;
      continue;
    }

    warnings.push({
      code: warningCode,
      message: 'not a JSON object; skipped',
      path: recordPath,
    });
  }

  return { records: filtered, warnings };
}

function filterCatalogRecords(
  records: Record<string, unknown>,
): { readonly records: Record<FilePath, ItemDefinition>; readonly warnings: readonly CliIssue[] } {
  const result = filterJsonObjectRecords(records, 'catalog_warning');
  const catalogRecords: Record<FilePath, ItemDefinition> = {};

  for (const [recordPath, record] of Object.entries(result.records)) {
    catalogRecords[recordPath as FilePath] = record as unknown as ItemDefinition;
  }

  return { records: catalogRecords, warnings: result.warnings };
}

export function loadCatalogFromRoots(
  sheetDefinitionsRoot: string,
  customSheetDefinitionsRoot: string,
): { readonly catalog: Catalog; readonly warnings: readonly CliIssue[] } {
  const base = loadJsonRecords(sheetDefinitionsRoot);
  const custom = loadJsonRecords(customSheetDefinitionsRoot);
  const baseRecords = filterCatalogRecords(base.records);
  const customRecords = filterCatalogRecords(custom.records);
  const records = {
    ...baseRecords.records,
    ...customRecords.records,
  };
  const result = createCatalog(records);
  return {
    catalog: result.catalog,
    warnings: [
      ...base.warnings,
      ...custom.warnings,
      ...baseRecords.warnings,
      ...customRecords.warnings,
      ...result.warnings.map((warning) => ({
        code: 'catalog_warning',
        message: warning.message,
        path: warning.path,
      })),
    ],
  };
}

export function loadPalettesFromRoot(
  paletteDefinitionsRoot: string,
): { readonly palettes: PaletteMetadata; readonly warnings: readonly CliIssue[] } {
  const loaded = loadJsonRecords(paletteDefinitionsRoot);
  const paletteRecords = filterJsonObjectRecords(loaded.records, 'palette_warning');
  const result = createPaletteCatalog(paletteRecords.records);
  return {
    palettes: result.palettes,
    warnings: [
      ...loaded.warnings,
      ...paletteRecords.warnings,
      ...result.warnings.map((warning) => ({
        code: 'palette_warning',
        message: warning.message,
        path: warning.path,
      })),
    ],
  };
}
