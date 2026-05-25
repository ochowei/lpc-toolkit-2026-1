import { useState } from 'react';
import { Button } from '../../ui/button';
import { usePopover } from './use-popover';
import type { Translator } from '../../../i18n';

interface Props {
  open: boolean;
  setOpen: (v: boolean) => void;
  t: Translator;
  onReset: (scopes: { outfit: boolean; view: boolean; filters: boolean }) => void;
}

export function ResetMenuPopover({ open, setOpen, t, onReset }: Props) {
  const { anchorRef, panelRef, pos } = usePopover(open, () => setOpen(false));
  const [outfit, setOutfit] = useState(true);
  const [view, setView] = useState(false);
  const [filters, setFilters] = useState(false);

  return (
    <>
      <Button ref={anchorRef} size="sm" variant={open ? 'primary' : 'default'} onClick={() => setOpen(!open)}>
        ↻ Reset ▾
      </Button>
      {open && pos && (
        <div
          ref={panelRef}
          style={{ position: 'fixed', top: pos.top, left: pos.left, zIndex: 50 }}
          className="w-56 rounded-md border border-border bg-surface p-3 shadow-lg"
        >
          <div className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-text-mute">Reset scopes</div>
          <label className="mb-1 flex items-center gap-2 text-[12px]">
            <input type="checkbox" checked={outfit} onChange={(e) => setOutfit(e.target.checked)} />
            <span>Outfit</span>
          </label>
          <label className="mb-1 flex items-center gap-2 text-[12px]">
            <input type="checkbox" checked={view} onChange={(e) => setView(e.target.checked)} />
            <span>View</span>
          </label>
          <label className="mb-2 flex items-center gap-2 text-[12px]">
            <input type="checkbox" checked={filters} onChange={(e) => setFilters(e.target.checked)} />
            <span>{t('reset.scope.filters')}</span>
          </label>
          <Button size="sm" variant="primary" disabled={!outfit && !view && !filters} onClick={() => {
            onReset({ outfit, view, filters });
            setOpen(false);
          }}>Reset</Button>
        </div>
      )}
    </>
  );
}
