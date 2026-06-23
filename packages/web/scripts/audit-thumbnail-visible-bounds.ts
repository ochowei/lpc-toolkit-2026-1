import { existsSync, readdirSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  createCanvas,
  loadImage as napiLoadImage,
} from '@napi-rs/canvas';
import { createCatalog, createPaletteCatalog, BODY_TYPES } from '@lpc-toolkit/core';
import type { CanvasAdapter, CanvasLike, ImageLike } from '@lpc-toolkit/core';
import {
  applyThumbnailBoundsOverrides,
  deriveThumbnailTypeScales,
  serializeThumbnailFramingPolicy,
  runAuditCase,
  expandAuditCases,
  rowsToCsv,
  summaryToMarkdown,
  type ThumbnailAuditRow,
} from './thumbnail-visible-bounds-audit-lib';
import { THUMBNAIL_BOUNDS_OVERRIDES } from './thumbnail-bounds-overrides';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '../../..');
const sheetDefsDir = path.join(repoRoot, 'assets/sheet_definitions');
const customDefsDir = path.join(repoRoot, 'assets_custom/sheet_definitions');
const paletteDefsDir = path.join(repoRoot, 'assets/palette_definitions');
const spritesheetsDir = path.join(repoRoot, 'assets/spritesheets');
const policyOutputPath = path.join(
  repoRoot,
  'packages/web/src/generated/thumbnail-framing-policy.ts',
);

function walkJson(dir: string, base = dir): Record<string, any> {
  const out: Record<string, any> = {};
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) Object.assign(out, walkJson(full, base));
    else if (e.name.endsWith('.json')) {
      const key = path.relative(base, full).split(path.sep).join('/');
      out[key] = JSON.parse(readFileSync(full, 'utf8'));
    }
  }
  return out;
}

function loadRealPalettes(paletteRoot: string) {
  const records: Record<string, unknown> = {};
  const walk = (dir: string, rel: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const abs = path.join(dir, entry.name);
      const relPath = rel ? `${rel}/${entry.name}` : entry.name;
      if (entry.isDirectory()) walk(abs, relPath);
      else if (entry.name.endsWith('.json')) {
        records[`palette_definitions/${relPath}`] = JSON.parse(
          readFileSync(abs, 'utf8'),
        );
      }
    }
  };
  walk(paletteRoot, '');
  return createPaletteCatalog(records).palettes;
}

function trackedNodeAdapter(
  spritesheetsDir: string,
  failedPaths: string[],
): CanvasAdapter {
  return {
    createCanvas: (width, height) =>
      createCanvas(width, height) as unknown as CanvasLike,
    loadImage: async (logicalPath): Promise<ImageLike> => {
      const rel = logicalPath.replace(/^spritesheets\//, '');
      try {
        return (await napiLoadImage(path.join(spritesheetsDir, rel))) as unknown as ImageLike;
      } catch (error) {
        failedPaths.push(logicalPath);
        throw error;
      }
    },
  };
}

async function main() {
  const args = process.argv.slice(2);
  let outputDir = path.resolve(repoRoot, 'packages/web/.audit-output/thumbnail-visible-bounds');

  if (args.length > 0) {
    if (args[0] === '--output-dir' && args[1]) {
      outputDir = path.resolve(args[1]);
      if (args.length > 2) {
        console.error('Usage: tsx audit-thumbnail-visible-bounds.ts [--output-dir <path>]');
        process.exit(1);
      }
    } else {
      console.error('Usage: tsx audit-thumbnail-visible-bounds.ts [--output-dir <path>]');
      process.exit(1);
    }
  }

  if (!existsSync(sheetDefsDir) || !existsSync(paletteDefsDir)) {
    console.error('Error: sheet_definitions or palette_definitions not found under assets/. Run prepare-assets first.');
    process.exit(1);
  }

  console.log('Loading sheet and palette definitions...');
  const sheetRecs = walkJson(sheetDefsDir);
  if (existsSync(customDefsDir)) {
    Object.assign(sheetRecs, walkJson(customDefsDir));
  }
  const sortedSheetRecs = Object.fromEntries(
    Object.entries(sheetRecs).sort(([a], [b]) => a.localeCompare(b))
  );
  const { catalog } = createCatalog(sortedSheetRecs);
  const palettes = loadRealPalettes(paletteDefsDir);

  const cases = expandAuditCases(catalog, BODY_TYPES);
  console.log(`Expanded to ${cases.length} audit cases.`);

  const rows: ThumbnailAuditRow[] = [];
  let count = 0;

  for (const caseData of cases) {
    const failedPaths: string[] = [];
    const adapter = trackedNodeAdapter(spritesheetsDir, failedPaths);
    const deps = {
      catalog,
      palettes,
      adapter,
      failedPaths,
    };

    const row = await runAuditCase(caseData, deps);
    rows.push(row);

    count++;
    if (count % 100 === 0) {
      console.log(`Audited ${count}/${cases.length} cases...`);
    }
  }

  console.log('Generating reports...');
  const csvContent = rowsToCsv(rows);
  const markdownContent = summaryToMarkdown(rows);
  const policyRows = applyThumbnailBoundsOverrides(
    rows,
    THUMBNAIL_BOUNDS_OVERRIDES,
  );
  const policyContent = serializeThumbnailFramingPolicy(
    deriveThumbnailTypeScales(policyRows),
  );

  mkdirSync(outputDir, { recursive: true });
  writeFileSync(path.join(outputDir, 'thumbnail-visible-bounds.csv'), csvContent, 'utf8');
  writeFileSync(path.join(outputDir, 'thumbnail-visible-bounds-summary.md'), markdownContent, 'utf8');
  mkdirSync(path.dirname(policyOutputPath), { recursive: true });
  writeFileSync(policyOutputPath, policyContent, 'utf8');

  console.log(`Audit complete. Output written to ${outputDir}`);
  console.log(`Thumbnail framing policy written to ${policyOutputPath}`);
}

main().catch(err => {
  console.error('Fatal error running audit:', err);
  process.exit(1);
});
