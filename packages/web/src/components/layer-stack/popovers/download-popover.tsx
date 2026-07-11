import { Button } from '../../ui/button';
import { usePopover } from './use-popover';
import type { Translator } from '../../../i18n';
import type {
  ExportRunningState,
  ZipExportKind,
} from '../../../hooks/use-character-export';

const DOWNLOAD_POPOVER_WIDTH = 288;
const VIEWPORT_GUTTER = 12;

function clampDownloadPopoverLeft(left: number): number {
  if (typeof window === 'undefined') return left;

  const maxLeft = window.innerWidth - DOWNLOAD_POPOVER_WIDTH - VIEWPORT_GUTTER;
  return Math.max(VIEWPORT_GUTTER, Math.min(left, maxLeft));
}

interface Props {
  open: boolean;
  setOpen: (value: boolean) => void;
  disabled: boolean;
  disabledReason: string;
  running: ExportRunningState | null;
  onBundle: () => void;
  onCreditsTxt: () => void;
  onCreditsCsv: () => void;
  onZip: (kind: ZipExportKind) => void;
  t: Translator;
}

/** Download menu for composed PNGs, attribution files, and ZIP export layouts. */
export function DownloadPopover({
  open,
  setOpen,
  disabled,
  disabledReason,
  running,
  onBundle,
  onCreditsTxt,
  onCreditsCsv,
  onZip,
  t,
}: Props) {
  const { anchorRef, panelRef, pos } = usePopover(open, () => setOpen(false));
  const actionDisabled = disabled || running !== null;

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
            <Button size="sm" variant="primary" disabled={actionDisabled} onClick={onBundle}>
              {t('download.png')}
            </Button>
            <Button size="sm" disabled={actionDisabled} onClick={onCreditsTxt}>
              {t('download.creditsTxt')}
            </Button>
            <Button size="sm" disabled={actionDisabled} onClick={onCreditsCsv}>
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
              disabled={actionDisabled}
              onClick={() => onZip('byAnimation')}
            >
              {t('download.zipByAnim')}
            </Button>
            <Button
              size="sm"
              disabled={actionDisabled}
              onClick={() => onZip('byItem')}
            >
              {t('download.zipByItem')}
            </Button>
            <Button
              size="sm"
              disabled={actionDisabled}
              onClick={() => onZip('byAnimItem')}
            >
              {t('download.zipByAnimItem')}
            </Button>
            <Button
              size="sm"
              disabled={actionDisabled}
              onClick={() => onZip('byFrame')}
            >
              {t('download.zipByFrame')}
            </Button>
          </div>
          {running && (
            <div className="mt-2">
              <div className="h-1 w-full overflow-hidden rounded bg-border">
                <div
                  className="h-full bg-accent transition-[width] duration-150"
                  style={{ width: `${Math.round(running.progress * 100)}%` }}
                />
              </div>
              <div className="mt-1 text-[10px] text-text-mute">
                {t('download.zipBusy')} {Math.round(running.progress * 100)}%
              </div>
            </div>
          )}
          {disabled && !running && (
            <div className="mt-2 text-[10px] text-text-mute">{disabledReason}</div>
          )}
        </div>
      )}
    </>
  );
}
