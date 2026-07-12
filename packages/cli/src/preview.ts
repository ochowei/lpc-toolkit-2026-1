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
  computeEffectiveLicense,
  creditsToCsv,
  creditsToTxt,
  DIRECTIONS,
  extractAnimation,
  extractAnimationFrames,
  type AnimationName,
  type CanvasLike,
  type Direction,
} from '@lpc-toolkit/core';
import { composeSelectionForOutput } from './compose-selection.js';
import { writeCanvasPng } from './node-canvas-adapter.js';
import { CLI_VERSION } from './package-info.js';
import type { CliIssue } from './response.js';
import type { RuntimeAssets } from './runtime-assets.js';
import { parseSelectionJson, type SelectionJson } from './selection.js';

export type PreviewErrorCode =
  | 'preview_animation_unavailable'
  | 'preview_direction_unavailable'
  | 'preview_frame_out_of_range'
  | 'preview_incomplete_character';

export class PreviewError extends Error {
  constructor(
    readonly code: PreviewErrorCode,
    message: string,
    readonly path?: string,
    readonly details?: CliIssue['details'],
  ) {
    super(message);
    this.name = 'PreviewError';
  }
}

const PREVIEW_MESSAGES: Readonly<Record<PreviewErrorCode, string>> = {
  preview_animation_unavailable: 'The requested preview animation is unavailable.',
  preview_direction_unavailable: 'The requested preview direction is unavailable.',
  preview_frame_out_of_range: 'The requested preview frame is out of range.',
  preview_incomplete_character: 'The character has no complete attributed layers to preview.',
};

export function previewIssue(
  code: PreviewErrorCode,
  issuePath?: string,
  details?: CliIssue['details'],
): PreviewError {
  return new PreviewError(code, PREVIEW_MESSAGES[code], issuePath, details);
}

export interface PreviewArtifact {
  readonly type: 'preview' | 'credits_txt' | 'credits_csv' | 'metadata';
  readonly path: string;
  readonly width?: number;
  readonly height?: number;
}

export interface CharacterPreviewOptions {
  readonly runtime: RuntimeAssets;
  readonly cwd: string;
  readonly selectionPath: string;
  readonly outDir?: string;
  readonly characterName?: string;
  readonly animation?: AnimationName;
  readonly direction?: string;
  readonly frameIndex?: number;
}

export interface CharacterPreviewResult {
  readonly artifacts: readonly PreviewArtifact[];
  readonly warnings: readonly CliIssue[];
  readonly metadataPath: string;
  readonly outDir: string;
}

function normalizedSafeName(name: string): string | undefined {
  const normalized = name.replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '');
  if (normalized.length === 0 || normalized === '.' || normalized === '..') return undefined;
  return normalized;
}

function readSelection(selectionPath: string): SelectionJson {
  const raw = JSON.parse(readFileSync(selectionPath, 'utf8')) as unknown;
  parseSelectionJson(raw);
  return raw as SelectionJson;
}

function outputIdentity(options: CharacterPreviewOptions, selection: SelectionJson): {
  readonly baseName: string;
  readonly outDir: string;
} {
  const selectionPath = path.resolve(options.cwd, options.selectionPath);
  const fallbackName = path.parse(selectionPath).name;
  const metadataName = typeof selection.name === 'string' && selection.name.length > 0
    ? selection.name
    : undefined;
  const baseName = normalizedSafeName(options.characterName ?? '')
    ?? normalizedSafeName(metadataName ?? '')
    ?? normalizedSafeName(fallbackName)
    ?? 'sprite';
  if (options.outDir !== undefined) {
    return { baseName, outDir: path.resolve(options.cwd, options.outDir) };
  }
  if (options.characterName !== undefined) {
    return {
      baseName,
      outDir: path.join(options.cwd, 'characters', 'previews', baseName),
    };
  }
  return {
    baseName,
    outDir: path.join(path.dirname(selectionPath), 'previews', baseName),
  };
}

function ensurePublishablePath(finalPath: string): void {
  if (!existsSync(finalPath)) return;
  if (statSync(finalPath).isDirectory()) {
    throw new Error(`Cannot write preview artifact over directory: ${finalPath}`);
  }
}

function preflightPublish(outDir: string, artifacts: readonly PreviewArtifact[]): void {
  if (existsSync(outDir) && !statSync(outDir).isDirectory()) {
    throw new Error(`Cannot create preview output directory over file: ${outDir}`);
  }
  for (const artifact of artifacts) ensurePublishablePath(artifact.path);
}

function stagedPath(stagingRoot: string, outDir: string, finalPath: string): string {
  return path.join(stagingRoot, path.relative(outDir, finalPath));
}

function publishPreview(
  stagingRoot: string,
  outDir: string,
  artifacts: readonly PreviewArtifact[],
): void {
  const changes: Array<{ readonly path: string; readonly backup?: string }> = [];
  const createdOutDir = !existsSync(outDir);
  try {
    mkdirSync(outDir, { recursive: true });
    for (const artifact of artifacts) {
      const backup = existsSync(artifact.path)
        ? path.join(stagingRoot, '.backup', path.basename(artifact.path))
        : undefined;
      if (backup) {
        mkdirSync(path.dirname(backup), { recursive: true });
        renameSync(artifact.path, backup);
      }
      changes.push({ path: artifact.path, ...(backup ? { backup } : {}) });
      renameSync(stagedPath(stagingRoot, outDir, artifact.path), artifact.path);
    }
  } catch (error) {
    for (const change of changes.reverse()) {
      rmSync(change.path, { force: true });
      if (change.backup && existsSync(change.backup)) renameSync(change.backup, change.path);
    }
    if (createdOutDir) rmSync(outDir, { recursive: true, force: true });
    throw error;
  }
}

function availableAnimations(
  sheetAnimations: readonly AnimationName[],
  customAnimations: ReadonlyMap<string, unknown> | undefined,
): readonly AnimationName[] {
  return [...new Set([...sheetAnimations, ...(customAnimations?.keys() ?? [])])];
}

function resolveDirection(requested: string, available: readonly Direction[]): Direction | undefined {
  return available.find((direction) => direction === requested);
}

function assertAttributedCharacter(
  layers: readonly unknown[],
  creditEntries: readonly unknown[],
  resolvedPaths: readonly string[],
): void {
  if (layers.length === 0 || creditEntries.length === 0 || resolvedPaths.length === 0) {
    throw previewIssue('preview_incomplete_character');
  }
}

function canvasDimensions(canvas: CanvasLike): { readonly width: number; readonly height: number } {
  return { width: canvas.width, height: canvas.height };
}

function nearestExistingDirectory(targetPath: string): string {
  let candidate = path.resolve(targetPath);
  while (!existsSync(candidate)) {
    const parent = path.dirname(candidate);
    if (parent === candidate) return os.tmpdir();
    candidate = parent;
  }
  return statSync(candidate).isDirectory() ? candidate : path.dirname(candidate);
}

export async function renderCharacterPreview(
  options: CharacterPreviewOptions,
): Promise<CharacterPreviewResult> {
  const selectionPath = path.resolve(options.cwd, options.selectionPath);
  const selectionJson = readSelection(selectionPath);
  const animationName = options.animation ?? 'walk';
  const requestedDirection = options.direction ?? 'down';
  const frameIndex = options.frameIndex ?? 0;
  const composed = await composeSelectionForOutput({
    runtime: options.runtime,
    selectionJson,
    allowPartial: false,
  });
  const { sheet, adapter } = composed;
  assertAttributedCharacter(sheet.layers, sheet.credits.entries, sheet.credits.resolvedPaths);

  const animations = availableAnimations(sheet.animations, sheet.customAnimations);
  if (!animations.includes(animationName)) {
    throw previewIssue('preview_animation_unavailable', animationName, {
      available: animations,
    });
  }
  const animation = extractAnimation(sheet, animationName, { adapter });
  const directions = DIRECTIONS.slice(0, animation.directions);
  const direction = resolveDirection(requestedDirection, directions);
  if (!direction) {
    throw previewIssue('preview_direction_unavailable', requestedDirection, {
      available: directions,
    });
  }
  if (!Number.isInteger(frameIndex) || frameIndex < 0 || frameIndex >= animation.frameCount) {
    throw previewIssue('preview_frame_out_of_range', String(frameIndex), {
      available: Array.from({ length: animation.frameCount }, (_, index) => String(index)),
    });
  }
  const frames = extractAnimationFrames(sheet, animationName, { adapter, skipEmpty: false });
  const frame = frames.get(direction)?.[frameIndex];
  if (!frame) throw previewIssue('preview_frame_out_of_range', String(frameIndex));

  const identity = outputIdentity(options, selectionJson);
  const previewPath = path.join(identity.outDir, `${identity.baseName}.preview.png`);
  const creditsTxtPath = path.join(identity.outDir, `${identity.baseName}.credits.txt`);
  const creditsCsvPath = path.join(identity.outDir, `${identity.baseName}.credits.csv`);
  const metadataPath = path.join(identity.outDir, `${identity.baseName}.metadata.json`);
  const dimensions = canvasDimensions(frame.canvas);
  const artifacts: PreviewArtifact[] = [
    { type: 'preview', path: previewPath, ...dimensions },
    { type: 'credits_txt', path: creditsTxtPath },
    { type: 'credits_csv', path: creditsCsvPath },
    { type: 'metadata', path: metadataPath },
  ];
  const metadata = {
    schema: 'lpc-toolkit.preview-metadata.v1',
    cliVersion: CLI_VERSION,
    sourceSelectionPath: selectionPath,
    animation: animationName,
    direction,
    frameIndex,
    dimensions,
    effectiveLicense: computeEffectiveLicense(sheet.credits),
    artifacts,
    credits: {
      txt: creditsTxtPath,
      csv: creditsCsvPath,
      licenses: sheet.credits.licenses,
      entries: sheet.credits.entries.length,
      resolvedPaths: sheet.credits.resolvedPaths,
    },
  };

  preflightPublish(identity.outDir, artifacts);
  const stagingParent = nearestExistingDirectory(path.dirname(identity.outDir));
  const stagingRoot = mkdtempSync(path.join(stagingParent, `.${identity.baseName}.preview-`));
  try {
    await writeCanvasPng(frame.canvas, stagedPath(stagingRoot, identity.outDir, previewPath));
    writeFileSync(
      stagedPath(stagingRoot, identity.outDir, creditsTxtPath),
      creditsToTxt(sheet.credits, animationName),
    );
    writeFileSync(
      stagedPath(stagingRoot, identity.outDir, creditsCsvPath),
      creditsToCsv(sheet.credits, animationName),
    );
    writeFileSync(
      stagedPath(stagingRoot, identity.outDir, metadataPath),
      `${JSON.stringify(metadata, null, 2)}\n`,
    );
    publishPreview(stagingRoot, identity.outDir, artifacts);
  } finally {
    rmSync(stagingRoot, { recursive: true, force: true });
  }

  return { artifacts, warnings: composed.warnings, metadataPath, outDir: identity.outDir };
}
