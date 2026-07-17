import { useMemo, useRef, useState, type ChangeEvent, type RefObject } from 'react';
import {
  decodeSelectionToken,
  encodeSelectionToken,
  serializeHash,
  type Catalog,
  type PaletteMetadata,
} from '@lpc-toolkit/core';
import { Button } from '../../ui/button';
import { usePopover } from './use-popover';
import { toSelections, type SliceAction, type SliceState } from '../../../slice/selection';
import {
  importCharacterDocument,
  saveCharacterDocument,
} from '../../../lib/character-document';
import type { Translator } from '../../../i18n';

interface Props {
  open: boolean;
  setOpen: (value: boolean) => void;
  state: SliceState;
  dispatch: (action: SliceAction) => void;
  disabled: boolean;
  catalog: Catalog;
  palettes: PaletteMetadata;
  t: Translator;
  onStatus: (text: string) => void;
  anchorRef: RefObject<HTMLButtonElement>;
}

/** Character JSON import/export and selection-token sharing controls. */
export function ShareImportPopover({
  open,
  setOpen,
  state,
  dispatch,
  disabled,
  catalog,
  palettes,
  t,
  onStatus,
  anchorRef,
}: Props) {
  const { panelRef, pos } = usePopover(open, () => setOpen(false), anchorRef);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const token = useMemo(() => encodeSelectionToken(toSelections(state)), [state]);
  const [paste, setPaste] = useState('');

  const handleFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const input = event.currentTarget;
    const file = input.files?.[0];
    if (!file) return;

    try {
      const imported = await importCharacterDocument(file, { catalog, palettes });
      dispatch({ type: 'apply_selections', selections: imported.parsed.selections });
      input.value = '';
      setOpen(false);
      onStatus(`${t('share.imported')} ✓`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      input.value = '';
      onStatus(`${t('share.importFailed')}: ${message}`);
    }
  };

  if (!open || !pos) return null;

  return (
    <div
      ref={panelRef}
      style={{ position: 'fixed', top: pos.top, right: 12, zIndex: 50 }}
      className="max-h-[calc(100vh-5rem)] w-80 max-w-[calc(100vw-1rem)] overflow-y-auto rounded-md border border-border bg-surface p-3 shadow-lg"
    >
      <div className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-text-mute">
        {t('share.title')}
      </div>

      <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-text-mute">
        {t('share.characterJson')}
      </div>
      <input
        ref={fileInputRef}
        type="file"
        accept="application/json,.json"
        className="hidden"
        disabled={disabled}
        onChange={(event) => void handleFileChange(event)}
      />
      <div className="mb-3 flex gap-1">
        <Button size="sm" onClick={() => saveCharacterDocument(toSelections(state))}>
          {t('share.saveJson')}
        </Button>
        <Button
          size="sm"
          variant="primary"
          disabled={disabled}
          onClick={() => fileInputRef.current?.click()}
        >
          {t('share.importJson')}
        </Button>
      </div>

      <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-text-mute">
        {t('share.sharing')}
      </div>
      <textarea
        readOnly
        value={token}
        className="mb-2 h-16 w-full resize-none rounded border border-border bg-surface-2 p-2 text-[11px] font-mono"
      />
      <div className="mb-2 flex gap-1">
        <Button
          size="sm"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(token);
              onStatus(`${t('token.copy')} ✓`);
            } catch {
              onStatus(t('token.copyFailed'));
            }
          }}
        >
          {t('token.copy')}
        </Button>
        <Button
          size="sm"
          onClick={async () => {
            const hash = serializeHash(toSelections(state));
            const url = `${window.location.origin}${window.location.pathname}#${hash}`;
            try {
              await navigator.clipboard.writeText(url);
              onStatus(`${t('token.copyLink')} ✓`);
            } catch {
              onStatus(t('token.copyFailed'));
            }
          }}
        >
          {t('token.copyLink')}
        </Button>
      </div>

      <textarea
        value={paste}
        onChange={(event) => setPaste(event.target.value)}
        placeholder={t('token.placeholder')}
        className="mb-2 h-16 w-full resize-none rounded border border-border bg-surface-2 p-2 text-[11px] font-mono"
      />
      <div className="flex gap-1">
        <Button
          size="sm"
          variant="primary"
          disabled={disabled || !paste.trim()}
          onClick={() => {
            try {
              const decoded = decodeSelectionToken(paste.trim(), catalog);
              if (decoded.warnings.length > 0) {
                onStatus(t('token.unresolved'));
                return;
              }
              dispatch({ type: 'apply_selections', selections: decoded.selections });
              setPaste('');
              setOpen(false);
              onStatus(`${t('token.paste')} ✓`);
            } catch (error) {
              onStatus(`${t('token.invalid')}: ${String(error)}`);
            }
          }}
        >
          {t('token.paste')}
        </Button>
      </div>
    </div>
  );
}
