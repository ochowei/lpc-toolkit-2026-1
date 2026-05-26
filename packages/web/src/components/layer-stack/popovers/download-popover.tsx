import { creditsToTxt, creditsToCsv } from '@lpc-toolkit/core';
import type { ComposedSheet } from '@lpc-toolkit/core';
import { Button } from '../../ui/button';
import { usePopover } from './use-popover';
import { downloadBlob } from '../../../lib/download';
import type { Translator } from '../../../i18n';
import type { ComposedResult } from '../../../hooks/use-composed-character';

interface Props {
  open: boolean;
  setOpen: (v: boolean) => void;
  result: ComposedResult;
  anim: string;
  t: Translator;
  onStatus: (status: { kind: 'info' | 'error'; text: string }) => void;
}

export function DownloadPopover({ open, setOpen, result, anim, t, onStatus }: Props) {
  const { anchorRef, panelRef, pos } = usePopover(open, () => setOpen(false));
  const sheet: ComposedSheet | null = result.sheet;
  const disabled = sheet === null;
  const disabledReason = result.status === 'error' ? t('download.failed') : t('download.loading');

  const handlePng = () => {
    if (!sheet) return;
    // ComposedSheet.canvas is a CanvasLike; the browser adapter produces a real
    // HTMLCanvasElement, so toBlob is available. Cast to access it.
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
          className="w-64 rounded-md border border-border bg-surface p-3 shadow-lg"
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
          {disabled && (
            <div className="mt-2 text-[10px] text-text-mute">{disabledReason}</div>
          )}
        </div>
      )}
    </>
  );
}
