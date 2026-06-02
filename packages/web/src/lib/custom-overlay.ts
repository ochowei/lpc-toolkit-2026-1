import { SHEET_HEIGHT, SHEET_WIDTH, type ImageLike } from '@lpc-toolkit/core';

/** Custom uploads must match the standard universal sheet dimensions. */
export const CUSTOM_OVERLAY_WIDTH = SHEET_WIDTH;
export const CUSTOM_OVERLAY_HEIGHT = SHEET_HEIGHT;

/** Browser-owned image overlay that can be injected into the composed sheet. */
export interface CustomOverlay {
  readonly fileName: string;
  readonly objectUrl: string;
  readonly image: ImageLike;
  readonly width: number;
  readonly height: number;
  readonly zPos: number;
}

/** Dimension validation result for a user-supplied custom overlay image. */
export type CustomOverlayDimensionResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly width: number; readonly height: number };

/** Narrowed failure shape so UI code can report the actual uploaded size. */
export type InvalidCustomOverlayDimensions = Extract<
  CustomOverlayDimensionResult,
  { readonly ok: false }
>;

/** Verify that an uploaded overlay can line up with the standard LPC sheet. */
export function validateCustomOverlayDimensions(
  width: number,
  height: number,
): CustomOverlayDimensionResult {
  return width === CUSTOM_OVERLAY_WIDTH && height === CUSTOM_OVERLAY_HEIGHT
    ? { ok: true }
    : { ok: false, width, height };
}

/** Parse the user-entered z-position, falling back to the neutral layer. */
export function parseCustomOverlayZPos(raw: string): number {
  const parsed = Number.parseInt(raw, 10);
  return Number.isNaN(parsed) ? 0 : parsed;
}

/** Stable filename used when a custom overlay is included in per-item ZIPs. */
export function customOverlayItemFileName(input: {
  readonly fileName: string;
  readonly zPos: number;
}): string {
  const safe = input.fileName.replace(/[^a-z0-9.]/gi, '_').toLowerCase();
  const padded = String(input.zPos).padStart(3, '0');
  return `${padded} custom-upload_${safe}.png`;
}

/**
 * Decode a user image into an object URL-backed overlay and reject dimensions
 * early so the composer only receives alignable sheets.
 */
export async function loadCustomOverlayImage(args: {
  readonly file: File;
  readonly zPos: number;
}): Promise<CustomOverlay | InvalidCustomOverlayDimensions> {
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
