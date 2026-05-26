import { useMemo, useState } from 'react';
import {
  decodeSelectionToken,
  encodeSelectionToken,
  serializeHash,
  type Catalog,
} from '@lpc-toolkit/core';
import { Button } from '../../ui/button';
import { usePopover } from './use-popover';
import { toSelections, type SliceAction, type SliceState } from '../../../slice/selection';
import type { Translator } from '../../../i18n';

interface Props {
  open: boolean;
  setOpen: (v: boolean) => void;
  state: SliceState;
  dispatch: (a: SliceAction) => void;
  catalog: Catalog;
  t: Translator;
  onStatus: (text: string) => void;
}

export function TokenPopover({ open, setOpen, state, dispatch, catalog, t, onStatus }: Props) {
  const { anchorRef, panelRef, pos } = usePopover(open, () => setOpen(false));
  const token = useMemo(() => encodeSelectionToken(toSelections(state)), [state]);
  const [paste, setPaste] = useState('');

  return (
    <>
      <Button ref={anchorRef} size="sm" variant={open ? 'primary' : 'default'} onClick={() => setOpen(!open)}>
        🔗 Token
      </Button>
      {open && pos && (
        <div
          ref={panelRef}
          style={{ position: 'fixed', top: pos.top, left: pos.left, zIndex: 50 }}
          className="w-80 rounded-md border border-border bg-surface p-3 shadow-lg"
        >
          <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-text-mute">
            {t('token.title')}
          </div>
          <textarea
            readOnly
            value={token}
            className="mb-2 h-16 w-full resize-none rounded border border-border bg-surface-2 p-2 text-[11px] font-mono"
          />
          <div className="mb-2 flex gap-1">
            <Button size="sm" onClick={async () => {
              await navigator.clipboard.writeText(token);
              onStatus(`${t('token.copy')} ✓`);
            }}>
              {t('token.copy')}
            </Button>
            <Button
              size="sm"
              onClick={async () => {
                const hash = serializeHash(toSelections(state));
                const url = `${window.location.origin}${window.location.pathname}#${hash}`;
                await navigator.clipboard.writeText(url);
                onStatus(`${t('token.copyLink')} ✓`);
              }}
            >
              {t('token.copyLink')}
            </Button>
          </div>

          <textarea
            value={paste}
            onChange={(e) => setPaste(e.target.value)}
            placeholder={t('token.placeholder')}
            className="mb-2 h-16 w-full resize-none rounded border border-border bg-surface-2 p-2 text-[11px] font-mono"
          />
          <div className="flex gap-1">
            <Button
              size="sm"
              variant="primary"
              disabled={!paste.trim()}
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
                } catch (err) {
                  onStatus(`${t('token.invalid')}: ${String(err)}`);
                }
              }}
            >
              {t('token.paste')}
            </Button>
          </div>
        </div>
      )}
    </>
  );
}
