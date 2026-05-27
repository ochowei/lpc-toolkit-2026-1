# Custom Upload + Z-Position Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add upstream-style Advanced Tools custom spritesheet upload with z-position control to the v2 web UI, including preview, PNG, and ZIP exports while keeping upstream credits untouched.

**Architecture:** Custom upload remains `packages/web` session state. `packages/web/src/lib/custom-overlay.ts` handles validation, filenames, image loading, and object URL lifecycle. To preserve z-position correctly, `packages/core` gets an environment-agnostic `extraStandardLayers` composition option using existing `ImageLike` and `CanvasAdapter` types; no browser APIs enter core.

**Tech Stack:** TypeScript strict, React 18 hooks, Vite, Tailwind, Vitest, `@napi-rs/canvas` for canvas tests, existing `jszip` dependency (MIT, GPL-3.0 compatible).

**Spec:** `docs/superpowers/specs/2026-05-27-custom-upload-z-position-design.md`

---

## File Structure

- Create `packages/web/src/lib/custom-overlay.ts`: web-only custom upload model, size validation, z-position parsing, filename formatting, and browser image loading.
- Create `packages/web/test/custom-overlay.test.ts`: helper tests.
- Modify `packages/core/src/compose.ts`: add `extraStandardLayers` to `ComposeOptions` and draw those layers in the existing stable z-position order.
- Modify `packages/core/test/compose.test.ts`: prove extra layers participate in z-position ordering.
- Modify `packages/web/src/hooks/use-composed-character.ts`: pass `customOverlay.image` and `customOverlay.zPos` to `composeSelections`.
- Modify `packages/web/src/components/layer-stack/settings-collapsible.tsx`: add Advanced Tools UI.
- Modify `packages/web/src/components/layer-stack/stack-panel.tsx`: thread Advanced Tools props.
- Modify `packages/web/src/components/layer-stack/harness.tsx`: own upload state, object URL cleanup, z-position, clear/reset, and prop threading.
- Modify `packages/web/src/components/layer-stack/popovers/download-popover.tsx`: pass `customOverlay` into ZIP context.
- Modify `packages/web/src/lib/zip-export.ts`: write explicit custom-upload item files for F5/F6; credits stay unchanged.
- Modify `packages/web/test/zip-export.test.ts`: cover custom-upload ZIP entries and credits exclusion.
- Modify `packages/web/src/i18n.ts`: add `advancedTools.*` translations.

## Pre-flight

- [ ] **Step 0.1: Create feature branch**

  ```bash
  git checkout -b feat/custom-upload-z-position
  ```

  Expected: branch switches to `feat/custom-upload-z-position`.

- [ ] **Step 0.2: Verify baseline**

  ```bash
  pnpm --filter @lpc-toolkit/core test
  pnpm --filter @lpc-toolkit/web test
  pnpm --filter @lpc-toolkit/web typecheck
  ```

  Expected: all pass before editing.

## Task 1: Custom overlay helper

**Files:**
- Create: `packages/web/src/lib/custom-overlay.ts`
- Create: `packages/web/test/custom-overlay.test.ts`

**Outcome:** Web-only helper for upload validation, z-position parsing, filenames, and image loading.

- [ ] **Step 1.1: Write failing helper tests**

  Create `packages/web/test/custom-overlay.test.ts`:

  ```ts
  import { describe, expect, it } from 'vitest';
  import { createCanvas } from '@napi-rs/canvas';
  import {
    CUSTOM_OVERLAY_HEIGHT,
    CUSTOM_OVERLAY_WIDTH,
    customOverlayItemFileName,
    parseCustomOverlayZPos,
    validateCustomOverlayDimensions,
    type CustomOverlay,
  } from '../src/lib/custom-overlay';

  function makeOverlay(zPos = 70): CustomOverlay {
    const image = createCanvas(CUSTOM_OVERLAY_WIDTH, CUSTOM_OVERLAY_HEIGHT);
    return {
      fileName: 'Cape Test.png',
      objectUrl: 'blob:test',
      image: image as unknown as CanvasImageSource,
      width: CUSTOM_OVERLAY_WIDTH,
      height: CUSTOM_OVERLAY_HEIGHT,
      zPos,
    };
  }

  describe('validateCustomOverlayDimensions', () => {
    it('accepts the standard master spritesheet size', () => {
      expect(validateCustomOverlayDimensions(832, 3456)).toEqual({ ok: true });
    });

    it('rejects non-standard dimensions with exact actual dimensions', () => {
      expect(validateCustomOverlayDimensions(800, 3456)).toEqual({
        ok: false,
        width: 800,
        height: 3456,
      });
    });
  });

  describe('parseCustomOverlayZPos', () => {
    it.each([
      ['', 0],
      ['abc', 0],
      ['70', 70],
      ['-5', -5],
      ['42.9', 42],
    ])('maps %s to %s', (raw, expected) => {
      expect(parseCustomOverlayZPos(raw)).toBe(expected);
    });
  });

  describe('customOverlayItemFileName', () => {
    it('formats a stable custom-upload item name', () => {
      expect(
        customOverlayItemFileName({ fileName: 'Cape Test.PNG', zPos: 70 }),
      ).toBe('070 custom-upload_cape_test.png.png');
    });
  });

  describe('CustomOverlay shape', () => {
    it('stores loaded image metadata and z-position', () => {
      expect(makeOverlay()).toMatchObject({
        fileName: 'Cape Test.png',
        objectUrl: 'blob:test',
        width: CUSTOM_OVERLAY_WIDTH,
        height: CUSTOM_OVERLAY_HEIGHT,
        zPos: 70,
      });
    });
  });
  ```

- [ ] **Step 1.2: Run tests to verify failure**

  ```bash
  pnpm --filter @lpc-toolkit/web test -- custom-overlay
  ```

  Expected: FAIL with module not found for `../src/lib/custom-overlay`.

- [ ] **Step 1.3: Implement helper**

  Create `packages/web/src/lib/custom-overlay.ts`:

  ```ts
  import { SHEET_HEIGHT, SHEET_WIDTH } from '@lpc-toolkit/core';

  export const CUSTOM_OVERLAY_WIDTH = SHEET_WIDTH;
  export const CUSTOM_OVERLAY_HEIGHT = SHEET_HEIGHT;

  export interface CustomOverlay {
    readonly fileName: string;
    readonly objectUrl: string;
    readonly image: CanvasImageSource;
    readonly width: number;
    readonly height: number;
    readonly zPos: number;
  }

  export type CustomOverlayDimensionResult =
    | { readonly ok: true }
    | { readonly ok: false; readonly width: number; readonly height: number };

  export function validateCustomOverlayDimensions(
    width: number,
    height: number,
  ): CustomOverlayDimensionResult {
    return width === CUSTOM_OVERLAY_WIDTH && height === CUSTOM_OVERLAY_HEIGHT
      ? { ok: true }
      : { ok: false, width, height };
  }

  export function parseCustomOverlayZPos(raw: string): number {
    const parsed = Number.parseInt(raw, 10);
    return Number.isNaN(parsed) ? 0 : parsed;
  }

  export function customOverlayItemFileName(input: {
    readonly fileName: string;
    readonly zPos: number;
  }): string {
    const safe = input.fileName.replace(/[^a-z0-9.]/gi, '_').toLowerCase();
    const padded = String(input.zPos).padStart(3, '0');
    return `${padded} custom-upload_${safe}.png`;
  }

  export async function loadCustomOverlayImage(args: {
    readonly file: File;
    readonly zPos: number;
  }): Promise<CustomOverlay | CustomOverlayDimensionResult> {
    const objectUrl = URL.createObjectURL(args.file);
    const image = new Image();
    try {
      await new Promise<void>((resolve, reject) => {
        image.onload = () => resolve();
        image.onerror = () => reject(new Error('Failed to decode image'));
        image.src = objectUrl;
      });
      const dimensions = validateCustomOverlayDimensions(
        image.naturalWidth,
        image.naturalHeight,
      );
      if (!dimensions.ok) {
        URL.revokeObjectURL(objectUrl);
        return dimensions;
      }
      return {
        fileName: args.file.name,
        objectUrl,
        image,
        width: image.naturalWidth,
        height: image.naturalHeight,
        zPos: args.zPos,
      };
    } catch (error) {
      URL.revokeObjectURL(objectUrl);
      throw error;
    }
  }
  ```

- [ ] **Step 1.4: Run tests and typecheck**

  ```bash
  pnpm --filter @lpc-toolkit/web test -- custom-overlay
  pnpm --filter @lpc-toolkit/web typecheck
  ```

  Expected: PASS.

- [ ] **Step 1.5: Commit**

  ```bash
  git add packages/web/src/lib/custom-overlay.ts packages/web/test/custom-overlay.test.ts
  git commit -m "feat(web/lib): add custom overlay helpers"
  ```

## Task 2: Core extra standard layer composition

**Files:**
- Modify: `packages/core/src/compose.ts`
- Modify: `packages/core/test/compose.test.ts`

**Outcome:** Core can draw caller-provided standard-sheet images in z-position order without knowing about browser `File` or `HTMLImageElement`.

- [ ] **Step 2.1: Confirm existing compose test helpers**

  ```bash
  sed -n '1,40p' packages/core/test/compose.test.ts
  sed -n '1,90p' packages/core/test/helpers/node-canvas-adapter.ts
  ```

  Expected: `compose.test.ts` already imports `createNodeCanvasAdapter`, `makeCanvas`, and `solidImage`.

- [ ] **Step 2.2: Write failing core test**

  Add this test to `packages/core/test/compose.test.ts` inside the existing `composeSelections` describe block:

  ```ts
  it('draws extra standard layers according to z-position', async () => {
    const adapter = createNodeCanvasAdapter();
    const extra = makeCanvas(832, 3456, (ctx) => {
      ctx.fillStyle = '#0000ff';
      ctx.fillRect(0, 512, 16, 16);
    });

    const catalog = createCatalog({
      'body/test.json': {
        name: 'body',
        type_name: 'body',
        animations: ['walk'],
        credits: [],
        layer_1: { zPos: 10, male: 'body/' },
      },
    });

    const sheet = await composeSelections(
      {
        bodyType: 'male',
        items: { body: { typeName: 'body', name: 'body' } },
      },
      {
        catalog,
        adapter: {
          ...adapter,
          loadImage: async () => {
            const img = adapter.createCanvas(832, 256);
            const ctx = img.getContext('2d');
            ctx.fillStyle = '#ff0000';
            ctx.fillRect(0, 0, 16, 16);
            return img;
          },
        },
        spritesheetsBaseUrl: '',
        extraStandardLayers: [{ image: extra, zPos: 20 }],
      },
    );

    const ctx = sheet.canvas.getContext('2d');
    const [r, g, b] = ctx.getImageData(1, 513, 1, 1).data;
    expect([r, g, b]).toEqual([0, 0, 255]);
  });
  ```

- [ ] **Step 2.3: Run test to verify failure**

  ```bash
  pnpm --filter @lpc-toolkit/core test -- compose
  ```

  Expected: FAIL because `extraStandardLayers` is not part of `ComposeOptions`.

- [ ] **Step 2.4: Add core option and draw ordering**

  In `packages/core/src/compose.ts`, add near `ComposeOptions`:

  ```ts
  export interface ExtraStandardLayer {
    readonly image: ImageLike;
    readonly zPos: number;
  }
  ```

  Add to `ComposeOptions`:

  ```ts
    readonly extraStandardLayers?: readonly ExtraStandardLayer[];
  ```

  Replace the standard draw loop after `const ctx = canvas.getContext('2d');` with:

  ```ts
  const standardDrawItems: Array<
    | { readonly kind: 'catalog'; readonly value: { readonly d: DrawItem; readonly img: Sprite | null } }
    | { readonly kind: 'extra'; readonly value: ExtraStandardLayer }
  > = [
    ...settled.map((value) => ({ kind: 'catalog' as const, value })),
    ...(options.extraStandardLayers ?? []).map((value) => ({
      kind: 'extra' as const,
      value,
    })),
  ];
  standardDrawItems.sort((a, b) => {
    const az = a.kind === 'catalog' ? a.value.d.zPos : a.value.zPos;
    const bz = b.kind === 'catalog' ? b.value.d.zPos : b.value.zPos;
    return az - bz;
  });

  const drawnFolders = new Set<string>();
  for (const item of standardDrawItems) {
    if (item.kind === 'extra') {
      ctx.drawImage(item.value.image, 0, 0);
      continue;
    }
    const { d, img } = item.value;
    if (!img) continue;
    const swap = options.resolvePalette?.(d.selection, d.item);
    const sprite = swap ? recolorImage(img, swap, { adapter }) : img;
    ctx.drawImage(sprite, 0, d.yPos);
    drawnFolders.add(d.folder);
  }
  ```

  Remove the old `const drawnFolders = new Set<string>(); for (const { d, img } of settled) { ... }` loop.

- [ ] **Step 2.5: Run tests and typecheck**

  ```bash
  pnpm --filter @lpc-toolkit/core test -- compose
  pnpm --filter @lpc-toolkit/core typecheck
  ```

  Expected: PASS.

- [ ] **Step 2.6: Commit**

  ```bash
  git add packages/core/src/compose.ts packages/core/test/compose.test.ts
  git commit -m "feat(core): support extra standard composition layers"
  ```

## Task 3: Hook composition wiring

**Files:**
- Modify: `packages/web/src/hooks/use-composed-character.ts`

**Outcome:** Web composition passes custom overlay into core composition, so PreviewPane, Full Sheet, PNG download, F4, and F7 use the same z-position-aware sheet.

- [ ] **Step 3.1: Import CustomOverlay**

  Add:

  ```ts
  import type { CustomOverlay } from '../lib/custom-overlay';
  ```

- [ ] **Step 3.2: Extend hook signature**

  Change the function signature to:

  ```ts
  export function useComposedCharacter(
    catalog: Catalog,
    palettes: PaletteMetadata,
    state: SliceState,
    assetSource: AssetSource,
    reloadCounter: number = 0,
    customOverlay: CustomOverlay | null = null,
  ): ComposedResult {
  ```

- [ ] **Step 3.3: Include overlay in memo key**

  Replace the `key` line with:

  ```ts
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
  ```

- [ ] **Step 3.4: Pass extra standard layer into composeSelections**

  Add this property inside the `composeSelections(selections, { ... })` options object:

  ```ts
      ...(customOverlay
        ? { extraStandardLayers: [{ image: customOverlay.image, zPos: customOverlay.zPos }] }
        : {}),
  ```

- [ ] **Step 3.5: Update dependency comment**

  Replace the comment before the eslint disable with:

  ```ts
    // key encodes the selection-relevant state and custom overlay identity
    // (anim handled by Effect 2).
  ```

- [ ] **Step 3.6: Typecheck**

  ```bash
  pnpm --filter @lpc-toolkit/web typecheck
  ```

  Expected: PASS.

- [ ] **Step 3.7: Commit**

  ```bash
  git add packages/web/src/hooks/use-composed-character.ts
  git commit -m "feat(web): compose custom overlay with character sheet"
  ```

## Task 4: i18n keys

**Files:**
- Modify: `packages/web/src/i18n.ts`

**Outcome:** Advanced Tools UI has English and zh-TW strings.

- [ ] **Step 4.1: Add English and zh-TW keys**

  Add the spec's `advancedTools.*` keys to both locale blocks in `packages/web/src/i18n.ts`:

  ```ts
  'advancedTools.title': 'Advanced Tools',
  'advancedTools.customUpload': 'Custom spritesheet image',
  'advancedTools.acceptedSize': 'Accepted size: 832x3456',
  'advancedTools.zPosition': 'Z-position',
  'advancedTools.layerHints': 'Layer order: 0=shadow, 10=body, 70=arms, 110=beard',
  'advancedTools.clear': 'Clear Custom Image',
  'advancedTools.userProvidedNotice':
    'User-provided image is included in image exports but not upstream credits.',
  'advancedTools.invalidSize':
    'Custom image must be 832x3456; got {width}x{height}.',
  'advancedTools.loaded': 'Loaded custom image: {name}',
  'advancedTools.cleared': 'Cleared custom image',
  ```

  ```ts
  'advancedTools.title': '進階工具',
  'advancedTools.customUpload': '自訂 spritesheet 圖片',
  'advancedTools.acceptedSize': '接受尺寸:832x3456',
  'advancedTools.zPosition': 'Z 位置',
  'advancedTools.layerHints': '圖層順序:0=陰影,10=身體,70=手臂,110=鬍鬚',
  'advancedTools.clear': '清除自訂圖片',
  'advancedTools.userProvidedNotice':
    '使用者提供的圖片會包含在圖片匯出中,但不會加入上游 credits。',
  'advancedTools.invalidSize': '自訂圖片必須是 832x3456;目前為 {width}x{height}。',
  'advancedTools.loaded': '已載入自訂圖片:{name}',
  'advancedTools.cleared': '已清除自訂圖片',
  ```

- [ ] **Step 4.2: Typecheck and commit**

  ```bash
  pnpm --filter @lpc-toolkit/web typecheck
  git add packages/web/src/i18n.ts
  git commit -m "feat(web/i18n): add advanced tools keys"
  ```

  Expected: typecheck passes, commit succeeds.

## Task 5: Settings UI and harness state

**Files:**
- Modify: `packages/web/src/components/layer-stack/settings-collapsible.tsx`
- Modify: `packages/web/src/components/layer-stack/stack-panel.tsx`
- Modify: `packages/web/src/components/layer-stack/harness.tsx`

**Outcome:** Users can upload/clear a custom image, edit z-position, and see status errors. Object URLs are revoked on clear/replace/unmount.

- [ ] **Step 5.1: Extend SettingsCollapsible props and JSX**

  Add `CustomOverlay` props and render the Advanced Tools section after Asset Source. Use this exact section body:

  ```tsx
          <div>
            <div className="mb-1 text-[10px] uppercase tracking-wide text-text-mute">
              {t('advancedTools.title')}
            </div>
            <div className="space-y-2">
              <label className="block text-[11px] text-text">
                <span className="mb-1 block text-text-mute">
                  {t('advancedTools.customUpload')}
                </span>
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => {
                    const file = e.currentTarget.files?.[0];
                    if (file) onCustomOverlayUpload(file);
                    e.currentTarget.value = '';
                  }}
                  className="block w-full text-[11px] text-text file:mr-2 file:rounded file:border-0 file:bg-surface-2 file:px-2 file:py-1 file:text-[11px] file:text-text"
                />
              </label>
              {customOverlay && (
                <div className="rounded border border-border bg-surface-2 px-2 py-1 text-[11px] text-text">
                  {customOverlay.fileName} · {customOverlay.width}x{customOverlay.height}
                </div>
              )}
              <label className="block text-[11px] text-text">
                <span className="mb-1 block text-text-mute">
                  {t('advancedTools.zPosition')}
                </span>
                <input
                  type="number"
                  value={customOverlayZPos}
                  onChange={(e) => onCustomOverlayZPosChange(e.currentTarget.value)}
                  className="w-full rounded border border-border bg-app px-2 py-1 text-[11px] text-text"
                />
              </label>
              <p className="text-[10px] text-text-mute">{t('advancedTools.acceptedSize')}</p>
              <p className="text-[10px] text-text-mute">{t('advancedTools.layerHints')}</p>
              <p className="text-[10px] text-text-mute">{t('advancedTools.userProvidedNotice')}</p>
              {customOverlay && (
                <Button size="sm" variant="ghost" onClick={onClearCustomOverlay} className="w-full">
                  {t('advancedTools.clear')}
                </Button>
              )}
            </div>
          </div>
  ```

- [ ] **Step 5.2: Thread StackPanel props**

  Add matching `customOverlay`, `customOverlayZPos`, `onCustomOverlayUpload`, `onCustomOverlayZPosChange`, and `onClearCustomOverlay` props to `stack-panel.tsx` and forward them to `<SettingsCollapsible />`.

- [ ] **Step 5.3: Add harness state and callbacks**

  In `harness.tsx`, import:

  ```ts
  import {
    loadCustomOverlayImage,
    parseCustomOverlayZPos,
    type CustomOverlay,
  } from '../../lib/custom-overlay';
  ```

  Add state:

  ```ts
  const [customOverlay, setCustomOverlay] = useState<CustomOverlay | null>(null);
  const [customOverlayZPos, setCustomOverlayZPos] = useState(0);
  ```

  Add callbacks:

  ```ts
  const clearCustomOverlay = useCallback(() => {
    setCustomOverlay((prev) => {
      if (prev) URL.revokeObjectURL(prev.objectUrl);
      return null;
    });
    setCustomOverlayZPos(0);
    setStatus({ kind: 'info', text: t('advancedTools.cleared') });
  }, [t]);

  const handleCustomOverlayZPosChange = useCallback((raw: string) => {
    const zPos = parseCustomOverlayZPos(raw);
    setCustomOverlayZPos(zPos);
    setCustomOverlay((prev) => (prev ? { ...prev, zPos } : prev));
  }, []);

  const handleCustomOverlayUpload = useCallback(
    async (file: File) => {
      try {
        const loaded = await loadCustomOverlayImage({ file, zPos: customOverlayZPos });
        if (!loaded.ok) {
          setStatus({
            kind: 'error',
            text: t('advancedTools.invalidSize')
              .replace('{width}', String(loaded.width))
              .replace('{height}', String(loaded.height)),
          });
          return;
        }
        setCustomOverlay((prev) => {
          if (prev) URL.revokeObjectURL(prev.objectUrl);
          return loaded;
        });
        setStatus({
          kind: 'info',
          text: t('advancedTools.loaded').replace('{name}', loaded.fileName),
        });
      } catch (error) {
        console.error('Custom overlay upload failed:', error);
        setStatus({ kind: 'error', text: t('download.failed') });
      }
    },
    [customOverlayZPos, t],
  );
  ```

- [ ] **Step 5.4: Cleanup, reset, and prop forwarding**

  Add an unmount cleanup effect:

  ```ts
  useEffect(() => {
    return () => {
      setCustomOverlay((prev) => {
        if (prev) URL.revokeObjectURL(prev.objectUrl);
        return null;
      });
    };
  }, []);
  ```

  Pass `customOverlay` into `useComposedCharacter`. In reset `onReset`, clear overlay when `outfit` is true. Forward the five custom overlay props to `<StackPanel />`.

- [ ] **Step 5.5: Typecheck and commit**

  ```bash
  pnpm --filter @lpc-toolkit/web typecheck
  git add packages/web/src/components/layer-stack/settings-collapsible.tsx packages/web/src/components/layer-stack/stack-panel.tsx packages/web/src/components/layer-stack/harness.tsx
  git commit -m "feat(web): add advanced tools custom upload UI"
  ```

  Expected: typecheck passes, commit succeeds.

## Task 6: ZIP export support

**Files:**
- Modify: `packages/web/src/lib/zip-export.ts`
- Modify: `packages/web/test/zip-export.test.ts`
- Modify: `packages/web/src/components/layer-stack/popovers/download-popover.tsx`
- Modify: `packages/web/src/components/layer-stack/harness.tsx`

**Outcome:** F5/F6 include explicit custom-upload item PNGs; credits remain unchanged.

- [ ] **Step 6.1: Add failing ZIP tests**

  In `packages/web/test/zip-export.test.ts`, import:

  ```ts
  import { customOverlayItemFileName, type CustomOverlay } from '../src/lib/custom-overlay';
  ```

  Add helper:

  ```ts
  function makeCustomOverlay(): CustomOverlay {
    const image = createCanvas(832, 3456);
    const ctx = image.getContext('2d');
    ctx.fillStyle = '#0000ff';
    ctx.fillRect(0, 512, 64, 64);
    return {
      fileName: 'Cape Test.png',
      objectUrl: 'blob:test',
      image: image as unknown as CanvasImageSource,
      width: 832,
      height: 3456,
      zPos: 70,
    };
  }
  ```

  Add tests asserting F5 contains `items/${customOverlayItemFileName(...)}`, F6 contains `standard/walk/${customOverlayItemFileName(...)}`, and `credits/credits.txt` does not contain `Cape Test` or `custom-upload`.

- [ ] **Step 6.2: Run tests to verify failure**

  ```bash
  pnpm --filter @lpc-toolkit/web test -- zip-export
  ```

  Expected: FAIL because `ExportContext.customOverlay` and ZIP entries are missing.

- [ ] **Step 6.3: Extend zip-export context and write files**

  In `zip-export.ts`, import `customOverlayItemFileName` and `CustomOverlay`, add `readonly customOverlay?: CustomOverlay | null;` to `ExportContext`, then add:

  ```ts
  async function encodeCustomOverlay(
    ctx: ExportContext,
    customOverlay: CustomOverlay,
  ): Promise<ArrayBuffer> {
    const canvas = ctx.adapter.createCanvas(
      customOverlay.width,
      customOverlay.height,
    );
    const canvasCtx = canvas.getContext('2d');
    canvasCtx.drawImage(customOverlay.image, 0, 0);
    return encodePng(canvas as unknown as HTMLCanvasElement);
  }
  ```

  In F5, before `writeCredits`, add:

  ```ts
  if (ctx.customOverlay) {
    const filename = customOverlayItemFileName({
      fileName: ctx.customOverlay.fileName,
      zPos: ctx.customOverlay.zPos,
    });
    zip.file(
      `items/${filename}`,
      await encodeCustomOverlay(ctx, ctx.customOverlay),
      fileOpts,
    );
  }
  ```

  In F6, after standard item folders and before custom-animation folders, add:

  ```ts
  if (ctx.customOverlay) {
    const filename = customOverlayItemFileName({
      fileName: ctx.customOverlay.fileName,
      zPos: ctx.customOverlay.zPos,
    });
    const buf = await encodeCustomOverlay(ctx, ctx.customOverlay);
    for (const anim of standardAnims) {
      zip.file(`standard/${anim}/${filename}`, buf, { createFolders: false });
    }
  }
  ```

  Do not add custom-upload files under `custom/<anim>/`.

- [ ] **Step 6.4: Thread customOverlay to DownloadPopover**

  Add `customOverlay: CustomOverlay | null` prop to `download-popover.tsx`, pass it into the ZIP `ExportContext`, and pass `customOverlay={customOverlay}` from `harness.tsx`.

- [ ] **Step 6.5: Run tests/typecheck and commit**

  ```bash
  pnpm --filter @lpc-toolkit/web test -- zip-export
  pnpm --filter @lpc-toolkit/web typecheck
  git add packages/web/src/lib/zip-export.ts packages/web/test/zip-export.test.ts packages/web/src/components/layer-stack/popovers/download-popover.tsx packages/web/src/components/layer-stack/harness.tsx
  git commit -m "feat(web): include custom overlay in ZIP exports"
  ```

  Expected: tests and typecheck pass, commit succeeds.

## Task 7: Final verification and manual smoke

**Files:**
- No planned code edits. Fix only issues discovered by verification.

- [ ] **Step 7.1: Run full automated verification**

  ```bash
  pnpm --filter @lpc-toolkit/core test
  pnpm --filter @lpc-toolkit/web test
  pnpm --filter @lpc-toolkit/web typecheck
  ```

  Expected: all pass.

- [ ] **Step 7.2: Start dev server**

  ```bash
  pnpm --filter @lpc-toolkit/web dev -- --host 127.0.0.1
  ```

  Expected: Vite prints a localhost URL, usually `http://127.0.0.1:5173/`.

- [ ] **Step 7.3: Manual smoke checklist**

  1. Open Settings -> Advanced Tools.
  2. Upload a valid `832x3456` transparent PNG with a visible mark; preview updates.
  3. Change z-position; preview recomposes.
  4. Upload invalid size; previous overlay remains and toast reports actual dimensions.
  5. Download PNG; custom mark is present.
  6. Download ZIP by item and ZIP animation+item; custom-upload entries exist.
  7. Download credits TXT/CSV; uploaded filename is absent.
  8. Reset view only; overlay remains.
  9. Reset all; overlay clears.

- [ ] **Step 7.4: Commit verification fixes**

  If no fixes were needed, skip this step. If fixes were needed:

  ```bash
  git add packages/core/src/compose.ts packages/core/test/compose.test.ts packages/web/src/lib/custom-overlay.ts packages/web/test/custom-overlay.test.ts packages/web/src/hooks/use-composed-character.ts packages/web/src/components/layer-stack/settings-collapsible.tsx packages/web/src/components/layer-stack/stack-panel.tsx packages/web/src/components/layer-stack/harness.tsx packages/web/src/components/layer-stack/popovers/download-popover.tsx packages/web/src/lib/zip-export.ts packages/web/test/zip-export.test.ts packages/web/src/i18n.ts
  git commit -m "fix(web): polish custom upload verification issues"
  ```

## Post-flight

- [ ] **Step P.1: Confirm branch state**

  ```bash
  git status --short --branch
  git log --oneline -8
  ```

  Expected: clean working tree on `feat/custom-upload-z-position`.

- [ ] **Step P.2: Hand off to finishing-a-development-branch**

  Use `superpowers:finishing-a-development-branch` after implementation and verification are complete.

## Self-Review Notes

- Spec coverage:
  - UI section: Tasks 4-5
  - strict size validation: Task 1 and Task 5
  - z-position-aware composition: Task 2 and Task 3
  - preview/full-sheet/PNG overlay: Task 3
  - ZIP F5/F6 explicit entries and F4/F7 composed-sheet behavior: Task 6
  - credits exclusion: Task 6 tests
  - reset semantics: Task 5
  - no hash/token persistence: no task adds hash/token fields
  - no browser APIs in core: Task 2 uses `ImageLike`, not `File` or `HTMLImageElement`
- Placeholder scan: no placeholder steps remain.
- Type consistency: `CustomOverlay`, `customOverlay`, `customOverlayZPos`, `extraStandardLayers`, and `customOverlayItemFileName` are used consistently.
