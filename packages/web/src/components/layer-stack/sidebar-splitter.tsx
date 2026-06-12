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
  const latestWidthRef = useRef(value);
  const activePointerIdRef = useRef<number | null>(null);
  const activeCleanupRef = useRef<(() => void) | null>(null);
  const valueRef = useRef(value);
  const minRef = useRef(min);
  const maxRef = useRef(max);
  const onChangeRef = useRef(onChange);
  const onCommitRef = useRef(onCommit);
  const onResetRef = useRef(onReset);

  valueRef.current = value;
  minRef.current = min;
  maxRef.current = max;
  onChangeRef.current = onChange;
  onCommitRef.current = onCommit;
  onResetRef.current = onReset;

  const onDown = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    activeCleanupRef.current?.();

    const pointerId = event.pointerId;
    const containerLeft =
      event.currentTarget.parentElement?.getBoundingClientRect().left ??
      event.currentTarget.getBoundingClientRect().left;
    const previousCursor = document.body.style.cursor;
    const previousUserSelect = document.body.style.userSelect;

    activePointerIdRef.current = pointerId;
    latestWidthRef.current = valueRef.current;
    document.body.style.cursor = 'ew-resize';
    document.body.style.userSelect = 'none';

    function cleanupDrag() {
      document.removeEventListener('pointermove', handleMove);
      document.removeEventListener('pointerup', handleUp);
      document.removeEventListener('pointercancel', handleCancel);
      document.body.style.cursor = previousCursor;
      document.body.style.userSelect = previousUserSelect;
      activePointerIdRef.current = null;

      if (activeCleanupRef.current === cleanupDrag) {
        activeCleanupRef.current = null;
      }
    }

    function handleMove(moveEvent: PointerEvent) {
      if (moveEvent.pointerId !== activePointerIdRef.current) return;

      const next = computeSidebarWidthFromPointer(
        moveEvent.clientX,
        containerLeft,
        maxRef.current,
      );
      latestWidthRef.current = next;
      onChangeRef.current(next);
    }

    function handleUp(upEvent: PointerEvent) {
      if (upEvent.pointerId !== activePointerIdRef.current) return;

      const next = latestWidthRef.current;
      cleanupDrag();
      onCommitRef.current(next);
    }

    function handleCancel(cancelEvent: PointerEvent) {
      if (cancelEvent.pointerId !== activePointerIdRef.current) return;
      cleanupDrag();
    }

    activeCleanupRef.current = cleanupDrag;
    document.addEventListener('pointermove', handleMove);
    document.addEventListener('pointerup', handleUp);
    document.addEventListener('pointercancel', handleCancel);
  }, []);

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
          next = minRef.current;
          break;
        case 'End':
          next = maxRef.current;
          break;
        default:
          return;
      }

      event.preventDefault();
      const clamped = Math.min(
        maxRef.current,
        Math.max(
          minRef.current,
          clampSidebarWidth(next, maxRef.current),
        ),
      );
      onChangeRef.current(clamped);
      onCommitRef.current(clamped);
    },
    [],
  );

  const onDoubleClick = useCallback(() => {
    onResetRef.current();
  }, []);

  useEffect(() => {
    return () => {
      activeCleanupRef.current?.();
    };
  }, []);

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
      <div className="absolute -inset-x-1 inset-y-0" />
    </div>
  );
}
