import { useEffect, useRef } from 'react';
import type { ComposedSheet } from '@lpc-toolkit/core';
import { renderFullSheet } from '../../lib/full-sheet-render';
import type { Translator } from '../../i18n';
import { Button } from '../ui/button';

export type FullSheetZoom = 'fit' | 1 | 2 | 4;

export interface FullSpritesheetPreviewProps {
  sheet: ComposedSheet | null;
  status: 'idle' | 'loading' | 'ready' | 'error';
  grid: boolean;
  mask: boolean;
  zoom: FullSheetZoom;
  onGrid: (v: boolean) => void;
  onMask: (v: boolean) => void;
  onZoom: (v: FullSheetZoom) => void;
  onClose: () => void;
  t: Translator;
}

const ZOOM_PRESETS: readonly FullSheetZoom[] = ['fit', 1, 2, 4];

export function FullSpritesheetPreview({
  sheet,
  status,
  grid,
  mask,
  zoom,
  onGrid,
  onMask,
  onZoom,
  onClose,
  t,
}: FullSpritesheetPreviewProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const display = canvasRef.current;
    if (!display || !sheet) return;
    // ComposedSheet.canvas is a CanvasLike; the browser adapter returns a
    // real HTMLCanvasElement — same cast pattern as download-popover.tsx.
    const source = sheet.canvas as unknown as HTMLCanvasElement;
    renderFullSheet(display, source, { grid, mask });
  }, [sheet, grid, mask]);

  const canvasStyle: React.CSSProperties =
    zoom === 'fit'
      ? { maxWidth: '100%', height: 'auto', imageRendering: 'pixelated' }
      : sheet
        ? {
            width: `${sheet.width * zoom}px`,
            height: 'auto',
            imageRendering: 'pixelated',
          }
        : { imageRendering: 'pixelated' };

  const zoomLabel = (z: FullSheetZoom): string =>
    z === 'fit' ? t('fullSheet.zoom.fit') : `${z}×`;

  return (
    <section
      className="flex min-h-0 flex-col border-t border-border bg-surface"
      aria-label={t('fullSheet.title')}
    >
      <header className="flex items-center gap-2 border-b border-border bg-surface-2 px-3 py-1.5 text-xs">
        <span className="font-semibold uppercase tracking-wide text-text-mute">
          {t('fullSheet.title')}
        </span>
        <label className="ml-2 flex items-center gap-1">
          <input
            type="checkbox"
            checked={grid}
            onChange={(e) => onGrid(e.currentTarget.checked)}
          />
          {t('fullSheet.grid')}
        </label>
        <label className="flex items-center gap-1">
          <input
            type="checkbox"
            checked={mask}
            onChange={(e) => onMask(e.currentTarget.checked)}
          />
          {t('fullSheet.mask')}
        </label>
        <div className="ml-auto flex items-center gap-0.5 rounded bg-surface p-0.5">
          {ZOOM_PRESETS.map((z) => (
            <button
              key={String(z)}
              type="button"
              onClick={() => onZoom(z)}
              className={[
                'rounded px-2 py-0.5 font-mono text-[10px] font-semibold',
                zoom === z
                  ? 'bg-accent text-accent-ink'
                  : 'text-text-2 hover:bg-white/10',
              ].join(' ')}
            >
              {zoomLabel(z)}
            </button>
          ))}
        </div>
        <Button
          size="sm"
          variant="ghost"
          onClick={onClose}
          aria-label={t('fullSheet.close')}
          title={t('fullSheet.close')}
        >
          ✕
        </Button>
      </header>

      <div className="min-h-0 flex-1 overflow-auto bg-app">
        {status === 'loading' && !sheet && (
          <div className="flex h-full items-center justify-center text-xs text-text-mute">
            {t('fullSheet.loading')}
          </div>
        )}
        {status === 'error' && (
          <div className="flex h-full items-center justify-center text-xs text-text-mute">
            {t('fullSheet.error')}
          </div>
        )}
        {sheet && (
          <canvas
            ref={canvasRef}
            style={canvasStyle}
            className="block"
            aria-label={t('fullSheet.title')}
          />
        )}
      </div>
    </section>
  );
}
