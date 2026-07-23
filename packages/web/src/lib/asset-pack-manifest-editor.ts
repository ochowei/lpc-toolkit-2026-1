import type {
  AssetPackAcknowledgement,
  AssetPackCreditSource,
  AssetPackSource,
} from '@lpc-toolkit/core';

export interface AssetPackOverviewProjection {
  readonly id: string;
  readonly displayName: string;
  readonly version: string;
  readonly compatibility?: AssetPackSource['compatibility'];
}

export type AssetPackCreditsProjection = AssetPackCreditSource;

export interface AssetPackAdvancedProjection {
  readonly creditOverrides?: AssetPackSource['creditOverrides'];
  readonly replaces?: AssetPackSource['replaces'];
  readonly assets: AssetPackSource['assets'];
}

const ADVANCED_KEYS = new Set(['creditOverrides', 'replaces', 'assets']);
const COMMON_KEYS = new Set(['schema', 'status', 'id', 'displayName', 'version', 'credits', 'compatibility', 'acknowledgements']);

export function projectAssetPackOverview(source: AssetPackSource): AssetPackOverviewProjection {
  return {
    id: source.id,
    displayName: source.displayName,
    version: source.version,
    ...(source.compatibility ? { compatibility: cloneCompatibility(source.compatibility) } : {}),
  };
}

export function projectAssetPackCredits(source: AssetPackSource): AssetPackCreditsProjection {
  return cloneCredit(source.credits);
}

export function projectAssetPackAdvanced(source: AssetPackSource): AssetPackAdvancedProjection {
  return {
    ...(source.creditOverrides ? { creditOverrides: cloneOverrides(source.creditOverrides) } : {}),
    ...(source.replaces ? { replaces: source.replaces.map((replacement) => ({ ...replacement, assets: [...replacement.assets] })) } : {}),
    assets: source.assets.map((asset) => ({ ...asset })),
  };
}

export function applyAssetPackAdvancedProjection(
  source: AssetPackSource,
  projection: Readonly<Record<string, unknown>>,
): AssetPackSource {
  for (const key of Object.keys(projection)) {
    if (COMMON_KEYS.has(key)) throw new Error(`The advanced editor cannot change ${key}.`);
    if (!ADVANCED_KEYS.has(key)) throw new Error(`Unknown advanced editor field ${key}.`);
  }
  if (!Array.isArray(projection.assets)) throw new Error('The advanced projection must include assets.');
  const next = {
    ...source,
    assets: projection.assets as AssetPackSource['assets'],
  };
  if (Object.prototype.hasOwnProperty.call(projection, 'creditOverrides')) {
    const creditOverrides = projection.creditOverrides as AssetPackSource['creditOverrides'];
    if (creditOverrides !== undefined) next.creditOverrides = creditOverrides;
  }
  if (Object.prototype.hasOwnProperty.call(projection, 'replaces')) {
    const replaces = projection.replaces as AssetPackSource['replaces'];
    if (replaces !== undefined) next.replaces = replaces;
  }
  return next;
}

export function serializeAssetPackManifest(source: AssetPackSource): string {
  return `${JSON.stringify(source, null, 2)}\n`;
}

export function acknowledgeWarning(
  source: AssetPackSource,
  candidate: AssetPackAcknowledgement,
  reason: string,
): AssetPackSource {
  const trimmed = reason.trim();
  if (trimmed.length === 0) throw new Error('A warning acknowledgement reason is required.');
  const acknowledgements = source.acknowledgements ?? [];
  const exact = acknowledgements.some((acknowledgement) => acknowledgementMatches(acknowledgement, candidate));
  const sameBinding = acknowledgements.some((acknowledgement) => sameWarningBinding(acknowledgement, candidate));
  if (!exact && sameBinding) throw new Error('The warning acknowledgement candidate is stale.');
  return {
    ...source,
    acknowledgements: acknowledgements
      .filter((acknowledgement) => !sameWarningBinding(acknowledgement, candidate))
      .concat({ ...candidate, reason: trimmed }),
  };
}

export function removeStaleAcknowledgements(
  source: AssetPackSource,
  candidates: readonly AssetPackAcknowledgement[],
): AssetPackSource {
  return {
    ...source,
    ...(source.acknowledgements
      ? { acknowledgements: source.acknowledgements.filter((acknowledgement) => candidates.some((candidate) => acknowledgementMatches(acknowledgement, candidate))) }
      : {}),
  };
}

function acknowledgementMatches(left: AssetPackAcknowledgement, right: AssetPackAcknowledgement): boolean {
  return left.code === right.code
    && left.contentDigest === right.contentDigest
    && canonical(left.subject) === canonical(right.subject);
}

function sameWarningBinding(left: AssetPackAcknowledgement, right: AssetPackAcknowledgement): boolean {
  return left.code === right.code && canonical(left.subject) === canonical(right.subject);
}

function canonical(value: Readonly<Record<string, string | readonly string[]>>): string {
  return JSON.stringify(Object.fromEntries(Object.entries(value)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, entry]) => [key, Array.isArray(entry) ? [...entry] : entry])));
}

function cloneCredit(credit: AssetPackCreditSource): AssetPackCreditSource {
  return { authors: [...credit.authors], licenses: [...credit.licenses], urls: [...credit.urls], notes: credit.notes };
}

function cloneCompatibility(compatibility: NonNullable<AssetPackSource['compatibility']>): NonNullable<AssetPackSource['compatibility']> {
  return { ...compatibility, ...(compatibility.requiredCapabilities ? { requiredCapabilities: [...compatibility.requiredCapabilities] } : {}) };
}

function cloneOverrides(overrides: NonNullable<AssetPackSource['creditOverrides']>): NonNullable<AssetPackSource['creditOverrides']> {
  return Object.fromEntries(Object.entries(overrides).map(([path, credit]) => [path, cloneCredit(credit)]));
}
