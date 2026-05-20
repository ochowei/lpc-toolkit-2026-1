import { describe, expect, it } from 'vitest';
import type { ItemDefinition } from '@lpc-toolkit/core';
import {
  itemMatchesLicenseFilter,
  licenseExceedsFilter,
} from '../src/slice/license-filter';

function item(
  name: string,
  licenses: ItemDefinition['credits'][number]['licenses'],
): ItemDefinition {
  return {
    name,
    type_name: 'hair',
    animations: ['walk'],
    credits: [
      {
        file: `hair/${name}`,
        notes: '',
        authors: ['Artist'],
        licenses,
        urls: [],
      },
    ],
    layer_1: { zPos: 10, male: `hair/${name}/` },
  } as ItemDefinition;
}

describe('itemMatchesLicenseFilter', () => {
  it('allows every item when no license filter is selected', () => {
    expect(itemMatchesLicenseFilter(item('plain', ['GPL 3.0']), null)).toBe(
      true,
    );
  });

  it('matches items with at least one credit using the selected license', () => {
    expect(
      itemMatchesLicenseFilter(item('plain', ['CC-BY 4.0', 'GPL 3.0']), 'GPL 3.0'),
    ).toBe(true);
  });

  it('rejects items without the selected license', () => {
    expect(itemMatchesLicenseFilter(item('plain', ['CC0']), 'GPL 3.0')).toBe(
      false,
    );
  });
});

describe('licenseExceedsFilter', () => {
  it('does not warn when no license filter is selected', () => {
    expect(licenseExceedsFilter('GPL 3.0', null)).toBe(false);
  });

  it('warns when the effective license is more restrictive than the filter', () => {
    expect(licenseExceedsFilter('GPL 3.0', 'CC-BY 4.0')).toBe(true);
  });

  it('does not warn when the effective license is equal to the filter', () => {
    expect(licenseExceedsFilter('CC-BY 4.0', 'CC-BY 4.0')).toBe(false);
  });

  it('does not warn when the effective license is less restrictive than the filter', () => {
    expect(licenseExceedsFilter('CC0', 'CC-BY 4.0')).toBe(false);
  });
});
