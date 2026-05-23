import { createPaletteCatalog, type PaletteMetadata } from '@lpc-toolkit/core';

/**
 * Build `PaletteMetadata` from a `{ path: parsedJson }` record map.
 * `createPaletteCatalog` derives material/version from each file's
 * basename, so the path prefix does not matter. Warnings are logged, not
 * thrown — mirrors `recordsToCatalog`.
 */
export function recordsToPalettes(
  records: Readonly<Record<string, unknown>>,
): PaletteMetadata {
  const { palettes, warnings } = createPaletteCatalog(records);
  if (warnings.length > 0) {
    console.warn(`[palettes] ${warnings.length} load warning(s)`, warnings);
  }
  return palettes;
}

const UPSTREAM_PREFIX = 'upstream/palette_definitions/';

/**
 * Strip the Vite glob prefix preceding `upstream/palette_definitions/` so a
 * record key reflects the path inside the upstream root (keeps load
 * warnings readable). Mirrors `normalizeUpstreamKey` in `load-catalog.ts`.
 */
export function normalizePaletteKey(key: string): string {
  const idx = key.lastIndexOf(UPSTREAM_PREFIX);
  return idx >= 0 ? key.slice(idx + UPSTREAM_PREFIX.length) : key;
}

/**
 * Build `PaletteMetadata` from the read-only `upstream/` submodule. The
 * glob is static and relative: from packages/web/src/catalog/ the repo
 * root is four levels up. Vite inlines every matched JSON at build time.
 * Throws with a fix instruction if the submodule is not initialized.
 * Throws if all palette files fail to parse (empty catalog after ingest).
 */
export function loadPalettesFromUpstream(): PaletteMetadata {
  const mods = import.meta.glob<unknown>(
    '../../../../upstream/palette_definitions/**/*.json',
    { eager: true, import: 'default' },
  );
  if (Object.keys(mods).length === 0) {
    throw new Error(
      'No palette definitions found. Run: git submodule update --init',
    );
  }
  const records: Record<string, unknown> = {};
  for (const [key, json] of Object.entries(mods)) {
    records[normalizePaletteKey(key)] = json;
  }
  const palettes = recordsToPalettes(records);
  if (Object.keys(palettes.materials).length === 0) {
    throw new Error(
      'Palette catalog is empty after ingest (all files invalid).',
    );
  }
  return palettes;
}
