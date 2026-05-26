import { describe, expect, it } from 'vitest';
import {
  zipExportTimestamp,
  zipName,
  itemFileName,
} from '../src/lib/zip-export';

describe('zipExportTimestamp', () => {
  it('matches the upstream yyyy-MM-ddTHH-mm-ss pattern', () => {
    expect(zipExportTimestamp()).toMatch(
      /^\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}$/,
    );
  });
});

describe('zipName', () => {
  it.each([
    ['byAnimation', 'animations'],
    ['byItem', 'item_spritesheets'],
    ['byAnimItem', 'item_animations'],
    ['byFrame', 'individual_frames'],
  ] as const)('formats %s ZIP filename', (kind, segment) => {
    const name = zipName('male', kind, '2026-05-26T14-32-08');
    expect(name).toBe(`lpc_male_${segment}_2026-05-26T14-32-08.zip`);
  });
});

describe('itemFileName', () => {
  it('zero-pads zPos to 3 digits and lowercases name', () => {
    expect(itemFileName({ name: 'Body Male Light', zPos: 50 })).toBe(
      '050 body_male_light.png',
    );
  });

  it('replaces non-[a-z0-9.] with underscore', () => {
    expect(itemFileName({ name: 'shield #1 (round)', zPos: 200 })).toBe(
      '200 shield__1__round_.png',
    );
  });

  it('falls back to itemId_variant when name is empty', () => {
    expect(
      itemFileName({
        name: '',
        zPos: 7,
        itemId: 'hair_messy',
        variant: 'blonde',
      }),
    ).toBe('007 hair_messy_blonde.png');
  });
});
