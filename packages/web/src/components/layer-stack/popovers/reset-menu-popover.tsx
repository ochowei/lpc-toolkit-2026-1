import { useState, type RefObject } from 'react';
import { Button } from '../../ui/button';
import { usePopover } from './use-popover';
import type { Translator } from '../../../i18n';

interface Props {
  disabled: boolean;
  open: boolean;
  setOpen: (v: boolean) => void;
  t: Translator;
  onReset: (scopes: { outfit: boolean; view: boolean; filters: boolean }) => void;
  /** When provided, the popover renders panel-only (no built-in trigger). */
  anchorRef?: RefObject<HTMLButtonElement>;
}

/** Reset menu that lets users choose outfit, view, and filter scopes independently. */
export function ResetMenuPopover({ disabled, open, setOpen, t, onReset, anchorRef: externalAnchorRef }: Props) {
  const { anchorRef, panelRef, pos } = usePopover(open, () => setOpen(false), externalAnchorRef);
  const [outfit, setOutfit] = useState(true);
  const [view, setView] = useState(false);
  const [filters, setFilters] = useState(false);
  const compositionResetBlocked = disabled && outfit;

  return (
    <>
      {!externalAnchorRef && (
        <Button ref={anchorRef} size="sm" variant={open ? 'primary' : 'default'} onClick={() => setOpen(!open)}>
          ↻ Reset ▾
        </Button>
      )}
      {open && pos && (
        <div
          ref={panelRef}
          style={{ position: 'fixed', top: pos.top, left: pos.left, zIndex: 50 }}
          className="w-56 rounded-md border border-border bg-surface p-3 shadow-lg"
        >
          <div className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-text-mute">
            {t('reset.menuTitle')}
          </div>
          <label className="mb-1 flex items-center gap-2 text-[12px]">
            <input type="checkbox" checked={outfit} onChange={(e) => setOutfit(e.target.checked)} />
            <span>{t('reset.scope.outfit')}</span>
          </label>
          <label className="mb-1 flex items-center gap-2 text-[12px]">
            <input type="checkbox" checked={view} onChange={(e) => setView(e.target.checked)} />
            <span>{t('reset.scope.view')}</span>
          </label>
          <label className="mb-2 flex items-center gap-2 text-[12px]">
            <input type="checkbox" checked={filters} onChange={(e) => setFilters(e.target.checked)} />
            <span>{t('reset.scope.filters')}</span>
          </label>
          <Button
            size="sm"
            variant="primary"
            disabled={compositionResetBlocked || (!outfit && !view && !filters)}
            onClick={() => {
              onReset({ outfit, view, filters });
              setOpen(false);
            }}
          >
            {t('reset.confirm')}
          </Button>
        </div>
      )}
    </>
  );
}
