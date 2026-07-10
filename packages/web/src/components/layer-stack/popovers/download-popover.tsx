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
import type { LabelTranslator, Translator } from '../../../i18n';
import type { ComposedResult } from '../../../hooks/use-composed-character';
import type { CustomOverlay } from '../../../lib/custom-overlay';
import {
  assertExportableCredits,
  exportSpritesheetBundle,
  isMissingCreditsError,
} from '../../../lib/spritesheet-export';

/** Map export failures to user-facing copy without exposing implementation errors. */
export function downloadErrorTranslationKey(
  error: unknown,
): 'download.noCredits' | 'download.failed' {
  return isMissingCreditsError(error)
    ? 'download.noCredits'
    : 'download.failed';
}

/** Expose exports only after composition has settled for the current inputs. */
export function readyDownloadSheet(result: ComposedResult): ComposedSheet | null {
  return result.status === 'ready' ? result.sheet : null;
}

interface ZipRunning {
  kind: ZipExportKind;
  progress: number;
}

const DOWNLOAD_POPOVER_WIDTH = 288;
const VIEWPORT_GUTTER = 12;

function clampDownloadPopoverLeft(left: number): number {
  if (typeof window === 'undefined') return left;

  const maxLeft = window.innerWidth - DOWNLOAD_POPOVER_WIDTH - VIEWPORT_GUTTER;
  return Math.max(VIEWPORT_GUTTER, Math.min(left, maxLeft));
}

interface Props {
  open: boolean;
  setOpen: (v: boolean) => void;
  result: ComposedResult;
  anim: string;
  selections: Selections;
  catalog: Catalog;
  composeSingleItem: (s: Selections) => Promise<ComposedSheet>;
  composeSingleItemLayer: (
    s: Selections,
    layerNumber: number,
  ) => Promise<ComposedSheet>;
  customOverlay: CustomOverlay | null;
  zipRunning: ZipRunning | null;
  setZipRunning: (r: ZipRunning | null) => void;
  t: Translator;
  tl: LabelTranslator;
  onStatus: (status: { kind: 'info' | 'error'; text: string }) => void;
}

/** Download menu for composed PNGs, attribution files, and ZIP export layouts. */
export function DownloadPopover({
  open,
  setOpen,
  result,
  anim,
  selections,
  catalog,
  composeSingleItem,
  composeSingleItemLayer,
  customOverlay,
  zipRunning,
  setZipRunning,
  t,
  tl,
  onStatus,
}: Props) {
  const { anchorRef, panelRef, pos } = usePopover(open, () => setOpen(false));
  const sheet = readyDownloadSheet(result);
  const disabled = sheet === null;
  const disabledReason =
    result.status === 'error' ? t('download.failed') : t('download.loading');
  const zipDisabled = disabled || zipRunning !== null;

  const handleBundle = async () => {
    if (!sheet) return;
    const frozenSheet = sheet;
    const frozenAnim = anim;
    try {
      assertExportableCredits(frozenSheet.credits);
      const blob = await exportSpritesheetBundle(frozenSheet, frozenAnim);
      downloadBlob(blob, 'character-spritesheet-with-credits.zip');
      onStatus({ kind: 'info', text: t('download.done') });
      setOpen(false);
    } catch (error) {
      console.error('Spritesheet bundle export failed:', error);
      onStatus({ kind: 'error', text: t(downloadErrorTranslationKey(error)) });
    }
  };

  const handleTxt = () => {
    if (!sheet) return;
    try {
      assertExportableCredits(sheet.credits);
      const txt = creditsToTxt(sheet.credits, anim);
      downloadBlob(new Blob([txt], { type: 'text/plain' }), 'credits.txt');
      onStatus({ kind: 'info', text: t('download.done') });
      setOpen(false);
    } catch (error) {
      console.error('TXT credits export failed:', error);
      onStatus({ kind: 'error', text: t(downloadErrorTranslationKey(error)) });
    }
  };

  const handleCsv = () => {
    if (!sheet) return;
    try {
      assertExportableCredits(sheet.credits);
      const csv = creditsToCsv(sheet.credits, anim);
      downloadBlob(new Blob([csv], { type: 'text/csv' }), 'credits.csv');
      onStatus({ kind: 'info', text: t('download.done') });
      setOpen(false);
    } catch (error) {
      console.error('CSV credits export failed:', error);
      onStatus({ kind: 'error', text: t(downloadErrorTranslationKey(error)) });
    }
  };

  const runZip = async (
    kind: ZipExportKind,
    fn: (ctx: ExportContext) => Promise<Blob>,
  ) => {
    if (!sheet) return;
    const frozenSheet = sheet;
    const frozenSelections = selections;
    try {
      assertExportableCredits(frozenSheet.credits);
      const adapter = createBrowserCanvasAdapter();
      setZipRunning({ kind, progress: 0 });
      const blob = await fn({
        sheet: frozenSheet,
        selections: frozenSelections,
        catalog,
        anim,
        composeSingleItem,
        composeSingleItemLayer,
        adapter,
        customOverlay,
        itemLabel: (item) => tl.catalogItemName(item),
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
    } catch (error) {
      console.error('ZIP export failed:', error);
      onStatus({ kind: 'error', text: t(downloadErrorTranslationKey(error)) });
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
        disabled={disabled}
        onClick={() => setOpen(!open)}
        title={disabled ? disabledReason : undefined}
      >
        ⬇ {t('download.title')}
      </Button>
      {open && pos && (
        <div
          ref={panelRef}
          style={{
            position: 'fixed',
            top: pos.top,
            left: clampDownloadPopoverLeft(pos.left),
            zIndex: 50,
          }}
          data-testid="download-popover"
          className="max-h-[calc(100vh-5rem)] w-72 max-w-[calc(100vw-1rem)] overflow-y-auto rounded-md border border-border bg-surface p-3 shadow-lg"
        >
          <div className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-text-mute">
            {t('download.title')}
          </div>
          <div className="flex flex-col gap-1">
            <Button size="sm" variant="primary" disabled={disabled} onClick={handleBundle}>
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
