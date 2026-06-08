import { useEffect, useMemo, useRef, useState } from 'react';
import {
  composeSelections,
  extractAnimation,
  makeResolvePalette,
  type Catalog,
  type ComposedAnimation,
  type ComposedSheet,
  type PaletteMetadata,
} from '@lpc-toolkit/core';
import { createBrowserCanvasAdapter } from '../adapter/browser-canvas-adapter';
import type { CustomOverlay } from '../lib/custom-overlay';
import { toSelections, type SliceState } from '../slice/selection';

/** Async composition state exposed to preview and export UI. */
export interface ComposedResult {
  readonly status: 'idle' | 'loading' | 'ready' | 'error';
  readonly progress: number; // 0..1
  readonly sheet: ComposedSheet | null;
  readonly animation: ComposedAnimation | null;
  readonly error: string | null;
}

/**
 * The animation to show: the requested one if it was composed, else the
 * first composed standard animation, else 'walk' (always a valid
 * `ANIMATION_CONFIGS` key — `extractAnimation` returns a transparent crop
 * for a known-but-uncomposed animation, never throws).
 */
function resolveAnim(sheet: ComposedSheet, anim: string): string {
  return sheet.animations.includes(anim)
    ? anim
    : (sheet.animations[0] ?? 'walk');
}

/**
 * Re-composes only when the *selection* (bodyType + items) changes — anim is
 * not a selection (spec §2), so switching animation re-extracts cheaply off
 * the already-composed master sheet (Effect 2), never a refetch. A monotonic
 * request id discards stale async results. `spritesheetsBaseUrl` is '' (core
 * already prefixes `spritesheets/`); the browser adapter resolves the rest
 * against document.baseURI.
 */
export function useComposedCharacter(
  catalog: Catalog,
  palettes: PaletteMetadata,
  state: SliceState,
  reloadCounter: number = 0,
  customOverlay: CustomOverlay | null = null,
): ComposedResult {
  const adapter = useMemo(() => createBrowserCanvasAdapter(), []);
  const [result, setResult] = useState<ComposedResult>({
    status: 'idle',
    progress: 0,
    sheet: null,
    animation: null,
    error: null,
  });
  const reqIdRef = useRef(0);
  const sheetRef = useRef<ComposedSheet | null>(null);
  const animRef = useRef(state.anim);
  animRef.current = state.anim;

  const key = JSON.stringify({
    b: state.bodyType,
    s: state.selections,
    r: reloadCounter,
    custom: customOverlay
      ? {
          fileName: customOverlay.fileName,
          objectUrl: customOverlay.objectUrl,
          zPos: customOverlay.zPos,
        }
      : null,
  });

  useEffect(() => {
    const reqId = ++reqIdRef.current;
    const selections = toSelections(state);
    setResult((r) => ({ ...r, status: 'loading', progress: 0, error: null }));

    composeSelections(selections, {
      catalog,
      adapter,
      spritesheetsBaseUrl: '',
      resolvePalette: makeResolvePalette(catalog, palettes, selections),
      ...(customOverlay
        ? {
            extraStandardLayers: [
              { image: customOverlay.image, zPos: customOverlay.zPos },
            ],
          }
        : {}),
      onProgress: (loaded, total) => {
        if (reqId !== reqIdRef.current) return;
        setResult((r) => ({
          ...r,
          progress: total === 0 ? 1 : loaded / total,
        }));
      },
    })
      .then((sheet) => {
        if (reqId !== reqIdRef.current) return;
        sheetRef.current = sheet;
        const animation = extractAnimation(
          sheet,
          resolveAnim(sheet, animRef.current),
          { adapter },
        );
        setResult({
          status: 'ready',
          progress: 1,
          sheet,
          animation,
          error: null,
        });
      })
      .catch((e: unknown) => {
        if (reqId !== reqIdRef.current) return;
        sheetRef.current = null;
        setResult({
          status: 'error',
          progress: 1,
          sheet: null,
          animation: null,
          error: e instanceof Error ? e.message : String(e),
        });
      });
    // key encodes the selection-relevant state and custom overlay identity
    // (anim handled by Effect 2).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [adapter, catalog, palettes, key]);

  // Anim change: cheap re-extract off the current sheet (no recompose).
  useEffect(() => {
    const sheet = sheetRef.current;
    if (!sheet) return;
    const animation = extractAnimation(
      sheet,
      resolveAnim(sheet, state.anim),
      { adapter },
    );
    setResult((r) =>
      r.status === 'ready' && r.sheet === sheet ? { ...r, animation } : r,
    );
  }, [adapter, state.anim]);

  return result;
}
