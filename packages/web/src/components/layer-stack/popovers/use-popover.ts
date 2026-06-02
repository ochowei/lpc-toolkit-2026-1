import { useEffect, useRef, useState, type RefObject } from 'react';

/** Shared fixed-position popover state with outside-click and Escape dismissal. */
export function usePopover(
  open: boolean,
  onClose: () => void,
  externalAnchorRef?: RefObject<HTMLButtonElement>,
) {
  const internalAnchorRef = useRef<HTMLButtonElement>(null);
  const anchorRef = externalAnchorRef ?? internalAnchorRef;
  const panelRef = useRef<HTMLDivElement | null>(null);
  const onCloseRef = useRef(onClose);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!open) { setPos(null); return; }
    const a = anchorRef.current;
    if (!a) return;
    const r = a.getBoundingClientRect();
    setPos({ top: r.bottom + 4, left: r.left });

    const onDoc = (e: MouseEvent) => {
      if (!panelRef.current) return;
      if (panelRef.current.contains(e.target as Node)) return;
      if (anchorRef.current?.contains(e.target as Node)) return;
      onCloseRef.current();
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onCloseRef.current(); };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [anchorRef, open]);

  return { anchorRef, panelRef, pos };
}
