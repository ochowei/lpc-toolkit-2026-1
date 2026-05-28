import { creditsToTxt, creditsToCsv } from '@lpc-toolkit/core';
import type {
  Catalog,
  ComposedSheet,
  Selections,
} from '@lpc-toolkit/core';
import { Button } from '../../ui/button';
import { usePopover } from './use-popover';
import { downloadBlob } from '../../../lib/download';
import {
  exportByAnimationZip,
  exportByItemZip,
  exportByAnimItemZip,
  exportByFrameZip,
  zipExportTimestamp,
  zipName,
  type ExportContext,
  type ZipExportKind,
} from '../../../lib/zip-export';
import { createBrowserCanvasAdapter } from '../../../adapter/browser-canvas-adapter';
import type { AssetSource } from '../../../adapter/asset-source';
import type { Translator } from '../../../i18n';
import type { ComposedResult } from '../../../hooks/use-composed-character';
import type { CustomOverlay } from '../../../lib/custom-overlay';

interface ZipRunning {
  kind: ZipExportKind;
  progress: number;
}

interface Props {
  open: boolean;
  setOpen: (v: boolean) => void;
  result: ComposedResult;
  anim: string;
  selections: Selections;
  catalog: Catalog;
  assetSource: AssetSource;
  composeSingleItem: (s: Selections) => Promise<ComposedSheet>;
  customOverlay: CustomOverlay | null;
  zipRunning: ZipRunning | null;
  setZipRunning: (r: ZipRunning | null) => void;
  t: Translator;
  onStatus: (status: { kind: 'info' | 'error'; text: string }) => void;
}

export function DownloadPopover({
  open,
  setOpen,
  result,
  anim,
  selections,
  catalog,
  assetSource,
  composeSingleItem,
  customOverlay,
  zipRunning,
  setZipRunning,
  t,
  onStatus,
}: Props) {
  const { anchorRef, panelRef, pos } = usePopover(open, () => setOpen(false));
  const sheet: ComposedSheet | null = result.sheet;
  const disabled = sheet === null;
  const disabledReason =
    result.status === 'error' ? t('download.failed') : t('download.loading');
  const zipDisabled = disabled || zipRunning !== null;

  const handlePng = () => {
    if (!sheet) return;
    const canvas = sheet.canvas as unknown as HTMLCanvasElement;
    canvas.toBlob((blob) => {
      if (!blob) {
        onStatus({ kind: 'error', text: t('download.failed') });
        return;
      }
      downloadBlob(blob, 'character-spritesheet.png');
      onStatus({ kind: 'info', text: t('download.done') });
      setOpen(false);
    }, 'image/png');
  };

  const handleTxt = () => {
    if (!sheet) return;
    const txt = creditsToTxt(sheet.credits, anim);
    downloadBlob(new Blob([txt], { type: 'text/plain' }), 'credits.txt');
    onStatus({ kind: 'info', text: t('download.done') });
    setOpen(false);
  };

  const handleCsv = () => {
    if (!sheet) return;
    const csv = creditsToCsv(sheet.credits, anim);
    downloadBlob(new Blob([csv], { type: 'text/csv' }), 'credits.csv');
    onStatus({ kind: 'info', text: t('download.done') });
    setOpen(false);
  };

  const runZip = async (
    kind: ZipExportKind,
    fn: (ctx: ExportContext) => Promise<Blob>,
  ) => {
    if (!sheet) return;
    const frozenSheet = sheet;
    const frozenSelections = selections;
    const adapter = createBrowserCanvasAdapter(assetSource);
    setZipRunning({ kind, progress: 0 });
    try {
      const blob = await fn({
        sheet: frozenSheet,
        selections: frozenSelections,
        catalog,
        anim,
        composeSingleItem,
        adapter,
        customOverlay,
        onProgress: (p) => setZipRunning({ kind, progress: p }),
      });
      const filename = zipName(
        frozenSelections.bodyType,
        kind,
        zipExportTimestamp(),
      );
      downloadBlob(blob, filename);
      onStatus({ kind: 'info', text: t('download.done') });
      setOpen(false);
    } catch (err) {
      console.error('ZIP export failed:', err);
      onStatus({ kind: 'error', text: t('download.failed') });
    } finally {
      setZipRunning(null);
    }
  };

  return (
    <>
      <Button
        ref={anchorRef}
        size="sm"
        variant={open ? 'primary' : 'default'}
        onClick={() => setOpen(!open)}
        title={disabled ? disabledReason : undefined}
      >
        ⬇ {t('download.title')}
      </Button>
      {open && pos && (
        <div
          ref={panelRef}
          style={{ position: 'fixed', top: pos.top, left: pos.left, zIndex: 50 }}
          data-testid="download-popover"
          className="max-h-[calc(100vh-5rem)] w-72 max-w-[calc(100vw-1rem)] overflow-y-auto rounded-md border border-border bg-surface p-3 shadow-lg"
        >
          <div className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-text-mute">
            {t('download.title')}
          </div>
          <div className="flex flex-col gap-1">
            <Button size="sm" variant="primary" disabled={disabled} onClick={handlePng}>
              {t('download.png')}
            </Button>
            <Button size="sm" disabled={disabled} onClick={handleTxt}>
              {t('download.creditsTxt')}
            </Button>
            <Button size="sm" disabled={disabled} onClick={handleCsv}>
              {t('download.creditsCsv')}
            </Button>
          </div>
          <div className="my-2 flex items-center gap-2">
            <hr className="flex-1 border-border" />
            <span className="text-[10px] uppercase tracking-wide text-text-mute">
              {t('download.zipSectionLabel')}
            </span>
            <hr className="flex-1 border-border" />
          </div>
          <div className="flex flex-col gap-1">
            <Button
              size="sm"
              disabled={zipDisabled}
              onClick={() => runZip('byAnimation', exportByAnimationZip)}
            >
              {t('download.zipByAnim')}
            </Button>
            <Button
              size="sm"
              disabled={zipDisabled}
              onClick={() => runZip('byItem', exportByItemZip)}
            >
              {t('download.zipByItem')}
            </Button>
            <Button
              size="sm"
              disabled={zipDisabled}
              onClick={() => runZip('byAnimItem', exportByAnimItemZip)}
            >
              {t('download.zipByAnimItem')}
            </Button>
            <Button
              size="sm"
              disabled={zipDisabled}
              onClick={() => runZip('byFrame', exportByFrameZip)}
            >
              {t('download.zipByFrame')}
            </Button>
          </div>
          {zipRunning && (
            <div className="mt-2">
              <div className="h-1 w-full overflow-hidden rounded bg-border">
                <div
                  className="h-full bg-accent transition-[width] duration-150"
                  style={{ width: `${Math.round(zipRunning.progress * 100)}%` }}
                />
              </div>
              <div className="mt-1 text-[10px] text-text-mute">
                {t('download.zipBusy')} {Math.round(zipRunning.progress * 100)}%
              </div>
            </div>
          )}
          {disabled && !zipRunning && (
            <div className="mt-2 text-[10px] text-text-mute">{disabledReason}</div>
          )}
        </div>
      )}
    </>
  );
}
