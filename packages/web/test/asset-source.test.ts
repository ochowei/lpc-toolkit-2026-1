import { describe, expectTypeOf, it } from 'vitest';
import type { AssetSource } from '../src/adapter/asset-source';

describe('AssetSource', () => {
  it('only allows zip', () => {
    expectTypeOf<'zip'>().toEqualTypeOf<AssetSource>();
  });
});
