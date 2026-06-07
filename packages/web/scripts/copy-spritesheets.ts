/**
 * Copies the spritesheet PNG subset the slice needs from the local
 * `assets/` directory into packages/web/public/spritesheets/.
 *
 *  - Pass B (layer switching): every item of each shown type-name at the
 *    default body type.
 *  - Pass A (body-type switching): the initial outfit across all BODY_TYPES.
 *
 * assets/ is never written. Idempotent: clears the target subtree first.
 */
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  BODY_TYPES,
  createCatalog,
  type FilePath,
  type ItemDefinition,
  type Selections,
} from '@lpc-toolkit/core';
import {
  pickInitialSelections,
  selectionForItem,
  toSelections,
} from '../src/slice/selection';
import { dirsForSelections } from '../src/slice/sprite-dirs';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '../../..');
const sheetDefsDir = path.join(repoRoot, 'assets/sheet_definitions');
const spritesSrc = path.join(repoRoot, 'assets/spritesheets');
const spritesDest = path.join(here, '../public/spritesheets');

if (!existsSync(sheetDefsDir) || !existsSync(spritesSrc)) {
  console.error(
    '[copy-sprites] assets/ not found. Run copy commands first.',
  );
  process.exit(1);
}

function walkJson(dir: string, base = dir): Record<FilePath, ItemDefinition> {
  const out: Record<FilePath, ItemDefinition> = {};
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) Object.assign(out, walkJson(full, base));
    else if (entry.name.endsWith('.json')) {
      // Forward-slash key, comparable to Vite import.meta.glob keys.
      const key = path.relative(base, full).split(path.sep).join('/');
      out[key] = JSON.parse(readFileSync(full, 'utf8')) as ItemDefinition;
    }
  }
  return out;
}

// DETERMINISM CONTRACT (do not remove): pickInitialSelections is
// deterministic only w.r.t. catalog order, which follows records insertion
// order (createCatalog pushes byTypeName arrays in Object.entries order).
// The app builds records from Vite import.meta.glob (keys returned sorted);
// readdirSync order is filesystem/CI-dependent. Sorting by the shared
// sheet_definitions-relative key makes BOTH call sites pick the IDENTICAL
// outfit, so the bundled asset subset always matches what the app composes.
const records = Object.fromEntries(
  Object.entries(walkJson(sheetDefsDir)).sort(([a], [b]) =>
    a < b ? -1 : a > b ? 1 : 0,
  ),
);
const { catalog } = createCatalog(records);
const { state, shownTypeNames } = pickInitialSelections(catalog);

const dirs = new Set<string>();

// Pass B: all items of shown type-names across all body types.
for (const bt of BODY_TYPES) {
  for (const tn of shownTypeNames) {
    for (const item of catalog.byTypeName.get(tn) ?? []) {
      const sel: Selections = {
        bodyType: bt,
        items: { [tn]: selectionForItem(tn, item) },
      };
      for (const d of dirsForSelections(catalog, sel)) dirs.add(d);
    }
  }
}

// Pass A: the initial outfit across every standard body type.
const baseItems = toSelections(state).items;
for (const bt of BODY_TYPES) {
  for (const d of dirsForSelections(catalog, { bodyType: bt, items: baseItems }))
    dirs.add(d);
}

rmSync(spritesDest, { recursive: true, force: true });
mkdirSync(spritesDest, { recursive: true });

let copied = 0;
let bytes = 0;
for (const d of dirs) {
  const from = path.join(spritesSrc, d);
  if (!existsSync(from)) continue;
  const to = path.join(spritesDest, d);
  mkdirSync(path.dirname(to), { recursive: true });
  cpSync(from, to, { recursive: true });
  copied++;
  for (const f of readdirSync(from)) {
    const fp = path.join(from, f);
    if (statSync(fp).isFile()) bytes += statSync(fp).size;
  }
}

console.log(
  `[copy-sprites] ${copied} dir(s), ~${(bytes / 1e6).toFixed(1)} MB -> public/spritesheets/`,
);
