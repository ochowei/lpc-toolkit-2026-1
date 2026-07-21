import type { NormalizedAssetPack } from './asset-pack-model.js';

export interface AssetPackSemver {
  readonly major: number;
  readonly minor: number;
  readonly patch: number;
  readonly prerelease: readonly (string | number)[];
}

interface RawAssetPackSemver {
  readonly core: readonly [string, string, string];
  readonly prerelease: readonly string[];
}

const SEMVER_PATTERN = /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/;
const VERSION_COMPARATOR_PATTERN = /^(<=|>=|=|<|>)(.+)$/;
const RAW_SEMVERS = new WeakMap<AssetPackSemver, RawAssetPackSemver>();

export function parseAssetPackSemver(value: string): AssetPackSemver | undefined {
  const match = SEMVER_PATTERN.exec(value);
  if (!match) return undefined;
  const core = [match[1]!, match[2]!, match[3]!] as const;
  const prerelease = match[4] ? match[4].split('.') : [];
  const parsed: AssetPackSemver = {
    major: Number(core[0]),
    minor: Number(core[1]),
    patch: Number(core[2]),
    prerelease: prerelease.map((identifier) =>
      /^\d+$/.test(identifier) ? Number(identifier) : identifier),
  };
  RAW_SEMVERS.set(parsed, { core, prerelease });
  return parsed;
}

export function compareAssetPackVersions(left: string, right: string): number {
  const leftVersion = parseAssetPackSemver(left);
  const rightVersion = parseAssetPackSemver(right);
  if (!leftVersion || !rightVersion) {
    throw new RangeError('Asset-pack version comparison requires valid SemVer values.');
  }
  const leftRaw = RAW_SEMVERS.get(leftVersion);
  const rightRaw = RAW_SEMVERS.get(rightVersion);
  if (!leftRaw || !rightRaw) {
    throw new RangeError('Asset-pack version comparison requires parsed SemVer values.');
  }
  for (let index = 0; index < leftRaw.core.length; index += 1) {
    const comparison = compareDecimal(leftRaw.core[index]!, rightRaw.core[index]!);
    if (comparison !== 0) return comparison;
  }
  if (leftRaw.prerelease.length === 0 && rightRaw.prerelease.length === 0) return 0;
  if (leftRaw.prerelease.length === 0) return 1;
  if (rightRaw.prerelease.length === 0) return -1;
  for (let index = 0; index < Math.max(leftRaw.prerelease.length, rightRaw.prerelease.length); index += 1) {
    const leftIdentifier = leftRaw.prerelease[index];
    const rightIdentifier = rightRaw.prerelease[index];
    if (leftIdentifier === undefined) return -1;
    if (rightIdentifier === undefined) return 1;
    const leftNumeric = /^\d+$/.test(leftIdentifier);
    const rightNumeric = /^\d+$/.test(rightIdentifier);
    if (leftNumeric && rightNumeric) {
      const comparison = compareDecimal(leftIdentifier, rightIdentifier);
      if (comparison !== 0) return comparison;
      continue;
    }
    if (leftNumeric) return -1;
    if (rightNumeric) return 1;
    const comparison = leftIdentifier < rightIdentifier ? -1 : leftIdentifier > rightIdentifier ? 1 : 0;
    if (comparison !== 0) return comparison;
  }
  return 0;
}

function compareDecimal(left: string, right: string): number {
  const normalizedLeft = left.replace(/^0+(?=\d)/, '');
  const normalizedRight = right.replace(/^0+(?=\d)/, '');
  return normalizedLeft.length - normalizedRight.length
    || normalizedLeft.localeCompare(normalizedRight);
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
