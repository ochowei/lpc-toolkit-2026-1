import { describe, expect, expectTypeOf, it } from 'vitest';
import {
  assetPackAssetKeys,
  assetPackLifecycleReplacementAllows,
  assetPackVersionRangeMatches,
  compareAssetPackVersions,
  normalizeAssetPack,
  parseAssetPackSemver,
  type AssetPackSemver,
  type AssetPackSource,
} from '../src/index.js';

const credits = {
  authors: ['Artist'],
  licenses: ['CC-BY-SA 4.0'],
  urls: ['https://example.com/artist'],
  notes: '',
} as const;

function pack(options?: {
  readonly id?: string;
  readonly version?: string;
  readonly replaces?: AssetPackSource['replaces'];
  readonly assets?: AssetPackSource['assets'];
}) {
  return normalizeAssetPack({
    schema: 'lpc-toolkit.asset-pack.v1',
    id: options?.id ?? 'acme.hair',
    version: options?.version ?? '1.0.0',
    displayName: 'ACME Hair',
    credits,
    ...(options?.replaces ? { replaces: options.replaces } : {}),
    assets: options?.assets ?? [{
      kind: 'new-item',
      localId: 'moon-braid',
      displayName: 'Moon Braid',
      typeName: 'hair',
      bodyTypes: ['male'],
      animations: ['walk'],
      layers: [{
        id: 'top',
        zPos: 1,
        sprites: [{ animation: 'walk', source: 'sprites/moon-braid/top/walk.png' }],
      }],
    }],
  });
}

describe('asset pack versions', () => {
  it('implements SemVer core and prerelease precedence without build metadata', () => {
    expect(compareAssetPackVersions('1.0.0', '1.0.0-rc.1')).toBeGreaterThan(0);
    expect(compareAssetPackVersions('1.0.0-alpha.2', '1.0.0-alpha.beta')).toBeLessThan(0);
    expect(compareAssetPackVersions('1.0.0-alpha.10', '1.0.0-alpha.2')).toBeGreaterThan(0);
    expect(compareAssetPackVersions('1.0.0+build.2', '1.0.0+build.1')).toBe(0);
  });

  it('uses ASCII code-unit ordering for non-numeric prerelease identifiers', () => {
    expect(compareAssetPackVersions('1.0.0-a', '1.0.0-B')).toBeGreaterThan(0);
    expect(assetPackVersionRangeMatches('>1.0.0-B', '1.0.0-a')).toBe(true);
  });

  it('compares unbounded decimal identifiers without numeric precision loss', () => {
    const lower = '9007199254740992';
    const higher = '9007199254740993';
    const longLower = '12345678901234567890123456789012345678901234567890';
    const longHigher = '12345678901234567890123456789012345678901234567891';

    expect(compareAssetPackVersions(`${lower}.0.0`, `${higher}.0.0`)).toBeLessThan(0);
    expect(compareAssetPackVersions(`${longLower}.0.0`, `${longHigher}.0.0`)).toBeLessThan(0);
    expect(compareAssetPackVersions(`1.0.0-${longLower}`, `1.0.0-${longHigher}`))
      .toBeLessThan(0);
    expect(assetPackVersionRangeMatches(`=${longHigher}.0.0`, `${longHigher}.0.0`)).toBe(true);
  });

  it('keeps the approved public SemVer shape while comparing huge versions precisely', () => {
    expectTypeOf<AssetPackSemver>().toEqualTypeOf<{
      readonly major: number;
      readonly minor: number;
      readonly patch: number;
      readonly prerelease: readonly (string | number)[];
    }>();
    expect(parseAssetPackSemver('1.2.3-4.rc')).toEqual({
      major: 1,
      minor: 2,
      patch: 3,
      prerelease: [4, 'rc'],
    });
    expect(compareAssetPackVersions(
      '99999999999999999999999999999999999999999999999999.0.0',
      '100000000000000000000000000000000000000000000000000.0.0',
    )).toBeLessThan(0);
  });

  it('rejects malformed versions instead of falling back to lexical ordering', () => {
    expect(parseAssetPackSemver('1.0')).toBeUndefined();
    expect(() => compareAssetPackVersions('1.0.0', 'not-a-version')).toThrow(RangeError);
  });

  it.each([
    ['<1.0.0', '0.9.9', true],
    ['<=1.0.0', '1.0.0', true],
    ['=1.0.0', '1.0.0+build.3', true],
    ['>=1.0.0', '1.0.0', true],
    ['>1.0.0', '1.0.1', true],
    ['>=1.0.0 <2.0.0', '1.5.0', true],
    ['>=1.0.0 <2.0.0', '2.0.0', false],
    ['>=1.0.0', 'invalid', false],
    ['^1.0.0', '1.0.0', false],
  ])('matches strict replacement range %s against %s', (range, version, expected) => {
    expect(assetPackVersionRangeMatches(range, version)).toBe(expected);
  });

  it('returns stable, deduplicated keys for new and extended assets', () => {
    const packWithNewAndExtend = pack({
      assets: [
        {
          kind: 'new-item',
          localId: 'moon-braid',
          displayName: 'Moon Braid',
          typeName: 'hair',
          bodyTypes: ['male'],
          animations: ['walk'],
          layers: [{
            id: 'top',
            zPos: 1,
            sprites: [{ animation: 'walk', source: 'sprites/moon-braid/top/walk.png' }],
          }],
        },
        {
          kind: 'extend-item',
          itemId: 'hair_messy',
          baseDefinitionDigest: 'sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
          baseCreditDigest: 'sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
          addAnimations: [],
        },
      ],
    });

    expect(assetPackAssetKeys(packWithNewAndExtend)).toEqual(['hair_messy', 'moon-braid']);
  });

  it('allows only a complete, self-authorized downgrade replacement', () => {
    const installed = pack({ version: '2.0.0' });
    const downgrade = pack({
      version: '1.0.0',
      replaces: [{ packId: 'acme.hair', versions: '=2.0.0', assets: ['moon-braid'] }],
    });

    expect(compareAssetPackVersions('3.0.0', installed.version)).toBeGreaterThan(0);
    expect(compareAssetPackVersions(installed.version, installed.version)).toBe(0);
    expect(assetPackLifecycleReplacementAllows(downgrade, installed)).toBe(true);
    expect(assetPackLifecycleReplacementAllows(pack({
      replaces: [{ packId: 'acme.hair', versions: '=2.0.0', assets: [] }],
    }), installed)).toBe(false);
    expect(assetPackLifecycleReplacementAllows(pack({
      replaces: [{ packId: 'other.hair', versions: '=2.0.0', assets: ['moon-braid'] }],
    }), installed)).toBe(false);
    expect(assetPackLifecycleReplacementAllows(pack({
      replaces: [{ packId: 'acme.hair', versions: '=1.0.0', assets: ['moon-braid'] }],
    }), installed)).toBe(false);
  });
});
