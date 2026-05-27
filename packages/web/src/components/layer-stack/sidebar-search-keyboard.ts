export type ArrowKey = 'ArrowUp' | 'ArrowDown';

export function nextActiveIndex(
  curr: number,
  key: ArrowKey,
  resultsLen: number,
): number {
  if (resultsLen === 0) return -1;
  // Clamp stale curr (e.g., results shrunk between renders) into [-1, resultsLen-1]
  const c = Math.min(Math.max(curr, -1), resultsLen - 1);
  if (key === 'ArrowDown') return Math.min(c + 1, resultsLen - 1);
  return Math.max(c - 1, -1);
}

export function pickIndexForEnter(
  active: number,
  resultsLen: number,
): number | null {
  if (resultsLen === 0) return null;
  if (active >= 0 && active < resultsLen) return active;
  return 0;  // active < 0 OR stale (>= resultsLen) → pick first row
}
