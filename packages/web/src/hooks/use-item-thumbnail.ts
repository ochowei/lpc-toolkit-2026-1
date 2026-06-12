import { useEffect, useRef, useState } from 'react';
import {
  ANIMATION_OFFSETS,
  composeSelections,
  makeResolvePalette,
  type BodyType,
  type Catalog,
  type ItemDefinition,
  type PaletteMetadata,
  type TypeName,
} from '@lpc-toolkit/core';
import { createBrowserCanvasAdapter } from '../adapter/browser-canvas-adapter';
import { cacheGet, cacheSet, makeCacheKey } from './thumbnail-cache';
import { buildItemThumbnailSelections } from '../lib/item-thumbnail-selection';

export interface ThumbnailCropRect {
  readonly sx: number;
  readonly sy: number;
  readonly size: number;
}

/**
 * Calculates the crop rectangle (sx, sy, size = 64) within the composed master sheet canvas
 * for drawing the item's thumbnail using the upstream metadata.
 */
export function getThumbnailCropRect(
  def: ItemDefinition | undefined,
  animName: string,
  customAnimationsMap: ReadonlyMap<string, { offsetY: number }> | undefined,
): ThumbnailCropRect {
  const previewRow = def?.preview_row ?? 2;
  const previewCol = (def as any)?.preview_column ?? 0;
  const previewXOffset = (def as any)?.preview_x_offset ?? 0;
  const previewYOffset = (def as any)?.preview_y_offset ?? 0;

  let offsetY = 0;
  if (animName in ANIMATION_OFFSETS) {
    offsetY = ANIMATION_OFFSETS[animName as keyof typeof ANIMATION_OFFSETS] ?? 0;
  } else if (customAnimationsMap?.has(animName)) {
    offsetY = customAnimationsMap.get(animName)?.offsetY ?? 0;
  }

  return {
    sx: previewCol * 64 + previewXOffset,
    sy: offsetY + previewRow * 64 + previewYOffset,
    size: 64,
  };
}

/** Inputs needed to compose and crop one catalog item thumbnail. */
export interface UseItemThumbnailArgs {
  readonly typeName: TypeName;
  readonly name: string;
  readonly variant?: string;
  readonly recolor?: string;
  readonly bodyType: BodyType;
  readonly size: number;
  readonly catalog: Catalog;
  readonly palettes: PaletteMetadata;
}

/** Thumbnail canvas and load status returned to layer-picker rows. */
export interface UseItemThumbnailResult {
  readonly canvas: HTMLCanvasElement | null;
  readonly status: 'loading' | 'ready' | 'error';
}

function findItemDef(
  catalog: Catalog,
  typeName: TypeName,
  name: string,
): ItemDefinition | undefined {
  return catalog.byTypeName.get(typeName)?.find((d) => d.name === name);
}



/**
 * Renders a single catalog item to a `size×size` offscreen canvas (first
 * frame of `walk` facing south) and caches by item identity. Reuses the
 * project's `composeSelections` pipeline — single-item Selections produce
 * the layer in isolation, except when the item references a sibling
 * selection via `replace_in_path` (e.g. expression → head), in which case
 * we synthesize a matching sibling so the path resolves.
 */
export function useItemThumbnail(args: UseItemThumbnailArgs): UseItemThumbnailResult {
  const key = makeCacheKey({
    bodyType: args.bodyType,
    typeName: args.typeName,
    name: args.name,
    ...(args.variant !== undefined ? { variant: args.variant } : {}),
    ...(args.recolor !== undefined ? { recolor: args.recolor } : {}),
    size: args.size,
  });

  const [state, setState] = useState<UseItemThumbnailResult>(() => {
    const cached = cacheGet(key);
    return cached
      ? { canvas: cached, status: 'ready' }
      : { canvas: null, status: 'loading' };
  });

  const reqIdRef = useRef(0);

  useEffect(() => {
    const cached = cacheGet(key);
    if (cached) {
      setState({ canvas: cached, status: 'ready' });
      return;
    }
    const reqId = ++reqIdRef.current;
    setState({ canvas: null, status: 'loading' });

    const adapter = createBrowserCanvasAdapter();
    const def = findItemDef(args.catalog, args.typeName, args.name);
    const selections = def
      ? buildItemThumbnailSelections({
          item: def,
          bodyType: args.bodyType,
          ...(args.variant !== undefined ? { variant: args.variant } : {}),
          ...(args.recolor !== undefined ? { recolor: args.recolor } : {}),
        })
      : {
          bodyType: args.bodyType,
          items: {
            [args.typeName]: {
              typeName: args.typeName,
              name: args.name,
              ...(args.variant ? { variant: args.variant } : {}),
              ...(args.recolor ? { recolor: args.recolor } : {}),
            },
          },
        };

    composeSelections(selections, {
      catalog: args.catalog,
      adapter,
      spritesheetsBaseUrl: '',
      resolvePalette: makeResolvePalette(args.catalog, args.palettes, selections),
    })
      .then((sheet) => {
        if (reqId !== reqIdRef.current) return;
        const animName =
          sheet.animations.includes('walk')
            ? 'walk'
            : (sheet.customAnimations && sheet.customAnimations.size > 0
                ? Array.from(sheet.customAnimations.keys())[0]!
                : (sheet.animations[0] ?? 'walk'));
        const r = getThumbnailCropRect(def, animName, sheet.customAnimations);
        const canvas = document.createElement('canvas');
        canvas.width = args.size;
        canvas.height = args.size;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          setState({ canvas: null, status: 'error' });
          return;
        }
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(
          sheet.canvas as unknown as CanvasImageSource,
          r.sx, r.sy, r.size, r.size,
          0, 0, args.size, args.size,
        );
        cacheSet(key, canvas);
        setState({ canvas, status: 'ready' });
      })
      .catch(() => {
        if (reqId !== reqIdRef.current) return;
        setState({ canvas: null, status: 'error' });
      });
  }, [key, args.catalog, args.palettes]);

  return state;
}
