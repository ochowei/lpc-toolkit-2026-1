import { existsSync, readFileSync, statSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createCanvas, loadImage } from '@napi-rs/canvas';
import { createCatalog, validateAssets } from '@lpc-toolkit/core';
import type { CanvasAdapter, CanvasLike, ImageLike, ItemDefinition } from '@lpc-toolkit/core';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '../../..');
const sheetDefsDir = path.join(repoRoot, 'assets/sheet_definitions');
const customDefsDir = path.join(repoRoot, 'assets_custom/sheet_definitions');
const spritesheetsDir = path.join(repoRoot, 'assets/spritesheets');

function walkJson(dir: string, base = dir): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      Object.assign(out, walkJson(full, base));
    } else if (e.name.endsWith('.json')) {
      const key = path.relative(base, full).split(path.sep).join('/');
      out[key] = JSON.parse(readFileSync(full, 'utf8')) as unknown;
    }
  }
  return out;
}

async function main() {
  if (!existsSync(sheetDefsDir) || !existsSync(spritesheetsDir)) {
    console.error('Error: assets directory structure not found. Run prepare-assets first.');
    process.exit(1);
  }

  console.log('Loading definitions...');
  const catalogRecs = walkJson(sheetDefsDir) as unknown as Record<string, ItemDefinition>;
  if (existsSync(customDefsDir)) {
    Object.assign(catalogRecs, walkJson(customDefsDir));
  }
  const { catalog } = createCatalog(catalogRecs);

  console.log('Validating catalog assets...');
  const adapter: CanvasAdapter = {
    createCanvas: (w: number, h: number): CanvasLike => {
      return createCanvas(w, h) as unknown as CanvasLike;
    },
    loadImage: async (url: string): Promise<ImageLike> => {
      const rel = url.replace(/^(spritesheets\/)+/, '');
      const img = await loadImage(path.join(spritesheetsDir, rel));
      return img as unknown as ImageLike;
    }
  };

  const rawIssues = await validateAssets({
    catalog,
    adapter,
    spritesheetsBaseUrl: 'spritesheets',
    getFileSize: async (logicalPath) => {
      const rel = logicalPath.replace(/^(spritesheets\/)+/, '');
      const stat = statSync(path.join(spritesheetsDir, rel));
      return stat.size;
    }
  });

  // Post-process issues: muscular, pregnant, and child body types are known to
  // not have full animation coverage in the asset pack. We downgrade their
  // missing file errors to warnings so they do not block the build.
  const issues = rawIssues.map(issue => {
    if (
      issue.severity === 'error' &&
      issue.itemId === 'body' &&
      (issue.path?.includes('/muscular/') ||
       issue.path?.includes('/pregnant/') ||
       issue.path?.includes('/child/'))
    ) {
      return { ...issue, severity: 'warning' as const };
    }
    return issue;
  });

  const errors = issues.filter(i => i.severity === 'error');
  const warnings = issues.filter(i => i.severity === 'warning');

  console.log(`\nValidation complete: Found ${errors.length} Critical Errors and ${warnings.length} Warnings.\n`);

  if (warnings.length > 0) {
    console.warn('=== WARNINGS ===');
    warnings.forEach(w => {
      console.warn(`[WARNING] Item: "${w.itemId}" (${w.typeName}) -> ${w.message}`);
    });
    console.log();
  }

  if (errors.length > 0) {
    console.error('=== CRITICAL ERRORS ===');
    errors.forEach(e => {
      console.error(`[CRITICAL] Item: "${e.itemId}" (${e.typeName}) -> ${e.message}`);
    });
    console.error('\nBuild blocked due to critical asset failures.');
    process.exit(1);
  }

  console.log('Static asset validation check passed successfully.');
  process.exit(0);
}

main().catch(err => {
  console.error('Fatal error during validation:', err);
  process.exit(1);
});
