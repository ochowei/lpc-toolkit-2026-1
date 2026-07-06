import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import {
  composeSelections,
  computeEffectiveLicense,
  creditsToCsv,
  creditsToTxt,
  extractAnimation,
  extractAnimationFrames,
  makeResolvePalette,
  type AnimationName,
  type CanvasLike,
} from '@lpc-toolkit/core';
import { createRuntimeContext } from './context.js';
import { loadCatalogFromRoots, loadPalettesFromRoot } from './loaders.js';
import { createNodeCanvasAdapter, writeCanvasPng } from './node-canvas-adapter.js';
import type { CliIssue } from './response.js';
import { parseSelectionJson, type SelectionJson } from './selection.js';
import { validateSelections } from './validation.js';
import { writeZipBundle } from './zip.js';

export interface RenderArtifact {
  readonly type:
    | 'sheet'
    | 'animation'
    | 'frame'
    | 'credits_txt'
    | 'credits_csv'
    | 'metadata'
    | 'zip';
  readonly path: string;
  readonly width?: number;
  readonly height?: number;
  readonly animation?: string;
  readonly direction?: string;
  readonly frameNumber?: number;
}

export interface RenderSelectionOptions {
  readonly cwd: string;
  readonly outDir: string;
  readonly selectionName: string;
  readonly selectionJson: SelectionJson;
  readonly animations: readonly AnimationName[];
  readonly frames: readonly AnimationName[] | 'all';
  readonly bundleZip: boolean;
  readonly allowPartial: boolean;
}

export interface RenderSelectionResult {
  readonly artifacts: readonly RenderArtifact[];
  readonly warnings: readonly CliIssue[];
  readonly metadataPath: string;
}

interface AnimationMetadata {
  readonly width: number;
  readonly height: number;
  readonly frameCount: number;
  readonly directions: number;
}

function safeName(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || 'sprite';
}

function spritePathExists(spritesheetsBaseUrl: string, spritePath: string): boolean {
  return existsSync(path.join(spritesheetsBaseUrl, spritePath));
}

function animationFrameAnimations(
  requestedFrames: readonly AnimationName[] | 'all',
  composedAnimations: readonly AnimationName[],
): readonly AnimationName[] {
  if (requestedFrames === 'all') return composedAnimations;
  return requestedFrames;
}

function canvasDimensions(canvas: CanvasLike): { readonly width: number; readonly height: number } {
  return { width: canvas.width, height: canvas.height };
}

export async function renderSelection(
  options: RenderSelectionOptions,
): Promise<RenderSelectionResult> {
  const context = createRuntimeContext({ cwd: options.cwd });
  const catalog = loadCatalogFromRoots(
    context.sheetDefinitionsRoot,
    context.customSheetDefinitionsRoot,
  );
  const palettes = loadPalettesFromRoot(context.paletteDefinitionsRoot);
  const parsed = parseSelectionJson(options.selectionJson);
  const validation = validateSelections(parsed.selections, {
    catalog: catalog.catalog,
    palettes: palettes.palettes,
    pathExists: (spritePath) => spritePathExists(context.spritesheetsBaseUrl, spritePath),
  });
  if (!validation.ok && !options.allowPartial) {
    throw new Error(validation.errors.map((error) => error.message).join('\n'));
  }

  const recolorWarnings: CliIssue[] = [];
  const resolvePalette = makeResolvePalette(
    catalog.catalog,
    palettes.palettes,
    parsed.selections,
    {
      onWarn: (message) =>
        recolorWarnings.push({
          code: 'recolor_warning',
          message,
        }),
    },
  );

  mkdirSync(options.outDir, { recursive: true });
  const adapter = createNodeCanvasAdapter();
  const sheet = await composeSelections(parsed.selections, {
    catalog: catalog.catalog,
    adapter,
    spritesheetsBaseUrl: context.spritesheetsBaseUrl,
    resolvePalette,
  });

  const baseName = safeName(options.selectionName);
  const artifacts: RenderArtifact[] = [];
  const writtenFiles: string[] = [];
  const animationMetadata: Record<string, AnimationMetadata> = {};

  const sheetPath = path.join(options.outDir, `${baseName}.sheet.png`);
  await writeCanvasPng(sheet.canvas, sheetPath);
  writtenFiles.push(sheetPath);
  artifacts.push({ type: 'sheet', path: sheetPath, width: sheet.width, height: sheet.height });

  const creditsTxtPath = path.join(options.outDir, `${baseName}.credits.txt`);
  const creditsCsvPath = path.join(options.outDir, `${baseName}.credits.csv`);
  const creditsAnimation = options.animations[0] ?? sheet.animations[0] ?? 'walk';
  writeFileSync(creditsTxtPath, creditsToTxt(sheet.credits, creditsAnimation));
  writeFileSync(creditsCsvPath, creditsToCsv(sheet.credits, creditsAnimation));
  writtenFiles.push(creditsTxtPath, creditsCsvPath);
  artifacts.push({ type: 'credits_txt', path: creditsTxtPath });
  artifacts.push({ type: 'credits_csv', path: creditsCsvPath });

  const animationDir = path.join(options.outDir, 'animations');
  for (const animationName of options.animations) {
    mkdirSync(animationDir, { recursive: true });
    const animation = extractAnimation(sheet, animationName, { adapter });
    const animationPath = path.join(animationDir, `${animationName}.png`);
    await writeCanvasPng(animation.canvas, animationPath);
    writtenFiles.push(animationPath);
    artifacts.push({
      type: 'animation',
      path: animationPath,
      width: animation.width,
      height: animation.height,
      animation: animationName,
    });
    animationMetadata[animationName] = {
      width: animation.width,
      height: animation.height,
      frameCount: animation.frameCount,
      directions: animation.directions,
    };
  }

  const frameAnimations = animationFrameAnimations(options.frames, sheet.animations);
  for (const animationName of frameAnimations) {
    const frames = extractAnimationFrames(sheet, animationName, { adapter });
    const frameDir = path.join(options.outDir, 'frames', animationName);
    mkdirSync(frameDir, { recursive: true });
    for (const [direction, slices] of frames.entries()) {
      for (const frame of slices) {
        const framePath = path.join(
          frameDir,
          `${direction}-${String(frame.frameNumber).padStart(3, '0')}.png`,
        );
        await writeCanvasPng(frame.canvas, framePath);
        writtenFiles.push(framePath);
        artifacts.push({
          type: 'frame',
          path: framePath,
          ...canvasDimensions(frame.canvas),
          animation: animationName,
          direction,
          frameNumber: frame.frameNumber,
        });
      }
    }
  }

  const warnings = [
    ...catalog.warnings,
    ...palettes.warnings,
    ...validation.warnings,
    ...recolorWarnings,
    ...(sheet.missingPaths ?? []).map((missingPath) => ({
      code: 'missing_sprite_path',
      message: 'Composed sheet skipped a missing sprite path.',
      path: missingPath,
    })),
  ];
  const metadataPath = path.join(options.outDir, `${baseName}.metadata.json`);
  artifacts.push({ type: 'metadata', path: metadataPath });
  const zipPath = path.join(options.outDir, `${baseName}.bundle.zip`);
  if (options.bundleZip) {
    artifacts.push({ type: 'zip', path: zipPath });
  }
  const metadata = {
    schema: 'lpc-toolkit.render-metadata.v1',
    cliVersion: '0.0.0',
    selection: options.selectionJson,
    artifacts,
    sheet: {
      width: sheet.width,
      height: sheet.height,
      animations: sheet.animations,
      missingPaths: sheet.missingPaths ?? [],
    },
    animations: animationMetadata,
    frames: frameAnimations,
    effectiveLicense: computeEffectiveLicense(sheet.credits),
    credits: {
      txt: creditsTxtPath,
      csv: creditsCsvPath,
      licenses: sheet.credits.licenses,
      entries: sheet.credits.entries.length,
      resolvedPaths: sheet.credits.resolvedPaths,
    },
    source: {
      assetRoot: context.assetsRoot,
      customAssetRoot: context.customAssetsRoot,
      spritesheetsBaseUrl: context.spritesheetsBaseUrl,
    },
    warnings,
    skippedLayers: options.allowPartial ? validation.errors : [],
  };
  writeFileSync(metadataPath, `${JSON.stringify(metadata, null, 2)}\n`);
  writtenFiles.push(metadataPath);

  if (options.bundleZip) {
    await writeZipBundle(zipPath, writtenFiles, options.outDir);
  }

  return {
    artifacts,
    warnings,
    metadataPath,
  };
}

export function readSelectionJsonFile(cwd: string, selectionPath: string): SelectionJson {
  const raw = JSON.parse(readFileSync(path.resolve(cwd, selectionPath), 'utf8')) as unknown;
  parseSelectionJson(raw);
  return raw as SelectionJson;
}
