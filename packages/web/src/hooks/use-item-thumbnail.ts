import { useEffect, useRef, useState } from 'react';
import {
  ANIMATION_OFFSETS,
  composeSelections,
  makeResolvePalette,
  type BodyType,
  type Catalog,
  type ItemDefinition,
  type PaletteMetadata,
  type Selection,
  type Selections,
  type TypeName,
} from '@lpc-toolkit/core';
import { createBrowserCanvasAdapter } from '../adapter/browser-canvas-adapter';
import { cacheGet, cacheSet, makeCacheKey } from './thumbnail-cache';

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
 * Resolve the variant for a thumbnail Selection. Caller's explicit
 * `args.variant` wins; otherwise fall back to `def.variants[0]` so items
 * declaring variants (e.g. Skeleton head whose sprites live at
 * `head/heads/skeleton/adult/walk/skeleton.png`) render instead of 404ing
 * on `…/walk.png`. Mirrors the contract `pickActionForItem` and core's
 * `buildSelection` already use when constructing Selections elsewhere.
 */
export function effectiveThumbnailVariant(
  explicit: string | undefined,
  def: ItemDefinition | undefined,
): string | undefined {
  if (explicit !== undefined) return explicit;
  return def?.variants?.[0];
}

/**
 * For items whose layer paths reference `${siblingType}` (e.g. expressions
 * reference `${head}`), the core `replaceInPath` needs a sibling Selection
 * in `selections.items[siblingType]` to substitute. The thumbnail call
 * site only knows about the item itself, so without a synthesized sibling
 * the URL is shipped with literal `${head}` and 404s.
 *
 * Pick the sibling name from `def.replace_in_path[siblingType]`, preferring
 * an entry whose mapped value equals `bodyType` (keeps the rendered face
 * on the matching male/female/elderly head). Falls back to the first key.
 */
function siblingSelectionsFor(
  def: ItemDefinition,
  bodyType: BodyType,
): Record<TypeName, Selection> {
  const map = def.replace_in_path;
  if (!map) return {};
  const out: Record<TypeName, Selection> = {};
  for (const [siblingType, mapping] of Object.entries(map)) {
    const entries = Object.entries(mapping);
    if (entries.length === 0) continue;
    const matched = entries.find(([, v]) => v === bodyType);
    const [siblingKey] = matched ?? entries[0]!;
    out[siblingType] = {
      typeName: siblingType,
      name: siblingKey.replaceAll('_', ' '),
    };
  }
  return out;
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
    const siblings = def
      ? siblingSelectionsFor(def, args.bodyType)
      : {};
    const variant = effectiveThumbnailVariant(args.variant, def);
    const selections: Selections = {
      bodyType: args.bodyType,
      items: {
        ...siblings,
        [args.typeName]: {
          typeName: args.typeName,
          name: args.name,
          ...(variant ? { variant } : {}),
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
