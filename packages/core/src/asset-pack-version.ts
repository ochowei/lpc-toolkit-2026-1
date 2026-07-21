import type { NormalizedAssetPack } from './asset-pack-model.js';

export interface AssetPackSemver {
  readonly major: number;
  readonly minor: number;
  readonly patch: number;
  readonly prerelease: readonly (string | number)[];
}

const SEMVER_PATTERN = /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/;
const VERSION_COMPARATOR_PATTERN = /^(<=|>=|=|<|>)(.+)$/;

export function parseAssetPackSemver(value: string): AssetPackSemver | undefined {
  const match = SEMVER_PATTERN.exec(value);
  if (!match) return undefined;
  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
    prerelease: match[4]
      ? match[4].split('.').map((identifier) =>
        /^\d+$/.test(identifier) ? Number(identifier) : identifier)
      : [],
  };
}

export function compareAssetPackVersions(left: string, right: string): number {
  const leftVersion = parseAssetPackSemver(left);
  const rightVersion = parseAssetPackSemver(right);
  if (!leftVersion || !rightVersion) {
    throw new RangeError('Asset-pack version comparison requires valid SemVer values.');
  }
  for (const key of ['major', 'minor', 'patch'] as const) {
    const comparison = leftVersion[key] - rightVersion[key];
    if (comparison !== 0) return comparison;
  }
  if (leftVersion.prerelease.length === 0 && rightVersion.prerelease.length === 0) return 0;
  if (leftVersion.prerelease.length === 0) return 1;
  if (rightVersion.prerelease.length === 0) return -1;
  for (let index = 0; index < Math.max(leftVersion.prerelease.length, rightVersion.prerelease.length); index += 1) {
    const leftIdentifier = leftVersion.prerelease[index];
    const rightIdentifier = rightVersion.prerelease[index];
    if (leftIdentifier === undefined) return -1;
    if (rightIdentifier === undefined) return 1;
    if (typeof leftIdentifier === 'number' && typeof rightIdentifier === 'number') {
      const comparison = leftIdentifier - rightIdentifier;
      if (comparison !== 0) return comparison;
      continue;
    }
    if (typeof leftIdentifier === 'number') return -1;
    if (typeof rightIdentifier === 'number') return 1;
    const comparison = leftIdentifier.localeCompare(rightIdentifier);
    if (comparison !== 0) return comparison;
  }
  return 0;
}

export function assetPackVersionRangeMatches(range: string, version: string): boolean {
  if (!parseAssetPackSemver(version)) return false;
  const tokens = range.trim().split(/\s+/).filter((token) => token.length > 0);
  return tokens.length > 0 && tokens.every((token) => versionComparatorMatches(token, version));
}

export function assetPackAssetKeys(pack: NormalizedAssetPack): readonly string[] {
  return [...new Set(pack.assets.map((asset) =>
    asset.kind === 'new-item' ? asset.localId : asset.itemId,
  ))].sort((left, right) => left.localeCompare(right));
}

export function assetPackLifecycleReplacementAllows(
  incoming: NormalizedAssetPack,
  installed: NormalizedAssetPack,
): boolean {
  const required = assetPackAssetKeys(installed);
  return incoming.replacements.some((replacement) =>
    replacement.packId === installed.id
    && assetPackVersionRangeMatches(replacement.versions, installed.version)
    && sameStrings([...replacement.assets].sort((left, right) => left.localeCompare(right)), required),
  );
}

function versionComparatorMatches(token: string, version: string): boolean {
  const match = VERSION_COMPARATOR_PATTERN.exec(token);
  const operator = match?.[1];
  const candidate = match?.[2];
  if (!operator || !candidate || !parseAssetPackSemver(candidate)) return false;
  const comparison = compareAssetPackVersions(version, candidate);
  switch (operator) {
    case '<': return comparison < 0;
    case '<=': return comparison <= 0;
    case '=': return comparison === 0;
    case '>=': return comparison >= 0;
    case '>': return comparison > 0;
    default: return false;
  }
}

function sameStrings(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}
