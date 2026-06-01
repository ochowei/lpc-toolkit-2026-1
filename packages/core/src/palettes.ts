import type {
  FilePath,
  PaletteMaterialMeta,
  PaletteMetadata,
  PaletteVersionColors,
  PaletteVersionMeta,
} from './types.js';

/**
 * Represents a warning encountered during the parsing or validation of a palette file.
 */
export interface PaletteLoadWarning {
  /** The file path of the palette record being processed. */
  readonly path: FilePath;
  /** A descriptive message explaining the parsing or validation issue. */
  readonly message: string;
}

/**
 * The consolidated outcome of the palette catalog creation process.
 */
export interface CreatePaletteCatalogResult {
  /** The successfully resolved, indexed, and order-independent palette metadata. */
  readonly palettes: PaletteMetadata;
  /** List of warnings generated during parsing, filename tokenization, and color coercion. */
  readonly warnings: readonly PaletteLoadWarning[];
}

/**
 * Extracts the trailing filename portion from a given file path.
 * Supports cross-platform POSIX ('/') and Windows ('\\') path structures.
 * 
 * @param p - The raw file path string.
 * @returns The trailing filename component.
 */
function basename(p: string): string {
  let i = p.length;
  while (i > 0) {
    const ch = p.charCodeAt(i - 1);
    if (ch === 47 || ch === 92) break; // '/' or '\\'
    i--;
  }
  return p.slice(i);
}

/**
 * Type guard validating that a value is a non-null, non-array object.
 * 
 * @param v - The value to evaluate.
 * @returns `true` if the value is a standard JSON object, `false` otherwise.
 */
function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** 
 * Mutable builder interface for representing a material while it is being loaded.
 * Merged order-independently and then frozen into `PaletteMaterialMeta`.
 */
interface MaterialBuild {
  palettes: Record<string, PaletteVersionColors>;
  type?: 'material';
  label?: string;
  desc?: string;
  default?: string;
  base?: string;
}

/**
 * Retrieves the material builder record for the given material name,
 * dynamically initializing it if it has not yet been registered.
 * Supports order-independence since data files can arrive before meta files.
 * 
 * @param materials - The ongoing builder map for materials.
 * @param name - The identifier of the material.
 * @returns The active `MaterialBuild` instance.
 */
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
 * Coerces and validates raw JSON palette version colors into structured `PaletteVersionColors`.
 * Performs thorough validation to verify that every color mapping value is indeed
 * an array of hex color strings. Non-array or non-string values are silently skipped
 * (recording a warning) rather than crashing the catalog generation.
 * This mirrors the permissive upstream behavior while preserving TypeScript type safety.
 * 
 * @param json - Raw key-value mappings of color ramps from the palette definition file.
 * @param path - The source file path (for warning context).
 * @param warnings - Warning queue for logging validation details.
 * @returns The validated `PaletteVersionColors` record.
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
 * Ingests a set of raw, source-agnostic palette definition files and compiles them into a
 * structured, read-only `PaletteMetadata` catalog.
 * 
 * Port of upstream `scripts/generateSources/palettes.js` (`parsePalette`).
 * 
 * Process and Order-Independent Design Principles:
 * 1. Data files (`<material>_<version>.json`) and meta files (`meta_<name>.json`) can be processed
 *    in any order. We use a dynamic lookup map and an `ensureMaterial` utility to seamlessly merge
 *    color ramps and meta parameters as they arrive.
 * 2. Standardize filenames. Extract material/version identifiers directly from the filename stem:
 *    - `meta_<name>.json` with `{ type: 'material' }`: Contains high-level material attributes (label, desc, default, base).
 *    - `meta_<name>.json` with `{ type: 'version' }` (or missing type): Declares a global version definition.
 *    - `<material>_<version>.json`: Contains concrete color maps and is loaded into `materials[material].palettes[version]`.
 * 3. Enforce strict JSON object validation on records. Malformed JSON records or missing identifiers
 *    are bypassed and logged to the warning array.
 * 
 * @param records - Dictionary matching file paths to their raw JSON-decoded values.
 * @returns A result structure containing the immutable palette catalog and load warnings.
 */
export function createPaletteCatalog(
  records: Readonly<Record<FilePath, unknown>>,
): CreatePaletteCatalogResult {
  const warnings: PaletteLoadWarning[] = [];
  const materials = new Map<string, MaterialBuild>();
  const versions: Record<string, PaletteVersionMeta> = {};

  for (const [path, json] of Object.entries(records)) {
    const fileName = basename(path);

    // Step 1: Validate input JSON shape
    if (!isObject(json)) {
      warnings.push({ path, message: 'not a JSON object; skipped' });
      continue;
    }

    // Step 2: Handle metadata definition files
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
        // Meta describes a material: merge global metadata descriptors onto the material entry
        const m = ensureMaterial(materials, name);
        m.type = 'material';
        if (typeof json.label === 'string') m.label = json.label;
        if (typeof json.desc === 'string') m.desc = json.desc;
        if (typeof json.default === 'string') m.default = json.default;
        if (typeof json.base === 'string') m.base = json.base;
      } else {
        // Meta describes a version: register version metadata descriptors
        const v: PaletteVersionMeta = {
          ...(json.type === 'version' ? { type: 'version' } : {}),
          ...(typeof json.label === 'string' ? { label: json.label } : {}),
          ...(typeof json.desc === 'string' ? { desc: json.desc } : {}),
        };
        versions[name] = v;
      }
      continue;
    }

    // Step 3: Handle concrete color data files: "<material>_<version>.json"
    // Destructures filename to isolate tokens. Upstream pattern assumes IDs do not contain "_".
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

    // Retrieve/initialize the material build and attach parsed color ramps
    const m = ensureMaterial(materials, material);
    m.palettes[version] = coerceVersionColors(json, path, warnings);
  }

  // Step 4: Finalize built materials by freezing properties into the Readonly format
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
