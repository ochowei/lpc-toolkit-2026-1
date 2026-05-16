import type {
  FilePath,
  PaletteMaterialMeta,
  PaletteMetadata,
  PaletteVersionColors,
  PaletteVersionMeta,
} from './types.js';

export interface PaletteLoadWarning {
  readonly path: FilePath;
  readonly message: string;
}

export interface CreatePaletteCatalogResult {
  readonly palettes: PaletteMetadata;
  readonly warnings: readonly PaletteLoadWarning[];
}

function basename(p: string): string {
  let i = p.length;
  while (i > 0) {
    const ch = p.charCodeAt(i - 1);
    if (ch === 47 || ch === 92) break; // '/' or '\\'
    i--;
  }
  return p.slice(i);
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** Mutable build view of a material; frozen into `PaletteMaterialMeta`. */
interface MaterialBuild {
  palettes: Record<string, PaletteVersionColors>;
  type?: 'material';
  label?: string;
  desc?: string;
  default?: string;
  base?: string;
}

function ensureMaterial(
  materials: Map<string, MaterialBuild>,
  name: string,
): MaterialBuild {
  let m = materials.get(name);
  if (!m) {
    m = { palettes: {} };
    materials.set(name, m);
  }
  return m;
}

/**
 * Coerce a data-file JSON into `{ recolor: string[] }`. Non-array / non-
 * string entries are dropped (with a warning) rather than failing the
 * whole file — mirrors the lenient, blind-assign upstream behaviour while
 * keeping the result strictly typed.
 */
function coerceVersionColors(
  json: Record<string, unknown>,
  path: FilePath,
  warnings: PaletteLoadWarning[],
): PaletteVersionColors {
  const out: Record<string, readonly string[]> = {};
  for (const [recolor, value] of Object.entries(json)) {
    if (
      Array.isArray(value) &&
      value.every((c): c is string => typeof c === 'string')
    ) {
      out[recolor] = value;
    } else {
      warnings.push({
        path,
        message: `recolor "${recolor}" is not an array of color strings; skipped`,
      });
    }
  }
  return out;
}

/**
 * Ingest `palette_definitions/**` into a `PaletteMetadata` — the palette
 * analogue of `createCatalog` (Step 4.1). DI / source-agnostic (D.1): the
 * caller hands a `{ path: parsedJson }` map (web `import.meta.glob`, cli
 * directory walk); core derives material / version from the **filename**,
 * faithfully porting upstream `scripts/generateSources/palettes.js`
 * (`parsePalette`):
 *
 * - `meta_<name>.json` with `type: 'material'` → that material's meta
 *   (label / desc / default / base); `palettes` filled from its data files.
 * - `meta_<name>.json` with `type: 'version'` → a version entry.
 * - `<material>_<version>.json` → `materials[material].palettes[version]`.
 *
 * The merge is order-independent (a data file may precede its `meta_`).
 * Malformed entries are skipped with a warning (never throws on bad data),
 * mirroring `createCatalog`'s `{ result, warnings }` contract.
 */
export function createPaletteCatalog(
  records: Readonly<Record<FilePath, unknown>>,
): CreatePaletteCatalogResult {
  const warnings: PaletteLoadWarning[] = [];
  const materials = new Map<string, MaterialBuild>();
  const versions: Record<string, PaletteVersionMeta> = {};

  for (const [path, json] of Object.entries(records)) {
    const fileName = basename(path);

    if (!isObject(json)) {
      warnings.push({ path, message: 'not a JSON object; skipped' });
      continue;
    }

    if (fileName.startsWith('meta_')) {
      const name = fileName.slice('meta_'.length).replace(/\.json$/i, '');
      if (!name) {
        warnings.push({
          path,
          message: 'could not derive material/version name from filename',
        });
        continue;
      }

      if (json.type === 'material') {
        const m = ensureMaterial(materials, name);
        m.type = 'material';
        if (typeof json.label === 'string') m.label = json.label;
        if (typeof json.desc === 'string') m.desc = json.desc;
        if (typeof json.default === 'string') m.default = json.default;
        if (typeof json.base === 'string') m.base = json.base;
      } else {
        const v: PaletteVersionMeta = {
          ...(json.type === 'version' ? { type: 'version' } : {}),
          ...(typeof json.label === 'string' ? { label: json.label } : {}),
          ...(typeof json.desc === 'string' ? { desc: json.desc } : {}),
        };
        versions[name] = v;
      }
      continue;
    }

    // Data file: "<material>_<version>.json". Mirrors upstream
    // `fileName.replace(".json","").split("_")` destructured to the first
    // two tokens (real ids have no "_").
    const stem = fileName.replace(/\.json$/i, '');
    const tokens = stem.split('_');
    const material = tokens[0] ?? '';
    const version = tokens[1] ?? '';
    if (!material || !version) {
      warnings.push({
        path,
        message: `could not derive material/version from filename "${fileName}"`,
      });
      continue;
    }

    const m = ensureMaterial(materials, material);
    m.palettes[version] = coerceVersionColors(json, path, warnings);
  }

  const builtMaterials: Record<string, PaletteMaterialMeta> = {};
  for (const [name, m] of materials) {
    builtMaterials[name] = {
      palettes: m.palettes,
      ...(m.type ? { type: m.type } : {}),
      ...(m.label !== undefined ? { label: m.label } : {}),
      ...(m.desc !== undefined ? { desc: m.desc } : {}),
      ...(m.default !== undefined ? { default: m.default } : {}),
      ...(m.base !== undefined ? { base: m.base } : {}),
    };
  }

  return {
    palettes: { materials: builtMaterials, versions },
    warnings,
  };
}
