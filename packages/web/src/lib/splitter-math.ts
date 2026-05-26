export const SPLITTER_MIN_RATIO = 0.15;
export const SPLITTER_MAX_RATIO = 0.85;

export function clampRatio(
  ratio: number,
  min: number = SPLITTER_MIN_RATIO,
  max: number = SPLITTER_MAX_RATIO,
): number {
  if (ratio < min || Number.isNaN(ratio)) return min;
  if (ratio > max) return max;
  return ratio;
}

/**
 * Compute splitter ratio given the pointer's y coordinate, the splitter
 * container's top y, and its height. The ratio is the **top child's**
 * share of available height. Result is clamped to [0.15, 0.85].
 *
 * Degenerate `containerHeight === 0` falls through to clampRatio, which
 * pins NaN / ±Infinity to `SPLITTER_MIN_RATIO` (NaN) or
 * `SPLITTER_MAX_RATIO` (+Infinity) — the +Infinity branch covers a
 * positive (pointerY - containerTop) divided by zero, which is the only
 * realistic case in our pointer-drag flow.
 */
export function computeRatioFromPointer(
  pointerY: number,
  containerTop: number,
  containerHeight: number,
): number {
  const raw = (pointerY - containerTop) / containerHeight;
  return clampRatio(raw);
}
