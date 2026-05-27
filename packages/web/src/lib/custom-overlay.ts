import { SHEET_HEIGHT, SHEET_WIDTH, type ImageLike } from '@lpc-toolkit/core';

export const CUSTOM_OVERLAY_WIDTH = SHEET_WIDTH;
export const CUSTOM_OVERLAY_HEIGHT = SHEET_HEIGHT;

export interface CustomOverlay {
  readonly fileName: string;
  readonly objectUrl: string;
  readonly image: ImageLike;
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
