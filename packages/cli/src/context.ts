import path from 'node:path';

export interface RuntimeContextOptions {
  readonly cwd: string;
  readonly assetsRoot?: string;
  readonly customAssetsRoot?: string;
  readonly spritesheetsBaseUrl?: string;
}

export interface RuntimeContext {
  readonly repoRoot: string;
  readonly assetsRoot: string;
  readonly customAssetsRoot: string;
  readonly sheetDefinitionsRoot: string;
  readonly customSheetDefinitionsRoot: string;
  readonly paletteDefinitionsRoot: string;
  readonly spritesheetsBaseUrl: string;
}

function resolveSpritesheetsBaseUrl(baseUrl: string): string {
  return /^[a-zA-Z][a-zA-Z\d+.-]*:/.test(baseUrl) ? baseUrl : path.resolve(baseUrl);
}

export function createRuntimeContext(options: RuntimeContextOptions): RuntimeContext {
  const repoRoot = path.resolve(options.cwd);
  const assetsRoot = path.resolve(options.assetsRoot ?? path.join(repoRoot, 'assets'));
  const customAssetsRoot = path.resolve(
    options.customAssetsRoot ?? path.join(repoRoot, 'assets_custom'),
  );
  const spritesheetsBaseUrl = resolveSpritesheetsBaseUrl(options.spritesheetsBaseUrl ?? assetsRoot);

  return {
    repoRoot,
    assetsRoot,
    customAssetsRoot,
    sheetDefinitionsRoot: path.join(assetsRoot, 'sheet_definitions'),
    customSheetDefinitionsRoot: path.join(customAssetsRoot, 'sheet_definitions'),
    paletteDefinitionsRoot: path.join(assetsRoot, 'palette_definitions'),
    spritesheetsBaseUrl,
  };
}
