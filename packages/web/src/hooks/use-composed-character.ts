import { useEffect, useRef, useState } from 'react';
import {
  composeSelections,
  extractAnimation,
  type Catalog,
  type ComposedAnimation,
  type ComposedSheet,
} from '@lpc-toolkit/core';
import { createBrowserCanvasAdapter } from '../adapter/browser-canvas-adapter';
import { toSelections, type SliceState } from '../slice/selection';

export interface ComposedResult {
  readonly status: 'idle' | 'loading' | 'ready' | 'error';
  readonly progress: number; // 0..1
  readonly sheet: ComposedSheet | null;
  readonly animation: ComposedAnimation | null;
  readonly error: string | null;
}

const adapter = createBrowserCanvasAdapter();

/**
 * Re-composes whenever the selection-relevant slice of state changes.
 * `spritesheetsBaseUrl` is '' (core already prefixes `spritesheets/`); the
 * browser adapter resolves the rest against document.baseURI. A monotonic
 * request id discards stale async results (spec §2).
 */
export function useComposedCharacter(
  catalog: Catalog,
  state: SliceState,
): ComposedResult {
  const [result, setResult] = useState<ComposedResult>({
    status: 'idle',
    progress: 0,
    sheet: null,
    animation: null,
    error: null,
  });
  const reqIdRef = useRef(0);
  const key = JSON.stringify({
    b: state.bodyType,
    s: state.selections,
    a: state.anim,
  });

  useEffect(() => {
    const reqId = ++reqIdRef.current;
    const selections = toSelections(state);
    setResult((r) => ({ ...r, status: 'loading', progress: 0, error: null }));

    composeSelections(selections, {
      catalog,
      adapter,
      spritesheetsBaseUrl: '',
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
        const animName = sheet.animations.includes(state.anim)
          ? state.anim
          : (sheet.animations[0] ?? 'walk');
        const animation = extractAnimation(sheet, animName, { adapter });
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
        setResult({
          status: 'error',
          progress: 1,
          sheet: null,
          animation: null,
          error: e instanceof Error ? e.message : String(e),
        });
      });
    // key encodes the selection-relevant state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [catalog, key]);

  // Re-extract when only the chosen animation changes and a sheet exists.
  useEffect(() => {
    setResult((r) => {
      if (r.status !== 'ready' || !r.sheet) return r;
      const name = r.sheet.animations.includes(state.anim)
        ? state.anim
        : (r.sheet.animations[0] ?? 'walk');
      return { ...r, animation: extractAnimation(r.sheet, name, { adapter }) };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.anim]);

  return result;
}
