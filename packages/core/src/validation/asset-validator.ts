import type { Catalog, Selections, BodyType } from '../types.js';
import type { CanvasAdapter, ImageLike } from '../adapters.js';
import { resolveLayers } from '../compose.js';
import { ANIMATION_OFFSETS } from '../constants.js';

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

  const bodyTypes: readonly BodyType[] = ['male', 'female', 'muscular', 'pregnant', 'teen', 'child'];

  for (const [itemId, item] of catalog.byItemId.entries()) {
    const isBody = item.type_name === 'body';
    const severity = isBody ? 'error' : 'warning';

    for (const bodyType of bodyTypes) {
      // Check bodyType compatibility. We cast to Record<string, unknown> to check custom property body_types.
      const bodyTypesObj = (item as unknown as Record<string, unknown>).body_types as Record<string, boolean> | undefined;
      if (bodyTypesObj && !bodyTypesObj[bodyType]) continue;

      const variants = item.variants && item.variants.length > 0 ? item.variants : [undefined];

      for (const variant of variants) {
        // Construct a single-item Selection
        const selections: Selections = {
          bodyType,
          items: {
            [item.type_name]: {
              typeName: item.type_name,
              name: item.name,
              ...(variant !== undefined ? { variant } : {}),
            },
          },
        };

        const resolved = resolveLayers(selections, catalog);
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
