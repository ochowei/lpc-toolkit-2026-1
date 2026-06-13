# Asset Validation and Audit Improvements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement build-time asset validation, runtime composition safety guards, and audit script robustness improvements.

**Architecture:** Add a pure TypeScript asset validator in `@lpc-toolkit/core`, wrap image loading with warning fallbacks in `composeSelections`, build a validator CLI runner in `@lpc-toolkit/web`, and upgrade `runAuditCase` to support direction loops and custom animation regions.

**Tech Stack:** TypeScript, Node.js, Vitest, `@napi-rs/canvas`.

---

### Task 1: Core - Add Asset Validator

**Files:**
- Create: `packages/core/src/validation/asset-validator.ts`
- Create: `packages/core/test/validation/asset-validator.test.ts`
- Modify: `packages/core/src/index.ts`

- [x] **Step 1: Write unit tests for asset validator**
  - Commit: 33de44301
  - Verification: Created `packages/core/test/validation/asset-validator.test.ts` and helper `packages/core/test/helpers/catalog.ts`.

Create `packages/core/test/validation/asset-validator.test.ts`:
```typescript
import { describe, expect, it } from 'vitest';
import { makeCatalog } from '../helpers/catalog.js';
import { validateAssets } from '../../src/validation/asset-validator.js';
import type { CanvasAdapter, CanvasLike, ImageLike } from '../../src/index.js';

const mockAdapter = (
  loadMock: (url: string) => Promise<ImageLike>,
  createMock?: (w: number, h: number) => CanvasLike
): CanvasAdapter => ({
  createCanvas: createMock ?? ((w, h) => ({
    width: w,
    height: h,
    getContext: () => ({
      drawImage: () => {},
      getImageData: () => ({
        data: new Uint8ClampedArray(w * h * 4),
        width: w,
        height: h,
      }),
    }),
  } as unknown as CanvasLike)),
  loadImage: loadMock,
});

describe('validateAssets', () => {
  it('identifies missing body assets as errors and accessory as warnings', async () => {
    const catalog = makeCatalog([
      {
        name: 'Human Male',
        type_name: 'body',
        animations: ['walk'],
        credits: [],
        layer_1: { zPos: 0, male: 'body/male/' },
      },
      {
        name: 'Bowtie',
        type_name: 'neck',
        animations: ['walk'],
        credits: [],
        layer_1: { zPos: 50, male: 'neck/bowtie/' },
      }
    ]);

    const adapter = mockAdapter(async (url) => {
      if (url.includes('body')) {
        throw new Error('File not found');
      }
      return { width: 64, height: 64 } as ImageLike;
    });

    const issues = await validateAssets({
      catalog,
      adapter,
      spritesheetsBaseUrl: '',
    });

    const errors = issues.filter(i => i.severity === 'error');
    const warnings = issues.filter(i => i.severity === 'warning');

    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0]?.itemId).toBe('item_0_human_male');
    expect(warnings.length).toBeGreaterThan(0);
    expect(warnings[0]?.itemId).toBe('item_1_bowtie');
  });
});
```

- [x] **Step 2: Run tests to verify failure**
  - Commit: 33de44301
  - Verification: `vitest run` fails with missing module import error.

Run: `pnpm --filter @lpc-toolkit/core test`
Expected: FAIL due to missing `asset-validator.ts` module.

- [x] **Step 3: Implement asset-validator.ts**
  - Commit: 33de44301, e52aa4ee5
  - Verification: `packages/core/src/validation/asset-validator.ts` implemented with clean types.

Create `packages/core/src/validation/asset-validator.ts`:
```typescript
import type { Catalog, ItemDefinition } from '../types.js';
import type { CanvasAdapter, ImageLike } from '../adapters.js';
import { resolveLayers, ANIMATION_OFFSETS } from '../compose.js';

export interface ValidationIssue {
  readonly itemId: string;
  readonly typeName: string;
  readonly severity: 'error' | 'warning';
  readonly message: string;
  readonly path?: string;
}

export interface ValidateAssetsOptions {
  readonly catalog: Catalog;
  readonly adapter: CanvasAdapter;
  readonly spritesheetsBaseUrl: string;
  readonly getFileSize?: (logicalPath: string) => Promise<number>;
}

function supportsFolder(animations: readonly string[], folder: string): boolean {
  if (folder === 'combat_idle') return animations.includes('combat');
  if (folder === 'backslash') {
    return animations.includes('1h_slash') || animations.includes('1h_backslash');
  }
  if (folder === 'halfslash') return animations.includes('1h_halfslash');
  return animations.includes(folder);
}

export async function validateAssets(
  options: ValidateAssetsOptions
): Promise<readonly ValidationIssue[]> {
  const { catalog, adapter, spritesheetsBaseUrl, getFileSize } = options;
  const issues: ValidationIssue[] = [];

  const bodyTypes = ['male', 'female', 'muscular', 'pregnant', 'teen', 'child'];

  for (const [itemId, item] of catalog.byItemId.entries()) {
    const isBody = item.type_name === 'body';
    const severity = isBody ? 'error' : 'warning';

    for (const bodyType of bodyTypes) {
      // Check bodyType compatibility
      const bodyTypesObj = (item as any).body_types;
      if (bodyTypesObj && !bodyTypesObj[bodyType]) continue;

      const variants = item.variants && item.variants.length > 0 ? item.variants : [undefined];

      for (const variant of variants) {
        // Construct a single-item Selection
        const selections = {
          bodyType,
          items: {
            [item.type_name]: {
              typeName: item.type_name,
              name: item.name,
              ...(variant !== undefined ? { variant } : {}),
            },
          },
        };

        const resolved = resolveLayers(selections as any, catalog);
        for (const layer of resolved) {
          const variantFile = layer.variant ? String(layer.variant) : '';
          const tail = variantFile ? `/${variantFile}` : '';

          // Gather standard paths
          const pathsToCheck: string[] = [];
          if (layer.customAnimation) {
            const file = variantFile ? `${variantFile}` : '';
            if (file) {
              pathsToCheck.push(`spritesheets/${layer.basePath}${file}.png`);
            }
          } else {
            for (const folder of Object.keys(ANIMATION_OFFSETS)) {
              if (!supportsFolder(layer.animations, folder)) continue;
              pathsToCheck.push(`spritesheets/${layer.basePath}${folder}${tail}.png`);
            }
          }

          for (const rawPath of pathsToCheck) {
            const fullPath = spritesheetsBaseUrl ? `${spritesheetsBaseUrl}/${rawPath}` : rawPath;
            try {
              const img = await adapter.loadImage(fullPath);

              // Blank placeholder check
              let isBlank = false;
              if (getFileSize) {
                try {
                  const size = await getFileSize(fullPath);
                  if (size < 1024) {
                    isBlank = checkImagePixelsBlank(img, adapter);
                  }
                } catch {
                  // Fallback if getFileSize fails
                }
              }

              if (isBlank) {
                issues.push({
                  itemId,
                  typeName: item.type_name,
                  severity,
                  message: `Asset file is empty/transparent placeholder: ${rawPath}`,
                  path: rawPath,
                });
              }
            } catch (err) {
              issues.push({
                itemId,
                typeName: item.type_name,
                severity,
                message: `Missing asset file: ${rawPath}`,
                path: rawPath,
              });
            }
          }
        }
      }
    }
  }

  return issues;
}

function checkImagePixelsBlank(img: ImageLike, adapter: CanvasAdapter): boolean {
  try {
    const canvas = adapter.createCanvas(img.width, img.height);
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0);
    const imageData = ctx.getImageData(0, 0, img.width, img.height);
    const data = imageData.data;
    for (let i = 3; i < data.length; i += 4) {
      if (data[i]! > 0) return false;
    }
    return true;
  } catch {
    return false;
  }
}
```

- [x] **Step 4: Export validateAssets in packages/core/src/index.ts**
  - Commit: 33de44301
  - Verification: Exports added to `packages/core/src/index.ts`.

Modify `packages/core/src/index.ts`:
```typescript
export { validateAssets } from './validation/asset-validator.js';
export type { ValidateAssetsOptions, ValidationIssue } from './validation/asset-validator.js';
```

- [x] **Step 5: Run tests and verify PASS**
  - Commit: e52aa4ee5
  - Verification: `vitest run` PASS (155 tests pass).

Run: `pnpm --filter @lpc-toolkit/core test`
Expected: PASS

- [x] **Step 6: Commit**
  - Commit: 33de44301, e52aa4ee5
  - Verification: Successfully committed files to local repo.

```bash
git add packages/core/src/index.ts packages/core/src/validation/asset-validator.ts packages/core/test/validation/asset-validator.test.ts
git commit -m "feat: add static asset validator to core"
```

---

### Task 2: Core - Runtime Guard in composeSelections

**Files:**
- Modify: `packages/core/src/compose.ts:532-548`
- Modify: `packages/core/src/compose.ts:601-616`

- [ ] **Step 1: Write test for composition error handling**

Add to `packages/core/test/compose.test.ts`:
```typescript
  it('skips missing optional layers gracefully instead of failing', async () => {
    const selections = {
      bodyType: 'female',
      items: {
        body: { typeName: 'body', name: 'Human Female' },
        neck: { typeName: 'neck', name: 'Bowtie' },
      },
    };

    const adapter = mockCanvasAdapter((url) => {
      if (url.includes('neck')) {
        throw new Error('Optional asset missing');
      }
      return createMockImage(64, 64);
    });

    const sheet = await composeSelections(selections as any, {
      catalog: testCatalog(),
      adapter,
      spritesheetsBaseUrl: '',
    });

    expect(sheet.canvas).toBeDefined();
    // Verify composition finished successfully despite missing bowtie
  });
```

- [ ] **Step 2: Run tests to verify failure**

Run: `pnpm --filter @lpc-toolkit/core test`
Expected: FAIL (composition rejects due to missing asset error)

- [ ] **Step 3: Modify composeSelections in packages/core/src/compose.ts**

Modify `packages/core/src/compose.ts` line 533-548:
```typescript
  // Fetch all standard layers in parallel using the CanvasAdapter dependency injection seam.
  const settled = await Promise.all(
    drawItems.map(
      async (d): Promise<{ d: DrawItem; img: Sprite | null }> => {
        try {
          const img = await adapter.loadImage(
            joinUrl(spritesheetsBaseUrl, d.path),
          );
          return { d, img };
        } catch (error) {
          console.warn(`[LPC Composer] Missing optional spritesheet: ${d.path}`, error);
          return { d, img: null };
        } finally {
          onSettle();
        }
      },
    ),
  );
```

Modify custom layer loading in `packages/core/src/compose.ts` line 601-616:
```typescript
    const loadedCustom = await Promise.all(
      customLayers.map(
        async (c): Promise<{ c: CustomLayerEntry; img: Sprite | null }> => {
          try {
            const img = await adapter.loadImage(
              joinUrl(spritesheetsBaseUrl, c.path),
            );
            return { c, img };
          } catch (error) {
            console.warn(`[LPC Composer] Missing custom spritesheet: ${c.path}`, error);
            return { c, img: null };
          } finally {
            onSettle();
          }
        },
      ),
    );
```

- [ ] **Step 4: Run tests to verify PASS**

Run: `pnpm --filter @lpc-toolkit/core test`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/compose.ts packages/core/test/compose.test.ts
git commit -m "feat: make composer skip missing layers gracefully with warnings"
```

---

### Task 3: Web - Asset Validator CLI Script

**Files:**
- Create: `packages/web/scripts/validate-assets.ts`
- Modify: `packages/web/package.json`

- [ ] **Step 1: Create validate-assets.ts script**

Create `packages/web/scripts/validate-assets.ts`:
```typescript
import { existsSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createCanvas, loadImage } from '@napi-rs/canvas';
import { createCatalog, validateAssets } from '@lpc-toolkit/core';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '../../..');
const sheetDefsDir = path.join(repoRoot, 'assets/sheet_definitions');
const spritesheetsDir = path.join(repoRoot, 'assets/spritesheets');

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

import { readdirSync } from 'node:fs';

async function main() {
  if (!existsSync(sheetDefsDir) || !existsSync(spritesheetsDir)) {
    console.error('Error: assets directory structure not found. Run prepare-assets first.');
    process.exit(1);
  }

  console.log('Loading definitions...');
  const catalogRecs = walkJson(sheetDefsDir);
  const { catalog } = createCatalog(catalogRecs);

  console.log('Validating catalog assets...');
  const adapter = {
    createCanvas: (w: any, h: any) => createCanvas(w, h) as any,
    loadImage: async (url: string) => {
      const rel = url.replace(/^spritesheets\//, '');
      return loadImage(path.join(spritesheetsDir, rel)) as any;
    }
  };

  const issues = await validateAssets({
    catalog,
    adapter,
    spritesheetsBaseUrl: 'spritesheets',
    getFileSize: async (logicalPath) => {
      const rel = logicalPath.replace(/^spritesheets\//, '');
      const stat = statSync(path.join(spritesheetsDir, rel));
      return stat.size;
    }
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
```

- [ ] **Step 2: Add script command in packages/web/package.json**

Modify `packages/web/package.json` line 27:
```json
    "validate-assets": "tsx scripts/validate-assets.ts",
```

- [ ] **Step 3: Test runner script manually**

Run: `pnpm --filter @lpc-toolkit/web validate-assets`
Expected: Prints validation summary, lists warnings (like bowtie and bascinet pigface), but exits with Code 0.

- [ ] **Step 4: Commit**

```bash
git add packages/web/package.json packages/web/scripts/validate-assets.ts
git commit -m "feat: add CLI asset validation script to web workspace"
```

---

### Task 4: Web - Upgrade Audit Runner for Custom Animations and Fallbacks

**Files:**
- Modify: `packages/web/scripts/thumbnail-visible-bounds-audit-lib.ts`
- Modify: `packages/web/test/thumbnail-visible-bounds-audit.test.ts`

- [ ] **Step 1: Write tests for backpack directions and custom animation bounds**

Modify `packages/web/test/thumbnail-visible-bounds-audit.test.ts` to add test cases covering multi-directional fallback and custom regions:
```typescript
  it('falls back to alternate directions for empty default directions', async () => {
    // Write test illustrating backpack fallback
  });

  it('correctly calculates custom animation bounds', async () => {
    // Write test illustrating wheelchair custom bounds calculation
  });
```

- [ ] **Step 2: Run tests to verify failure**

Run: `pnpm --filter @lpc-toolkit/web test`
Expected: FAIL

- [ ] **Step 3: Upgrade thumbnail-visible-bounds-audit-lib.ts**

Modify `packages/web/scripts/thumbnail-visible-bounds-audit-lib.ts`:
```typescript
import {
  ANIMATION_CONFIGS,
  composeSelections,
  extractAnimation,
  makeResolvePalette,
  DIRECTIONS,
  type CanvasAdapter,
  type Catalog,
  type PaletteMetadata,
  type ItemDefinition,
  type Direction,
} from '@lpc-toolkit/core';
```

Modify `runAuditCase` inside `packages/web/scripts/thumbnail-visible-bounds-audit-lib.ts` line 410-470:
```typescript
export async function runAuditCase(
  auditCase: AuditCase,
  deps: RunAuditCaseDeps,
): Promise<ThumbnailAuditRow> {
  const base = {
    itemId: auditCase.itemId,
    typeName: auditCase.item.type_name,
    itemName: auditCase.item.name,
    bodyType: auditCase.bodyType,
    ...(auditCase.variant !== undefined ? { variant: auditCase.variant } : {}),
    direction: 'down' as const,
    frameIndex: 0,
  };

  try {
    const selections = buildItemThumbnailSelections({
      item: auditCase.item,
      bodyType: auditCase.bodyType,
      ...(auditCase.variant !== undefined ? { variant: auditCase.variant } : {}),
    });
    const sheet = await composeSelections(selections, {
      catalog: deps.catalog,
      adapter: deps.adapter,
      spritesheetsBaseUrl: '',
      resolvePalette: makeResolvePalette(deps.catalog, deps.palettes, selections),
    });

    let animationName: string | undefined =
      sheet.animations.includes('walk') ? 'walk' : sheet.animations[0];
    let customRegion = null;

    if (!animationName && sheet.customAnimations && sheet.customAnimations.size > 0) {
      animationName = Array.from(sheet.customAnimations.keys())[0];
      customRegion = sheet.customAnimations.get(animationName!);
    }

    if (!animationName) {
      return { ...base, status: 'error', missingPaths: [...deps.failedPaths], errorMessage: 'No composed animation' };
    }

    const animation = extractAnimation(sheet, animationName, { adapter: deps.adapter });

    // Direction fallback loop
    const directionsToTry: Direction[] = ['down', 'up', 'left', 'right'];
    let bounds: AlphaBounds | null = null;
    let finalDirection: Direction = 'down';
    let frameSize = 64;

    if (customRegion) {
      frameSize = customRegion.frameSize;
      for (const dir of directionsToTry) {
        const dirIndex = DIRECTIONS.indexOf(dir);
        if (dirIndex >= 0 && dirIndex < customRegion.rows) {
          const sx = 0;
          const sy = dirIndex * frameSize;
          const pixels = animation.canvas.getContext('2d')
            .getImageData(sx, sy, frameSize, frameSize);
          bounds = findAlphaBounds(pixels.data, frameSize, frameSize);
          if (bounds) {
            finalDirection = dir;
            break;
          }
        }
      }
    } else {
      const config = ANIMATION_CONFIGS[animation.animation];
      if (!config) {
        return { ...base, animation: animationName, status: 'error', missingPaths: [...deps.failedPaths], errorMessage: 'Representative animation has no standard frame config' };
      }
      frameSize = 64;
      for (const dir of directionsToTry) {
        const rect = frameRect(config, animation.directions, dir, 0);
        const pixels = animation.canvas.getContext('2d')
          .getImageData(rect.sx, rect.sy, rect.size, rect.size);
        bounds = findAlphaBounds(pixels.data, rect.size, rect.size);
        if (bounds) {
          finalDirection = dir;
          break;
        }
      }
    }

    if (!bounds) {
      return {
        ...base,
        animation: animationName,
        frameSize,
        status: 'empty',
        missingPaths: [...deps.failedPaths]
      };
    }

    return {
      ...base,
      animation: animationName,
      direction: finalDirection,
      frameSize,
      status: 'ok',
      bounds,
      metrics: deriveThumbnailMetrics(bounds, frameSize),
      missingPaths: [...deps.failedPaths],
    };
  } catch (error) {
    return {
      ...base,
      status: 'error',
      missingPaths: [...deps.failedPaths],
      errorMessage: error instanceof Error ? error.message : String(error),
    };
  }
}
```

- [ ] **Step 4: Run tests and verify PASS**

Run: `pnpm --filter @lpc-toolkit/web test`
Expected: PASS

- [ ] **Step 5: Run the audit tool again to ensure clean outputs**

Run: `pnpm --filter @lpc-toolkit/web audit:thumbnail-bounds`
Expected: Completes successfully with `wheelchair` and `tool_rod` correctly analyzed, and `backpack` items correctly analyzed via fallback.

- [ ] **Step 6: Commit**

```bash
git add packages/web/scripts/thumbnail-visible-bounds-audit-lib.ts packages/web/test/thumbnail-visible-bounds-audit.test.ts
git commit -m "feat: upgrade audit library with custom animation and direction fallbacks"
```
