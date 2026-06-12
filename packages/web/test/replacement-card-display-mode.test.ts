import { describe, expect, it } from 'vitest';
import {
  DEFAULT_REPLACEMENT_CARD_DISPLAY_MODE,
  REPLACEMENT_CARD_DISPLAY_MODE_STORAGE_KEY,
  loadReplacementCardDisplayMode,
  parseReplacementCardDisplayMode,
  saveReplacementCardDisplayMode,
} from '../src/lib/replacement-card-display-mode';

describe('replacement card display mode', () => {
  it('uses overlay as the approved default', () => {
    expect(DEFAULT_REPLACEMENT_CARD_DISPLAY_MODE).toBe('overlay');
    expect(REPLACEMENT_CARD_DISPLAY_MODE_STORAGE_KEY)
      .toBe('lpc.replacement-card-display-mode.v1');
  });

  it.each(['stacked', 'overlay', 'hidden'] as const)(
    'accepts %s',
    (mode) => {
      expect(parseReplacementCardDisplayMode(mode)).toBe(mode);
      expect(loadReplacementCardDisplayMode({ getItem: () => mode })).toBe(mode);
    },
  );

  it.each([undefined, null, '', 'grid', 'OVERLAY'])(
    'falls back for %s',
    (value) => {
      expect(parseReplacementCardDisplayMode(value)).toBe('overlay');
    },
  );

  it('falls back when storage is unavailable or throws', () => {
    expect(loadReplacementCardDisplayMode(undefined)).toBe('overlay');
    expect(loadReplacementCardDisplayMode({
      getItem: () => {
        throw new Error('blocked');
      },
    })).toBe('overlay');
  });

  it('uses the versioned key and safely persists valid modes', () => {
    const stored: Array<[string, string]> = [];
    saveReplacementCardDisplayMode(
      { setItem: (key, value) => stored.push([key, value]) },
      'hidden',
    );
    expect(stored).toEqual([
      [REPLACEMENT_CARD_DISPLAY_MODE_STORAGE_KEY, 'hidden'],
    ]);
    expect(() => saveReplacementCardDisplayMode({
      setItem: () => {
        throw new Error('blocked');
      },
    }, 'stacked')).not.toThrow();
  });
});
