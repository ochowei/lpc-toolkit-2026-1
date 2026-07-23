import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  composeSelections,
  extractAnimation,
  makeResolvePalette,
  type Catalog,
  type CanvasAdapter,
  type ComposedAnimation,
  type ComposedSheet,
  type CreditsManifest,
  type License,
  type Selections,
} from '@lpc-toolkit/core';
import { createAssetPackPreviewCanvasAdapter } from '../adapter/asset-pack-preview-canvas-adapter';
import { createBrowserCanvasAdapter } from '../adapter/browser-canvas-adapter';
import {
  buildAssetPackPreview,
  createAssetPackPreviewCatalog,
  createOfficialAssetPackPreviewPathAuthorizer,
  previewAnimationOptions,
  previewBodyTypeOptions,
  previewDirectionOptions,
} from '../lib/asset-pack-preview';
import {
  importCharacterDocument,
  type TextJsonFile,
} from '../lib/character-document';
import type { AssetPackPreviewPayload } from '../lib/asset-pack-worker-protocol';
import type { BrowserAssetPackBaseline } from '../lib/asset-pack-baseline';

export interface AssetPackPreviewResult {
  readonly status: 'idle' | 'pending' | 'ready' | 'error';
  readonly progress: number;
  readonly sheet: ComposedSheet | null;
  readonly animation: ComposedAnimation | null;
  readonly credits: CreditsManifest | null;
  readonly effectiveLicense: License | null;
  readonly catalog?: Catalog | null;
  readonly selections?: Selections | null;
  readonly error: string | null;
}

export interface PreviewRequestKeyInput {
  readonly revision: number;
  readonly bodyType: string;
  readonly focusedAssetId?: string;
  readonly importedDigest: string | null;
  readonly sourceIdentity: string;
}

export function previewRequestKey(input: PreviewRequestKeyInput): string {
  return JSON.stringify({
    revision: input.revision,
    bodyType: input.bodyType,
    focusedAssetId: input.focusedAssetId ?? null,
    importedDigest: input.importedDigest,
    sourceIdentity: input.sourceIdentity,
  });
}

export function previewErrorResult(error: unknown): AssetPackPreviewResult {
  return {
    status: 'error',
    progress: 1,
    sheet: null,
    animation: null,
    credits: null,
    effectiveLicense: null,
    catalog: null,
    selections: null,
    error: error instanceof Error ? error.message : String(error),
  };
}

export function previewResultForKey(
  stored: { readonly key: string | null; readonly result: AssetPackPreviewResult },
  currentKey: string | null,
): AssetPackPreviewResult {
  if (currentKey !== null && stored.key === currentKey) return stored.result;
  return {
    status: currentKey === null ? 'idle' : 'pending',
    progress: 0,
    sheet: null,
    animation: null,
    credits: null,
    effectiveLicense: null,
    catalog: null,
    selections: null,
    error: null,
  };
}

function sourceIdentity(payload: AssetPackPreviewPayload | undefined): string {
  if (!payload) return 'none';
  return payload.sources.map(({ destinationPath, sourcePath, bytes }) => {
    let hash = 2_166_136_261;
    for (const byte of bytes) hash = Math.imul(hash ^ byte, 16_777_619) >>> 0;
    return `${destinationPath}\u0000${sourcePath}\u0000${bytes.byteLength}\u0000${hash}`;
  }).join('\u0001');
}

function selectionDigest(selections: Selections | null): string | null {
  return selections ? JSON.stringify(selections) : null;
}

function animationForSheet(sheet: ComposedSheet, requested: string | undefined): string {
  if (requested && sheet.animations.includes(requested)) return requested;
  return sheet.animations[0] ?? 'walk';
}

export function extractLatestPreviewAnimation(
  sheet: ComposedSheet,
  requested: { readonly current: string | undefined },
  adapter: CanvasAdapter,
): ComposedAnimation {
  return extractAnimation(sheet, animationForSheet(sheet, requested.current), { adapter });
}

export interface UseAssetPackPreviewOptions {
  readonly baseline: BrowserAssetPackBaseline;
  readonly payload?: AssetPackPreviewPayload;
  readonly focusedAssetId?: string;
  readonly bodyType?: string;
  readonly animation?: string;
}

export function useAssetPackPreview(options: UseAssetPackPreviewOptions) {
  const fallback = useMemo(() => createBrowserCanvasAdapter(), []);
  const [importedSelections, setImportedSelections] = useState<Selections | null>(null);
  const [stored, setStored] = useState<{ readonly key: string | null; readonly result: AssetPackPreviewResult }>({
    key: null,
    result: previewResultForKey({ key: null, result: previewErrorResult('') }, null),
  });
  const requestIdRef = useRef(0);
  const animationRef = useRef(options.animation);
  animationRef.current = options.animation;
  const payload = options.payload;
  const catalog = payload
    ? createAssetPackPreviewCatalog(options.baseline.catalog, payload.compilePlan)
    : options.baseline.catalog;
  const bodyTypes = previewBodyTypeOptions(catalog);
  const bodyType = options.bodyType && bodyTypes.includes(options.bodyType)
    ? options.bodyType
    : bodyTypes[0] ?? 'male';
  const key = payload
    ? previewRequestKey({
        revision: payload.revision,
        bodyType,
        ...(options.focusedAssetId ? { focusedAssetId: options.focusedAssetId } : {}),
        importedDigest: selectionDigest(importedSelections),
        sourceIdentity: sourceIdentity(payload),
      })
    : null;
  const importedForBody = useMemo(
    () => importedSelections ? { ...importedSelections, bodyType } : null,
    [bodyType, importedSelections],
  );
  const latestKeyRef = useRef(key);
  latestKeyRef.current = key;

  useEffect(() => {
    if (!payload || !key) return;
    const requestId = ++requestIdRef.current;
    let model;
    try {
      model = buildAssetPackPreview({
        baselineCatalog: options.baseline.catalog,
        palettes: options.baseline.palettes,
        payload,
        bodyType,
        ...(options.focusedAssetId ? { focusedAssetId: options.focusedAssetId } : {}),
        ...(importedForBody ? { importedSelections: importedForBody } : {}),
      });
    } catch (error) {
      if (requestId !== requestIdRef.current) return;
      setStored({ key, result: previewErrorResult(error) });
      return;
    }

    setStored({
      key,
      result: {
        status: 'pending',
        progress: 0,
        sheet: null,
        animation: null,
        credits: null,
        effectiveLicense: null,
        catalog: model.catalog,
        selections: model.selections,
        error: null,
      },
    });
    const adapter = createAssetPackPreviewCanvasAdapter({
      payload,
      fallback,
      isOfficialPath: createOfficialAssetPackPreviewPathAuthorizer(
        options.baseline.catalog,
        payload.compilePlan,
      ),
    });
    void composeSelections(model.selections, {
      catalog: model.catalog,
      adapter,
      spritesheetsBaseUrl: '',
      resolvePalette: makeResolvePalette(model.catalog, options.baseline.palettes, model.selections),
      onProgress: (loaded, total) => {
        if (requestId !== requestIdRef.current || latestKeyRef.current !== key) return;
        setStored((current) => ({
          key,
          result: {
            ...current.result,
            progress: total === 0 ? 1 : loaded / total,
          },
        }));
      },
    }).then((sheet) => {
      if (requestId !== requestIdRef.current || latestKeyRef.current !== key) return;
      const animation = extractLatestPreviewAnimation(sheet, animationRef, adapter);
      setStored({
        key,
        result: {
          status: 'ready',
          progress: 1,
          sheet,
          animation,
          credits: model.credits,
          effectiveLicense: model.effectiveLicense,
          catalog: model.catalog,
          selections: model.selections,
          error: null,
        },
      });
    }).catch((error: unknown) => {
      if (requestId !== requestIdRef.current || latestKeyRef.current !== key) return;
      setStored({ key, result: previewErrorResult(error) });
    }).finally(() => adapter.dispose());
  }, [fallback, importedForBody, key, options.baseline, options.focusedAssetId, payload]);

  useEffect(() => {
    if (!payload || !options.animation) return;
    const current = previewResultForKey(stored, key);
    if (current.status !== 'ready' || !current.sheet) return;
    const adapter = createAssetPackPreviewCanvasAdapter({
      payload: payload!,
      fallback,
      isOfficialPath: createOfficialAssetPackPreviewPathAuthorizer(
        options.baseline.catalog,
        payload.compilePlan,
      ),
    });
    const animation = extractLatestPreviewAnimation(current.sheet, { current: options.animation }, adapter);
    setStored((latest) => latest.result.sheet === current.sheet
      ? { ...latest, result: { ...latest.result, animation } }
      : latest);
  }, [fallback, key, options.animation, options.baseline.catalog, payload, stored.key]);

  const importCharacter = useCallback(async (file: TextJsonFile): Promise<void> => {
    if (!payload) throw new Error('No current asset-pack preview is available.');
    const compiledCatalog = createAssetPackPreviewCatalog(options.baseline.catalog, payload.compilePlan);
    const imported = await importCharacterDocument(file, {
      catalog: compiledCatalog,
      palettes: options.baseline.palettes,
    });
    setImportedSelections(imported.parsed.selections);
  }, [options.baseline.catalog, options.baseline.palettes, payload]);

  return {
    result: previewResultForKey(stored, key),
    catalog,
    focusedAssetId: options.focusedAssetId,
    bodyTypeOptions: bodyTypes,
    animationOptions: previewAnimationOptions(catalog),
    directionOptions: previewDirectionOptions(),
    importedSelections,
    importCharacter,
  };
}
