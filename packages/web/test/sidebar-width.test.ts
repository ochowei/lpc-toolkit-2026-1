import { describe, expect, it } from 'vitest';
import {
  clampSidebarWidth,
  computeSidebarWidthFromPointer,
  DEFAULT_SIDEBAR_WIDTH,
  getRenderedSidebarMax,
  loadSidebarWidth,
  MAX_SIDEBAR_WIDTH,
  MIN_PREVIEW_WIDTH,
  MIN_SIDEBAR_WIDTH,
  saveSidebarWidth,
  SIDEBAR_SPLITTER_WIDTH,
  SIDEBAR_STORAGE_KEY,
} from '../src/lib/sidebar-width';

describe('sidebar width constants', () => {
  it('exports the layout and persistence values', () => {
    expect(DEFAULT_SIDEBAR_WIDTH).toBe(400);
    expect(MIN_SIDEBAR_WIDTH).toBe(320);
    expect(MAX_SIDEBAR_WIDTH).toBe(640);
    expect(MIN_PREVIEW_WIDTH).toBe(320);
    expect(SIDEBAR_SPLITTER_WIDTH).toBe(6);
    expect(SIDEBAR_STORAGE_KEY).toBe('lpc.sidebar-width.v1');
  });
});

describe('clampSidebarWidth', () => {
  it('keeps widths within the active range', () => {
    expect(clampSidebarWidth(400)).toBe(400);
    expect(clampSidebarWidth(320)).toBe(320);
    expect(clampSidebarWidth(640)).toBe(640);
  });

  it('clamps widths to the active bounds', () => {
    expect(clampSidebarWidth(200)).toBe(320);
    expect(clampSidebarWidth(700)).toBe(640);
    expect(clampSidebarWidth(600, 442)).toBe(442);
  });

  it('falls back to the default for non-finite widths', () => {
    expect(clampSidebarWidth(Number.NaN)).toBe(400);
    expect(clampSidebarWidth(Number.POSITIVE_INFINITY)).toBe(400);
  });
});

describe('getRenderedSidebarMax', () => {
  it('reserves space for the preview and splitter within the hard bounds', () => {
    expect(getRenderedSidebarMax(1280)).toBe(640);
    expect(getRenderedSidebarMax(900)).toBe(574);
    expect(getRenderedSidebarMax(768)).toBe(442);
    expect(getRenderedSidebarMax(600)).toBe(320);
  });
});

describe('computeSidebarWidthFromPointer', () => {
  it('uses the pointer position relative to the container and clamps it', () => {
    expect(computeSidebarWidthFromPointer(520, 100, 640)).toBe(420);
    expect(computeSidebarWidthFromPointer(0, 100, 640)).toBe(320);
    expect(computeSidebarWidthFromPointer(900, 100, 574)).toBe(574);
  });
});

describe('loadSidebarWidth', () => {
  it('loads a valid persisted width', () => {
    expect(loadSidebarWidth({ getItem: () => '512' })).toBe(512);
  });

  it.each([null, '', 'wide', '319', '641', 'Infinity'])(
    'falls back to the default for %s',
    (storedWidth) => {
      expect(loadSidebarWidth({ getItem: () => storedWidth })).toBe(400);
    },
  );

  it('falls back to the default when storage access throws', () => {
    expect(
      loadSidebarWidth({
        getItem: () => {
          throw new Error('storage unavailable');
        },
      }),
    ).toBe(400);
  });
});

describe('saveSidebarWidth', () => {
  it('stores a rounded, clamped width at the versioned key', () => {
    const stored: Array<[string, string]> = [];

    saveSidebarWidth(
      {
        setItem: (key, value) => {
          stored.push([key, value]);
        },
      },
      511.7,
    );

    expect(stored).toEqual([[SIDEBAR_STORAGE_KEY, '512']]);
  });

  it('swallows storage access failures', () => {
    expect(() =>
      saveSidebarWidth(
        {
          setItem: () => {
            throw new Error('storage unavailable');
          },
        },
        512,
      ),
    ).not.toThrow();
  });
});
