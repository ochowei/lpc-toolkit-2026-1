import type { ThumbnailBoundsOverrides } from './thumbnail-visible-bounds-audit-lib';

/**
 * Confirmed source-data anomalies only. Keys are itemId|bodyType|variant.
 * The default policy includes every alpha-positive pixel.
 */
export const THUMBNAIL_BOUNDS_OVERRIDES: ThumbnailBoundsOverrides = {};
