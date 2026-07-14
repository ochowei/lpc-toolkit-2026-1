# @lpc-toolkit/core

Environment-agnostic TypeScript primitives for building catalogs, composing
LPC character spritesheets, extracting animations, recoloring pixels,
serializing selections, validating assets, and preserving precise credits.

## Runtime Boundary

Core does not load files, create a concrete canvas, or access browser globals.
Callers inject canvas creation and image loading through `CanvasAdapter`.
Browser callers can provide DOM-backed implementations; Node tests and the CLI
currently use `@napi-rs/canvas` (MIT). Core runtime source imports neither
implementation and has no dependency on filesystem or browser APIs.

See [`API.md`](../../API.md) for exported signatures.

## Example

```ts
import {
  createCatalog,
  createPaletteCatalog,
  composeSelections,
  extractAnimation,
  makeResolvePalette,
  type CanvasAdapter,
  type FilePath,
  type ItemDefinition,
  type Selections,
} from '@lpc-toolkit/core';

// The caller loads sheet_definitions and palette_definitions JSON records and
// supplies an environment-specific canvas adapter.
declare const records: Readonly<Record<FilePath, ItemDefinition>>;
declare const paletteRecords: Readonly<Record<FilePath, unknown>>;
declare const adapter: CanvasAdapter;

// 1. Build the item and palette catalogs from records keyed by file path.
const { catalog, warnings: catalogWarnings } = createCatalog(records);
const { palettes, warnings: paletteWarnings } =
  createPaletteCatalog(paletteRecords);
console.warn(...catalogWarnings, ...paletteWarnings);

// 2. Recolor-backed assets use `recolor`, not a filename `variant`.
const selections: Selections = {
  bodyType: 'male',
  items: {
    body: { typeName: 'body', name: 'Body Color', recolor: 'brown' },
    hair: { typeName: 'hair', name: 'Afro', recolor: 'black' },
  },
};

// 3. Compose the standard 832×3456 master sheet. The base URL/path is the
//    directory that contains `spritesheets/`, such as the prepared `assets/`.
const sheet = await composeSelections(selections, {
  catalog,
  adapter,
  spritesheetsBaseUrl: '/path/to/repo/assets',
  resolvePalette: makeResolvePalette(catalog, palettes, selections),
});

// 4. Crop one animation out of the master sheet.
const walk = extractAnimation(sheet, 'walk', { adapter });

// Attribution is always available alongside both outputs.
console.log(sheet.credits.licenses, walk.credits.licenses);
```

## Public API

The public surface is grouped into:

- **Catalog and palettes** — catalog creation, lookup, palettes, and palette
  resolution.
- **Selections and tokens** — selection types, hash/token parsing, and
  serialization.
- **Composition and animation** — composition, sprite-path resolution, frame
  helpers, and animation extraction.
- **Recoloring** — image and pixel recoloring helpers.
- **Credits and validation** — precise credit manifests, effective licenses,
  formatting, and asset validation.

## Attribution Contract

Every composition and animation-extraction result carries the matched credit
manifest. Callers must preserve that manifest with rendered or exported output;
attribution is part of the product contract, not optional decoration.
