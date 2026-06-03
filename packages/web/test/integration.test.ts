import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  createCanvas,
  loadImage as napiLoadImage,
} from '@napi-rs/canvas';
import { describe, expect, it } from 'vitest';
import {
  composeSelections,
  computeEffectiveLicense,
  createCatalog,
  extractAnimation,
  getCredits,
  SHEET_WIDTH,
  type CanvasAdapter,
  type CanvasLike,
  type FilePath,
  type ImageLike,
  type ItemDefinition,
} from '@lpc-toolkit/core';
import { pickInitialSelections, toSelections } from '../src/slice/selection';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '../../..');
const sheetDefsDir = path.join(repoRoot, 'assets/sheet_definitions');
const publicSprites = path.join(here, '../public/spritesheets');

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

// Mirrors copy-spritesheets.ts: sort records by key so the catalog order
// (hence pickInitialSelections) is filesystem/CI-independent and matches
// the app's Vite-sorted-glob order.
function sortedRecords(
  recs: Record<FilePath, ItemDefinition>,
): Record<FilePath, ItemDefinition> {
  return Object.fromEntries(
    Object.entries(recs).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)),
  );
}

// Node adapter: napi-rs canvas + filesystem loadImage from public/.
function nodeAdapter(): CanvasAdapter {
  return {
    createCanvas: (w, h) => createCanvas(w, h) as unknown as CanvasLike,
    loadImage: async (p: string): Promise<ImageLike> => {
      const rel = p.replace(/^spritesheets\//, '');
      return (await napiLoadImage(
        path.join(publicSprites, rel),
      )) as unknown as ImageLike;
    },
  };
}

const haveUpstream = existsSync(sheetDefsDir);
const haveSprites = existsSync(publicSprites);

describe.runIf(haveUpstream)('pickInitialSelections determinism', () => {
  it('is identical regardless of record order (copy-script vs app parity)', () => {
    const recs = walkJson(sheetDefsDir);
    const forward = createCatalog(sortedRecords(recs)).catalog;
    const reversed = createCatalog(
      sortedRecords(
        Object.fromEntries(Object.entries(recs).reverse()),
      ),
    ).catalog;
    // Same sort applied to differently-ordered inputs => identical pick.
    // This locks the contract the copy script (Task 7) depends on.
    expect(pickInitialSelections(forward).state).toEqual(
      pickInitialSelections(reversed).state,
    );
  });
});

describe.runIf(haveUpstream && haveSprites)('core pipeline (real assets)', () => {
  it('composes, extracts, and attributes the initial outfit', async () => {
    const { catalog } = createCatalog(sortedRecords(walkJson(sheetDefsDir)));
    const { state } = pickInitialSelections(catalog);
    const selections = toSelections(state);

    const sheet = await composeSelections(selections, {
      catalog,
      adapter: nodeAdapter(),
      spritesheetsBaseUrl: '',
    });

    expect(sheet.width).toBe(SHEET_WIDTH); // 832
    expect(sheet.height).toBe(3456);
    expect(sheet.animations).toContain('walk');

    const anim = extractAnimation(sheet, 'walk', { adapter: nodeAdapter() });
    expect(anim.width).toBe(SHEET_WIDTH);
    expect(anim.directions).toBe(4);
    expect(anim.frameCount).toBeGreaterThan(0);

    const credits = getCredits(selections, catalog);
    expect(credits.entries.length).toBeGreaterThan(0);
    expect(credits.licenses.length).toBeGreaterThan(0);

    const effective = computeEffectiveLicense(credits);
    expect(credits.licenses).toContain(effective);
  });
});

it('fails loudly if assets are missing', () => {
  if (!haveUpstream)
    throw new Error('assets/ not found. Run copy commands first.');
  if (!haveSprites)
    throw new Error('public/spritesheets missing — run pnpm --filter @lpc-toolkit/web copy-sprites');
  expect(true).toBe(true);
});
