import { useEffect, useRef, useState } from 'react';
import {
  ANIMATION_CONFIGS,
  composeSelections,
  extractAnimation,
  makeResolvePalette,
  type BodyType,
  type Catalog,
  type Direction,
  type ItemDefinition,
  type PaletteMetadata,
  type TypeName,
} from '@lpc-toolkit/core';
import { createBrowserCanvasAdapter } from '../adapter/browser-canvas-adapter';
import { frameRect } from '../slice/frame-rect';
import { cacheGet, cacheSet, makeCacheKey } from './thumbnail-cache';
import { buildItemThumbnailSelections } from '../lib/item-thumbnail-selection';

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
          sheet.animations.includes('walk') ? 'walk' : (sheet.animations[0] ?? 'walk');
        const animation = extractAnimation(sheet, animName, { adapter });
        if (!animation) {
          setState({ canvas: null, status: 'error' });
          return;
        }
        const config = ANIMATION_CONFIGS[animation.animation];
        if (!config) {
          setState({ canvas: null, status: 'error' });
          return;
        }
        const canvas = document.createElement('canvas');
        canvas.width = args.size;
        canvas.height = args.size;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          setState({ canvas: null, status: 'error' });
          return;
        }
        ctx.imageSmoothingEnabled = false;
        const dir: Direction = 'down';
        const r = frameRect(config, animation.directions, dir, 0);
        ctx.drawImage(
          animation.canvas as unknown as CanvasImageSource,
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
