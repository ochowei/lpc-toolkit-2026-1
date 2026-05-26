import type {
  BodyType,
  Catalog,
  PaletteMetadata,
  TypeName,
} from '@lpc-toolkit/core';
import type { AssetSource } from '../../adapter/asset-source';
import { useItemThumbnail } from '../../hooks/use-item-thumbnail';

interface Props {
  typeName: TypeName;
  name: string;
  variant?: string;
  recolor?: string;
  size: 20 | 24 | 28;
  bodyType: BodyType;
  catalog: Catalog;
  palettes: PaletteMetadata;
  assetSource: AssetSource;
}

export function ItemThumbnail({
  typeName, name, variant, recolor, size,
  bodyType, catalog, palettes, assetSource,
}: Props) {
  const { canvas, status } = useItemThumbnail({
    typeName, name, size, bodyType, catalog, palettes, assetSource,
    ...(variant !== undefined ? { variant } : {}),
    ...(recolor !== undefined ? { recolor } : {}),
  });

  if (status !== 'ready' || !canvas) {
    // Loading / error → reuse existing grey placeholder style.
    return (
      <div
        className="shrink-0 rounded bg-surface-2"
        style={{ width: size, height: size }}
        aria-hidden
      />
    );
  }

  return (
    <canvas
      ref={(el) => {
        if (!el) return;
        el.width = size;
        el.height = size;
        const ctx = el.getContext('2d');
        if (!ctx) return;
        ctx.imageSmoothingEnabled = false;
        ctx.clearRect(0, 0, size, size);
        ctx.drawImage(canvas, 0, 0);
      }}
      width={size}
      height={size}
      className="shrink-0 rounded"
      style={{ imageRendering: 'pixelated' }}
    />
  );
}
