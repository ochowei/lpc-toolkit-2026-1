import {
  assetPackCreditProjection,
  assetPackDefinitionProjection,
  type Catalog,
  type ItemDefinition,
  type PaletteMetadata,
} from '@lpc-toolkit/core';
import type { AssetPackSha256 } from '@lpc-toolkit/asset-pack-format';
import { createBrowserAssetPackFormatRuntime } from '../adapter/asset-pack-format-runtime';
import release from '../../../../asset-release.json';

export interface BrowserAssetPackBaseline {
  readonly catalog: Catalog;
  readonly palettes: PaletteMetadata;
  readonly definitionDigest: AssetPackSha256;
  readonly creditDigest: AssetPackSha256;
  readonly definitionDigests: ReadonlyMap<string, AssetPackSha256>;
  readonly creditDigests: ReadonlyMap<string, AssetPackSha256>;
  readonly releaseTag: string;
  readonly cliVersion: string;
}

function sortedItems(catalog: Catalog): readonly [string, ItemDefinition][] {
  return [...catalog.byItemId.entries()].sort(([left], [right]) => left.localeCompare(right));
}

export async function loadBrowserAssetPackBaseline(options?: {
  readonly catalog?: Catalog;
  readonly palettes?: PaletteMetadata;
}): Promise<BrowserAssetPackBaseline> {
  const catalog = options?.catalog ?? (await import('../catalog/load-catalog')).loadCatalogFromUpstream();
  const palettes = options?.palettes ?? (await import('../catalog/load-palettes')).loadPalettesFromUpstream();
  const runtime = createBrowserAssetPackFormatRuntime();
  const definitions = sortedItems(catalog);
  const definitionDigests = new Map<string, AssetPackSha256>();
  const creditDigests = new Map<string, AssetPackSha256>();
  for (const [itemId, item] of definitions) {
    definitionDigests.set(itemId, await digestProjection(runtime, assetPackDefinitionProjection(item)));
    creditDigests.set(itemId, await digestProjection(runtime, assetPackCreditProjection(item)));
  }
  return {
    catalog,
    palettes,
    definitionDigest: await digestProjection(runtime, definitions.map(([itemId, item]) => [itemId, assetPackDefinitionProjection(item)])),
    creditDigest: await digestProjection(runtime, definitions.map(([itemId, item]) => [itemId, assetPackCreditProjection(item)])),
    definitionDigests,
    creditDigests,
    releaseTag: release.tag,
    cliVersion: __LPC_CLI_VERSION__,
  };
}

async function digestProjection(
  runtime: ReturnType<typeof createBrowserAssetPackFormatRuntime>,
  projection: unknown,
): Promise<AssetPackSha256> {
  // Match the Node baseline's compact JSON digest over the shared, recursively
  // sorted Core projection. The byte contract is persisted in asset-pack
  // registries, so pretty-printing here would create a different baseline.
  return runtime.sha256(runtime.encodeUtf8(JSON.stringify(projection)));
}
