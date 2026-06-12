import { useCallback, useEffect, useRef } from 'react';
import {
  clampSidebarWidth,
  computeSidebarWidthFromPointer,
  SIDEBAR_KEYBOARD_STEP,
} from '../../lib/sidebar-width';

export interface SidebarSplitterProps {
  value: number;
  min: number;
  max: number;
  onChange: (next: number) => void;
  onCommit: (next: number) => void;
  onReset: () => void;
}

export function SidebarSplitter({
  value,
  min,
  max,
  onChange,
  onCommit,
  onReset,
}: SidebarSplitterProps) {
  const draggingRef = useRef(false);
  const containerLeftRef = useRef(0);
  const latestWidthRef = useRef(value);
  const valueRef = useRef(value);
  const maxRef = useRef(max);
  const onChangeRef = useRef(onChange);
  const onCommitRef = useRef(onCommit);
  const onResetRef = useRef(onReset);
  const moveHandlerRef = useRef<((event: PointerEvent) => void) | null>(null);
  const upHandlerRef = useRef<(() => void) | null>(null);

  valueRef.current = value;
  maxRef.current = max;
  onChangeRef.current = onChange;
  onCommitRef.current = onCommit;
  onResetRef.current = onReset;

  const cleanupDrag = useCallback(() => {
    draggingRef.current = false;

    if (moveHandlerRef.current) {
      document.removeEventListener('pointermove', moveHandlerRef.current);
    }
    if (upHandlerRef.current) {
      document.removeEventListener('pointerup', upHandlerRef.current);
    }

    document.body.style.cursor = '';
    document.body.style.userSelect = '';
  }, []);

  const onMove = useCallback((event: PointerEvent) => {
    if (!draggingRef.current) return;

    const next = computeSidebarWidthFromPointer(
      event.clientX,
      containerLeftRef.current,
      maxRef.current,
    );
    latestWidthRef.current = next;
    onChangeRef.current(next);
  }, []);

  const onUp = useCallback(() => {
    const next = latestWidthRef.current;
    cleanupDrag();
    onCommitRef.current(next);
  }, [cleanupDrag]);

  moveHandlerRef.current = onMove;
  upHandlerRef.current = onUp;

  const onDown = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      event.preventDefault();
      draggingRef.current = true;
      containerLeftRef.current =
        event.currentTarget.parentElement?.getBoundingClientRect().left ??
        event.currentTarget.getBoundingClientRect().left;
      latestWidthRef.current = valueRef.current;
      document.body.style.cursor = 'ew-resize';
      document.body.style.userSelect = 'none';
      document.addEventListener('pointermove', onMove);
      document.addEventListener('pointerup', onUp);
    },
    [onMove, onUp],
  );

  const onKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      let next: number;

      switch (event.key) {
        case 'ArrowLeft':
          next = valueRef.current - SIDEBAR_KEYBOARD_STEP;
          break;
        case 'ArrowRight':
          next = valueRef.current + SIDEBAR_KEYBOARD_STEP;
          break;
        case 'Home':
          next = min;
          break;
        case 'End':
          next = maxRef.current;
          break;
        default:
          return;
      }

      event.preventDefault();
      const clamped = clampSidebarWidth(next, maxRef.current);
      onChangeRef.current(clamped);
      onCommitRef.current(clamped);
    },
    [min],
  );

  const onDoubleClick = useCallback(() => {
    onResetRef.current();
  }, []);

  useEffect(() => cleanupDrag, [cleanupDrag]);

  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-valuemin={min}
      aria-valuemax={max}
      aria-valuenow={value}
      aria-label="Resize sidebar"
      tabIndex={0}
      onPointerDown={onDown}
      onKeyDown={onKeyDown}
      onDoubleClick={onDoubleClick}
      className="group relative w-1.5 cursor-ew-resize bg-border transition-colors hover:bg-accent/60 focus-visible:bg-accent/60"
    >
      <div className="pointer-events-none absolute -inset-x-1 inset-y-0" />
    </div>
  );
}
