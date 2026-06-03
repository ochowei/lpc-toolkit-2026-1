import {
  createCatalog,
  type Catalog,
  type CatalogLoadWarning,
  type CreateCatalogResult,
  type FilePath,
  type ItemDefinition,
} from '@lpc-toolkit/core';

/** Small wrapper kept for tests that build a catalog from synthetic records. */
export function recordsToCatalog(
  records: Readonly<Record<FilePath, ItemDefinition>>,
): CreateCatalogResult {
  return createCatalog(records);
}

const ASSETS_PREFIX = 'assets/sheet_definitions/';

// Vite's `import.meta.glob` keys are relative to this file
// (e.g. `../../../../assets/sheet_definitions/headwear/...`). Strip that
// leading noise so `sourcePath` reflects the path inside the assets root.
export function normalizeUpstreamKey(key: string): string {
  const idx = key.lastIndexOf(ASSETS_PREFIX);
  return idx >= 0 ? key.slice(idx + ASSETS_PREFIX.length) : key;
}

// Module-level gate: React StrictMode mounts → unmounts → re-mounts the App
// in dev, calling `loadCatalogFromUpstream` twice with identical results.
// Emit upstream data-quality warnings once per session; HMR replacing this
// module naturally resets the flag.
let warningsEmitted = false;

/** Log catalog load warnings once per module lifetime. */
export function emitCatalogWarningsOnce(
  warnings: readonly CatalogLoadWarning[],
): void {
  if (warnings.length === 0 || warningsEmitted) return;
  console.warn(`[catalog] ${warnings.length} load warning(s)`, warnings);
  warningsEmitted = true;
}

/**
 * Test-only hook to reset the emit-once gate between specs. Body is
 * dead-code-eliminated in production builds (Vite statically replaces
 * `process.env.NODE_ENV`).
 */
export function __resetCatalogWarningOnceForTests(): void {
  if (process.env.NODE_ENV === 'production') return;
  warningsEmitted = false;
}

/**
 * Build the catalog from the read-only `upstream/` submodule. The glob is
 * static and relative: from packages/web/src/catalog/ the repo root is four
 * levels up. Vite inlines every matched JSON's default export at build time.
 * If the submodule is not initialized the glob is empty and we throw with a
 * fix instruction (spec §5).
 */
export function loadCatalogFromUpstream(): Catalog {
  // '**/*.json' also matches meta_*.json; createCatalog skips those
  // internally (isMetaFile), so they never become items or warnings.
  const mods = import.meta.glob<ItemDefinition>(
    '../../../../assets/sheet_definitions/**/*.json',
    { eager: true, import: 'default' },
  );
  const records: Record<FilePath, ItemDefinition> = {};
  for (const [key, def] of Object.entries(mods)) {
    records[normalizeUpstreamKey(key)] = def;
  }

  if (Object.keys(records).length === 0) {
    throw new Error(
      'No sheet definitions found. Run: git submodule update --init',
    );
  }

  const { catalog, warnings } = recordsToCatalog(records);
  emitCatalogWarningsOnce(warnings);
  if (catalog.typeNames.length === 0) {
    throw new Error('Catalog is empty after ingest (all records invalid).');
  }
  return catalog;
}
