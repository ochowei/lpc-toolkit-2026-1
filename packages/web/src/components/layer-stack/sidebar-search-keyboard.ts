export type ArrowKey = 'ArrowUp' | 'ArrowDown';

export function nextActiveIndex(
  curr: number,
  key: ArrowKey,
  resultsLen: number,
): number {
  if (resultsLen === 0) return -1;
  if (key === 'ArrowDown') return Math.min(curr + 1, resultsLen - 1);
  return Math.max(curr - 1, -1);
}

export function pickIndexForEnter(
  active: number,
  resultsLen: number,
): number | null {
  if (resultsLen === 0) return null;
  if (active >= 0) return active;
  return 0;
}
