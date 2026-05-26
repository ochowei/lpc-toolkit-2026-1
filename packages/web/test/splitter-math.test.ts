import { describe, expect, it } from 'vitest';
import {
  clampRatio,
  computeRatioFromPointer,
  SPLITTER_MIN_RATIO,
  SPLITTER_MAX_RATIO,
} from '../src/lib/splitter-math';

describe('clampRatio', () => {
  it('returns the input when within [0.15, 0.85]', () => {
    expect(clampRatio(0.5)).toBe(0.5);
    expect(clampRatio(0.15)).toBe(0.15);
    expect(clampRatio(0.85)).toBe(0.85);
  });

  it('clamps below 0.15 to 0.15', () => {
    expect(clampRatio(0)).toBe(0.15);
    expect(clampRatio(-0.5)).toBe(0.15);
    expect(clampRatio(0.149)).toBe(0.15);
  });

  it('clamps above 0.85 to 0.85', () => {
    expect(clampRatio(1)).toBe(0.85);
    expect(clampRatio(1.5)).toBe(0.85);
    expect(clampRatio(0.851)).toBe(0.85);
  });

  it('exports the bounds for reuse', () => {
    expect(SPLITTER_MIN_RATIO).toBe(0.15);
    expect(SPLITTER_MAX_RATIO).toBe(0.85);
  });
});

describe('computeRatioFromPointer', () => {
  it('returns the relative position when pointer is inside the container', () => {
    // Container at y=100, height=400. Pointer at y=300 → (300-100)/400 = 0.5
    expect(computeRatioFromPointer(300, 100, 400)).toBe(0.5);
  });

  it('clamps to [0.15, 0.85] when pointer is outside', () => {
    // Pointer well above container top
    expect(computeRatioFromPointer(0, 100, 400)).toBe(0.15);
    // Pointer below container bottom
    expect(computeRatioFromPointer(600, 100, 400)).toBe(0.85);
  });

  it('returns 0.85 when containerHeight is zero (degenerate)', () => {
    // (pointerY - top) / 0 = ±Infinity; clamp catches it and returns max.
    expect(computeRatioFromPointer(100, 0, 0)).toBe(0.85);
  });
});
