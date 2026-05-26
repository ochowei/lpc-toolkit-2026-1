import { useCallback, useEffect, useRef } from 'react';
import { computeRatioFromPointer } from '../../lib/splitter-math';

export interface PreviewPaneSplitterProps {
  /**
   * The y-coordinate (in viewport pixels) of the splitter container's
   * top edge. Used together with `containerHeight` to translate raw
   * pointer-y into a ratio.
   */
  containerTop: number;
  containerHeight: number;
  onChange: (next: number) => void;
}

/**
 * Draggable horizontal splitter (4–6px tall). Holds no ratio state of
 * its own; emits `onChange(next)` continuously during pointer drag. The
 * parent owns the ratio state.
 */
export function PreviewPaneSplitter({
  containerTop,
  containerHeight,
  onChange,
}: PreviewPaneSplitterProps) {
  const draggingRef = useRef(false);
  const handleRef = useRef<HTMLDivElement | null>(null);

  // Stash latest container metrics so the document-level pointermove
  // listener (attached once when drag starts) sees fresh values without
  // re-binding on every parent re-render.
  const topRef = useRef(containerTop);
  const heightRef = useRef(containerHeight);
  useEffect(() => {
    topRef.current = containerTop;
    heightRef.current = containerHeight;
  }, [containerTop, containerHeight]);

  const onMove = useCallback(
    (e: PointerEvent) => {
      if (!draggingRef.current) return;
      onChange(
        computeRatioFromPointer(e.clientY, topRef.current, heightRef.current),
      );
    },
    [onChange],
  );

  const onUp = useCallback(() => {
    draggingRef.current = false;
    document.removeEventListener('pointermove', onMove);
    document.removeEventListener('pointerup', onUp);
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
  }, [onMove]);

  const onDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      e.preventDefault();
      draggingRef.current = true;
      document.body.style.cursor = 'ns-resize';
      document.body.style.userSelect = 'none';
      document.addEventListener('pointermove', onMove);
      document.addEventListener('pointerup', onUp);
    },
    [onMove, onUp],
  );

  // Safety cleanup if component unmounts mid-drag.
  useEffect(() => {
    return () => {
      document.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerup', onUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
  }, [onMove, onUp]);

  return (
    <div
      ref={handleRef}
      role="separator"
      aria-orientation="horizontal"
      onPointerDown={onDown}
      className="group relative h-1.5 cursor-ns-resize bg-border hover:bg-accent/60 transition-colors"
    >
      <div className="pointer-events-none absolute inset-x-0 -inset-y-1" />
    </div>
  );
}
