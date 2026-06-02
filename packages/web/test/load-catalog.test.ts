/** Verifies catalog loading helpers and warning emission behavior. */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ItemDefinition } from '@lpc-toolkit/core';
import {
  __resetCatalogWarningOnceForTests,
  emitCatalogWarningsOnce,
  normalizeUpstreamKey,
  recordsToCatalog,
} from '../src/catalog/load-catalog';

const item: ItemDefinition = {
  name: 'Plain',
  type_name: 'hair',
  animations: ['walk'],
  credits: [],
  layer_1: { zPos: 100, male: 'hair/plain/' },
} as unknown as ItemDefinition;

describe('recordsToCatalog', () => {
  it('builds a catalog and surfaces it with warnings', () => {
    const { catalog, warnings } = recordsToCatalog({
      'hair_plain.json': item,
    });
    expect(catalog.byTypeName.get('hair')?.[0]?.name).toBe('Plain');
    expect(warnings).toEqual([]);
  });
});

describe('normalizeUpstreamKey', () => {
  it('strips the vite glob prefix preceding upstream/sheet_definitions/', () => {
    expect(
      normalizeUpstreamKey(
        '../../../../upstream/sheet_definitions/headwear/hats/magic/hat_magic_large.json',
      ),
    ).toBe('headwear/hats/magic/hat_magic_large.json');
  });

  it('returns the path unchanged when the upstream prefix is absent', () => {
    expect(normalizeUpstreamKey('headwear/hat.json')).toBe('headwear/hat.json');
  });
});

describe('emitCatalogWarningsOnce', () => {
  let spy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    __resetCatalogWarningOnceForTests();
    spy = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    spy.mockRestore();
  });

  const w = (path: string, message: string) => ({ path, message }) as const;

  it('emits one console.warn with the count and the array when first called', () => {
    const warnings = [w('a.json', 'bad x'), w('b.json', 'bad y')] as const;

    emitCatalogWarningsOnce(warnings);

    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenCalledWith('[catalog] 2 load warning(s)', warnings);
  });

  it('does not emit on subsequent calls within the same module load', () => {
    emitCatalogWarningsOnce([w('a.json', 'x')] as const);
    emitCatalogWarningsOnce([w('b.json', 'y')] as const);
    emitCatalogWarningsOnce([w('c.json', 'z')] as const);

    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('does not emit when given an empty warnings list', () => {
    emitCatalogWarningsOnce([]);

    expect(spy).not.toHaveBeenCalled();
  });

  it('emits after __resetCatalogWarningOnceForTests is called', () => {
    emitCatalogWarningsOnce([w('a.json', 'x')] as const);
    expect(spy).toHaveBeenCalledTimes(1);

    __resetCatalogWarningOnceForTests();
    emitCatalogWarningsOnce([w('b.json', 'y')] as const);

    expect(spy).toHaveBeenCalledTimes(2);
  });
});
