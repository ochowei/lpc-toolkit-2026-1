import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import os from 'node:os';
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
import { CLI_VERSION } from './package-info.js';
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

function finalToStagedPath(stagingRoot: string, outDir: string, finalPath: string): string {
  return path.join(stagingRoot, path.relative(outDir, finalPath));
}

function ensurePublishablePath(finalPath: string): void {
  if (!existsSync(finalPath)) return;
  if (statSync(finalPath).isDirectory()) {
    throw new Error(`Cannot write artifact over directory: ${finalPath}`);
  }
}

function ensurePublishableDirectory(dirPath: string): void {
  if (!existsSync(dirPath)) return;
  if (!statSync(dirPath).isDirectory()) {
    throw new Error(`Cannot create output directory because a file already exists: ${dirPath}`);
  }
}

function preflightPublishPaths(outDir: string, artifacts: readonly RenderArtifact[]): void {
  ensurePublishableDirectory(outDir);
  const dirs = new Set<string>();
  for (const artifact of artifacts) {
    ensurePublishablePath(artifact.path);
    let dir = path.dirname(artifact.path);
    while (dir.startsWith(outDir) && !dirs.has(dir)) {
      dirs.add(dir);
      if (dir === outDir) break;
      dir = path.dirname(dir);
    }
  }
  for (const dir of dirs) ensurePublishableDirectory(dir);
}

function publishStagedFiles(
  stagingRoot: string,
  outDir: string,
  artifacts: readonly RenderArtifact[],
): void {
  const changes: Array<{
    readonly finalPath: string;
    readonly backupPath?: string;
  }> = [];
  try {
    mkdirSync(outDir, { recursive: true });
    for (const artifact of artifacts) {
      const stagedPath = finalToStagedPath(stagingRoot, outDir, artifact.path);
      const backupPath = existsSync(artifact.path)
        ? path.join(stagingRoot, '.backup', path.relative(outDir, artifact.path))
        : undefined;
      if (backupPath) {
        mkdirSync(path.dirname(backupPath), { recursive: true });
        renameSync(artifact.path, backupPath);
      }
      changes.push({
        finalPath: artifact.path,
        ...(backupPath ? { backupPath } : {}),
      });
      mkdirSync(path.dirname(artifact.path), { recursive: true });
      renameSync(stagedPath, artifact.path);
    }
  } catch (error) {
    for (const change of changes.reverse()) {
      rmSync(change.finalPath, { force: true });
      if (change.backupPath && existsSync(change.backupPath)) {
        mkdirSync(path.dirname(change.finalPath), { recursive: true });
        renameSync(change.backupPath, change.finalPath);
      }
    }
    throw error;
  }
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

  const adapter = createNodeCanvasAdapter();
  const sheet = await composeSelections(parsed.selections, {
    catalog: catalog.catalog,
    adapter,
    spritesheetsBaseUrl: context.spritesheetsBaseUrl,
    resolvePalette,
  });

  const baseName = safeName(options.selectionName);
  const partialValidationWarnings = options.allowPartial ? validation.errors : [];
  const animationMetadata: Record<string, AnimationMetadata> = {};
  const sheetPath = path.join(options.outDir, `${baseName}.sheet.png`);
  const creditsTxtPath = path.join(options.outDir, `${baseName}.credits.txt`);
  const creditsCsvPath = path.join(options.outDir, `${baseName}.credits.csv`);
  const metadataPath = path.join(options.outDir, `${baseName}.metadata.json`);
  const zipPath = path.join(options.outDir, `${baseName}.bundle.zip`);
  const creditsAnimation = options.animations[0] ?? sheet.animations[0] ?? 'walk';
  const creditsTxt = creditsToTxt(sheet.credits, creditsAnimation);
  const creditsCsv = creditsToCsv(sheet.credits, creditsAnimation);
  const effectiveLicense = computeEffectiveLicense(sheet.credits);

  const artifacts: RenderArtifact[] = [
    { type: 'sheet', path: sheetPath, width: sheet.width, height: sheet.height },
    { type: 'credits_txt', path: creditsTxtPath },
    { type: 'credits_csv', path: creditsCsvPath },
  ];
  const animationOutputs: Array<{
    readonly artifact: RenderArtifact;
    readonly canvas: CanvasLike;
  }> = [];
  const frameOutputs: Array<{
    readonly artifact: RenderArtifact;
    readonly canvas: CanvasLike;
  }> = [];

  const animationDir = path.join(options.outDir, 'animations');
  for (const animationName of options.animations) {
    const animation = extractAnimation(sheet, animationName, { adapter });
    const animationPath = path.join(animationDir, `${animationName}.png`);
    const artifact: RenderArtifact = {
      type: 'animation',
      path: animationPath,
      width: animation.width,
      height: animation.height,
      animation: animationName,
    };
    artifacts.push(artifact);
    animationOutputs.push({ artifact, canvas: animation.canvas });
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
    for (const [direction, slices] of frames.entries()) {
      for (const frame of slices) {
        const framePath = path.join(
          frameDir,
          `${direction}-${String(frame.frameNumber).padStart(3, '0')}.png`,
        );
        const artifact: RenderArtifact = {
          type: 'frame',
          path: framePath,
          ...canvasDimensions(frame.canvas),
          animation: animationName,
          direction,
          frameNumber: frame.frameNumber,
        };
        artifacts.push(artifact);
        frameOutputs.push({ artifact, canvas: frame.canvas });
      }
    }
  }

  const warnings = [
    ...catalog.warnings,
    ...palettes.warnings,
    ...validation.warnings,
    ...partialValidationWarnings,
    ...recolorWarnings,
    ...(sheet.missingPaths ?? []).map((missingPath) => ({
      code: 'missing_sprite_path',
      message: 'Composed sheet skipped a missing sprite path.',
      path: missingPath,
    })),
  ];
  artifacts.push({ type: 'metadata', path: metadataPath });
  if (options.bundleZip) {
    artifacts.push({ type: 'zip', path: zipPath });
  }
  const metadata = {
    schema: 'lpc-toolkit.render-metadata.v1',
    cliVersion: CLI_VERSION,
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
    effectiveLicense,
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

  preflightPublishPaths(options.outDir, artifacts);

  const stagingParent = existsSync(path.dirname(options.outDir))
    ? path.dirname(options.outDir)
    : os.tmpdir();
  const stagingRoot = mkdtempSync(path.join(stagingParent, `.${baseName}.render-`));
  const stagedFiles: string[] = [];
  try {
    const stagedSheetPath = finalToStagedPath(stagingRoot, options.outDir, sheetPath);
    mkdirSync(path.dirname(stagedSheetPath), { recursive: true });
    await writeCanvasPng(sheet.canvas, stagedSheetPath);
    stagedFiles.push(stagedSheetPath);

    const stagedCreditsTxtPath = finalToStagedPath(stagingRoot, options.outDir, creditsTxtPath);
    const stagedCreditsCsvPath = finalToStagedPath(stagingRoot, options.outDir, creditsCsvPath);
    writeFileSync(stagedCreditsTxtPath, creditsTxt);
    writeFileSync(stagedCreditsCsvPath, creditsCsv);
    stagedFiles.push(stagedCreditsTxtPath, stagedCreditsCsvPath);

    for (const output of animationOutputs) {
      const stagedPath = finalToStagedPath(stagingRoot, options.outDir, output.artifact.path);
      mkdirSync(path.dirname(stagedPath), { recursive: true });
      await writeCanvasPng(output.canvas, stagedPath);
      stagedFiles.push(stagedPath);
    }

    for (const output of frameOutputs) {
      const stagedPath = finalToStagedPath(stagingRoot, options.outDir, output.artifact.path);
      mkdirSync(path.dirname(stagedPath), { recursive: true });
      await writeCanvasPng(output.canvas, stagedPath);
      stagedFiles.push(stagedPath);
    }

    const stagedMetadataPath = finalToStagedPath(stagingRoot, options.outDir, metadataPath);
    writeFileSync(stagedMetadataPath, `${JSON.stringify(metadata, null, 2)}\n`);
    stagedFiles.push(stagedMetadataPath);

    if (options.bundleZip) {
      const stagedZipPath = finalToStagedPath(stagingRoot, options.outDir, zipPath);
      await writeZipBundle(stagedZipPath, stagedFiles, stagingRoot);
      stagedFiles.push(stagedZipPath);
    }

    publishStagedFiles(stagingRoot, options.outDir, artifacts);
  } finally {
    rmSync(stagingRoot, { recursive: true, force: true });
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
