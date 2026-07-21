import { randomUUID } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';
import {
  ASSET_PACK_SCHEMA,
  type AssetPackCreditSource,
  type AnimationAuditConsumer,
} from '@lpc-toolkit/core';
import type { AssetAnimationAuditReport } from './animation-audit.js';
import type { CliResponse } from './response.js';

export interface NewAssetPackScaffoldRequest {
  readonly packId: string;
  readonly version: string;
  readonly displayName: string;
  readonly localId: string;
  readonly typeName: string;
  readonly bodyTypes: readonly string[];
  readonly animations: readonly string[];
  readonly credits: AssetPackCreditSource;
  readonly advanced: boolean;
  readonly outputDirectory: string;
}

export interface AuditAssetPackScaffoldRequest {
  readonly reportPath: string;
  readonly itemIds: readonly string[];
  readonly typeNames: readonly string[];
  readonly animations: readonly string[];
  readonly bodyTypes: readonly string[];
  readonly pack: Omit<
    NewAssetPackScaffoldRequest,
    'localId' | 'typeName' | 'bodyTypes' | 'animations' | 'advanced'
  >;
}

export interface AssetPackScaffoldBaselineDigests {
  readonly definitionDigests: ReadonlyMap<string, string>;
  readonly creditDigests: ReadonlyMap<string, string>;
}

export interface AssetPackScaffoldDiagnostic {
  readonly code: string;
  readonly message: string;
  readonly path?: string;
  readonly findingType?: string;
  readonly itemId?: string;
  readonly details?: Readonly<Record<string, unknown>>;
}

export interface AssetPackScaffoldSuccess {
  readonly ok: true;
  readonly packRoot: string;
  readonly manifestPath: string;
}

export interface AssetPackScaffoldFailure {
  readonly ok: false;
  readonly diagnostics: readonly AssetPackScaffoldDiagnostic[];
}

export type AssetPackScaffoldResult =
  | AssetPackScaffoldSuccess
  | AssetPackScaffoldFailure;

type AuditEnvelope = CliResponse<AssetAnimationAuditReport>;

interface AuditEnvelopeSuccess {
  readonly ok: true;
  readonly envelope: AuditEnvelope & { readonly data: AssetAnimationAuditReport };
}

interface ExtendLayerDraft {
  readonly layer: `layer_${number}`;
  readonly bodyTypes: readonly string[];
  readonly source: string;
  readonly destination: {
    readonly path: string;
    readonly evidence: 'audit-exact' | 'audit-inferred';
    readonly accepted: boolean;
  };
  readonly variant?: string;
  readonly consumers: readonly AnimationAuditConsumer[];
}

interface ExtendAnimationDraft {
  readonly animation: string;
  readonly layers: readonly ExtendLayerDraft[];
}

interface ExtendAssetDraft {
  readonly itemId: string;
  readonly typeName: string;
  readonly addAnimations: readonly ExtendAnimationDraft[];
}

function writeJson(filePath: string, value: unknown): void {
  mkdirSync(path.dirname(filePath), { recursive: true });
  writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function titleCaseFromSlug(value: string): string {
  return value
    .split(/[-_.]+/u)
    .filter((part) => part.length > 0)
    .map((part) => `${part.slice(0, 1).toUpperCase()}${part.slice(1)}`)
    .join(' ');
}

function slug(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, '-')
    .replace(/^-+|-+$/gu, '');
}

function sortedUnique(values: readonly string[]): readonly string[] {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right));
}

function publishPack(
  packRoot: string,
  build: (stagingRoot: string) => void,
): AssetPackScaffoldResult {
  if (existsSync(packRoot)) {
    return {
      ok: false,
      diagnostics: [{
        code: 'asset_pack_output_exists_v1',
        message: 'Asset-pack scaffold destination already exists.',
        path: packRoot,
      }],
    };
  }

  const parent = path.dirname(packRoot);
  const stagingRoot = path.join(parent, `.${path.basename(packRoot)}.tmp-${randomUUID()}`);
  mkdirSync(parent, { recursive: true });
  mkdirSync(stagingRoot, { recursive: true });

  try {
    build(stagingRoot);
    if (existsSync(packRoot)) {
      return {
        ok: false,
        diagnostics: [{
          code: 'asset_pack_output_exists_v1',
          message: 'Asset-pack scaffold destination already exists.',
          path: packRoot,
        }],
      };
    }
    renameSync(stagingRoot, packRoot);
    return {
      ok: true,
      packRoot,
      manifestPath: path.join(packRoot, 'asset-pack.json'),
    };
  } catch (error) {
    return {
      ok: false,
      diagnostics: [{
        code: 'asset_pack_publish_failed',
        message: error instanceof Error ? error.message : 'Could not publish asset-pack scaffold.',
        path: packRoot,
      }],
    };
  } finally {
    rmSync(stagingRoot, { recursive: true, force: true });
  }
}

function scaffoldSourceDirectories(
  root: string,
  sourcePaths: readonly string[],
): void {
  sourcePaths.forEach((sourcePath) => {
    mkdirSync(path.join(root, path.dirname(sourcePath)), { recursive: true });
  });
}

export function scaffoldNewAssetPack(
  request: NewAssetPackScaffoldRequest,
): AssetPackScaffoldResult {
  const packRoot = path.resolve(request.outputDirectory);
  return publishPack(packRoot, (stagingRoot) => {
    const manifest = {
      schema: ASSET_PACK_SCHEMA,
      id: request.packId,
      version: request.version,
      displayName: request.displayName,
      credits: request.credits,
      assets: [{
        kind: 'new-item' as const,
        localId: request.localId,
        displayName: titleCaseFromSlug(request.localId),
        typeName: request.typeName,
        bodyTypes: [...request.bodyTypes],
        animations: [...request.animations],
        layers: [{
          id: 'foreground',
          zPos: 120,
          sprites: request.animations.map((animation) => ({
            animation,
            source: `sprites/${request.localId}/foreground/${animation}.png`,
          })),
        }],
      }],
    };
    writeJson(path.join(stagingRoot, 'asset-pack.json'), manifest);
    scaffoldSourceDirectories(
      stagingRoot,
      request.animations.map((animation) => `sprites/${request.localId}/foreground/${animation}.png`),
    );
    if (request.advanced) {
      writeFileSync(
        path.join(stagingRoot, 'README.md'),
        [
          '# Asset pack scaffold',
          '',
          'Optional next steps:',
          '- add variants when the item needs them',
          '- add recolor only after choosing a real palette contract',
          '- add credit overrides only for source-specific attribution changes',
          '',
        ].join('\n'),
      );
    }
  });
}

function readAuditEnvelope(reportPath: string): AuditEnvelopeSuccess | AssetPackScaffoldFailure {
  let envelope: unknown;
  try {
    envelope = JSON.parse(readFileSync(reportPath, 'utf8')) as unknown;
  } catch (error) {
    return {
      ok: false,
      diagnostics: [{
        code: 'audit_report_invalid_v1',
        message: error instanceof Error ? error.message : 'Invalid audit report JSON.',
        path: reportPath,
      }],
    };
  }

  if (
    !envelope
    || typeof envelope !== 'object'
    || !('ok' in envelope)
    || !('command' in envelope)
    || !('data' in envelope)
  ) {
    return {
      ok: false,
      diagnostics: [{
        code: 'audit_report_invalid_v1',
        message: 'Audit report must be a successful catalog audit-animations envelope.',
        path: reportPath,
      }],
    };
  }

  const typed = envelope as AuditEnvelope;
  const data = typed.data;
  if (
    typed.ok !== true
    || typed.command !== 'catalog audit-animations'
    || !data
    || !Array.isArray(data.targets)
    || typeof data.scope !== 'object'
    || data.scope === null
    || !Array.isArray(data.unsupported)
    || !Array.isArray(data.missingFiles)
    || !Array.isArray(data.blankFrames)
    || !Array.isArray(data.errors)
  ) {
    return {
      ok: false,
      diagnostics: [{
        code: 'audit_report_invalid_v1',
        message: 'Audit report must be a successful catalog audit-animations envelope.',
        path: reportPath,
      }],
    };
  }

  return {
    ok: true,
    envelope: typed as AuditEnvelope & { readonly data: AssetAnimationAuditReport },
  };
}

function matchesSelection(
  request: AuditAssetPackScaffoldRequest,
  consumer: AnimationAuditConsumer,
  animation: string,
): boolean {
  const itemSelected = request.itemIds.length === 0 || request.itemIds.includes(consumer.itemId);
  const typeSelected = request.typeNames.length === 0 || request.typeNames.includes(consumer.typeName);
  const identitySelected = request.itemIds.length > 0 || request.typeNames.length > 0
    ? itemSelected && typeSelected
    : false;
  const animationSelected = request.animations.length === 0 || request.animations.includes(animation);
  const bodySelected = request.bodyTypes.length === 0
    || consumer.bodyTypes.some((bodyType) => request.bodyTypes.includes(bodyType));
  return identitySelected && animationSelected && bodySelected;
}

function combineConsumers(
  consumers: readonly AnimationAuditConsumer[],
): readonly AnimationAuditConsumer[] {
  return [...consumers].sort((left, right) =>
    [
      left.itemId,
      left.typeName,
      left.layer,
      left.bodyTypes.join('\u0000'),
      left.variant ?? '',
      left.recolors.join('\u0000'),
    ].join('\u0000').localeCompare([
      right.itemId,
      right.typeName,
      right.layer,
      right.bodyTypes.join('\u0000'),
      right.variant ?? '',
      right.recolors.join('\u0000'),
    ].join('\u0000')));
}

function sourcePathFor(
  itemId: string,
  animation: string,
  layer: string,
  variant?: string,
): string {
  const suffix = variant ? `-${slug(variant)}` : '';
  return `sprites/${slug(itemId)}/${slug(animation)}/${slug(layer)}${suffix}.png`;
}

function draftKey(
  itemId: string,
  animation: string,
  layer: string,
  variant: string | undefined,
  destinationPath: string,
  evidence: 'audit-exact' | 'audit-inferred',
): string {
  return [itemId, animation, layer, variant ?? '', destinationPath, evidence].join('\u0000');
}

function buildDrafts(
  request: AuditAssetPackScaffoldRequest,
  report: AssetAnimationAuditReport,
): {
  readonly drafts: readonly ExtendAssetDraft[];
  readonly diagnostics: readonly AssetPackScaffoldDiagnostic[];
} {
  const diagnostics: AssetPackScaffoldDiagnostic[] = [];
  const byItem = new Map<string, Map<string, ExtendLayerDraft>>();

  report.unsupported.forEach((finding) => {
    finding.requirements.forEach((requirement) => {
      if (!matchesSelection(request, requirement, finding.animation)) return;
      if (requirement.pathConfidence === 'manual-review' || !requirement.expectedPath) {
        diagnostics.push({
          code: 'finding_not_scaffoldable_v1',
          message: requirement.manualReviewReason ?? 'Selected finding requires manual review.',
          findingType: 'unsupported',
          itemId: finding.itemId,
          details: {
            animation: finding.animation,
            layer: requirement.layer,
          },
        });
        return;
      }
      const itemDrafts = byItem.get(finding.itemId) ?? new Map<string, ExtendLayerDraft>();
      byItem.set(finding.itemId, itemDrafts);
      const key = draftKey(
        finding.itemId,
        finding.animation,
        requirement.layer,
        requirement.variant,
        requirement.expectedPath,
        'audit-inferred',
      );
      const existing = itemDrafts.get(key);
      const consumers = existing ? [...existing.consumers, requirement] : [requirement];
      const bodyTypes = sortedUnique([
        ...(existing?.bodyTypes ?? []),
        ...requirement.bodyTypes,
      ]);
      itemDrafts.set(key, {
        layer: requirement.layer,
        bodyTypes,
        source: sourcePathFor(
          finding.itemId,
          finding.animation,
          requirement.layer,
          requirement.variant,
        ),
        destination: {
          path: requirement.expectedPath,
          evidence: 'audit-inferred',
          accepted: false,
        },
        ...(requirement.variant ? { variant: requirement.variant } : {}),
        consumers: combineConsumers(consumers),
      });
    });
  });

  report.missingFiles.forEach((finding) => {
    finding.consumers.forEach((consumer) => {
      if (!matchesSelection(request, consumer, finding.animation)) return;
      const itemDrafts = byItem.get(consumer.itemId) ?? new Map<string, ExtendLayerDraft>();
      byItem.set(consumer.itemId, itemDrafts);
      const key = draftKey(
        consumer.itemId,
        finding.animation,
        consumer.layer,
        consumer.variant,
        finding.path,
        'audit-exact',
      );
      const existing = itemDrafts.get(key);
      const consumers = existing ? [...existing.consumers, consumer] : [consumer];
      const bodyTypes = sortedUnique([
        ...(existing?.bodyTypes ?? []),
        ...consumer.bodyTypes,
      ]);
      itemDrafts.set(key, {
        layer: consumer.layer,
        bodyTypes,
        source: sourcePathFor(
          consumer.itemId,
          finding.animation,
          consumer.layer,
          consumer.variant,
        ),
        destination: {
          path: finding.path,
          evidence: 'audit-exact',
          accepted: true,
        },
        ...(consumer.variant ? { variant: consumer.variant } : {}),
        consumers: combineConsumers(consumers),
      });
    });
  });

  report.blankFrames.forEach((finding) => {
    finding.consumers.forEach((consumer) => {
      if (!matchesSelection(request, consumer, finding.animation)) return;
      diagnostics.push({
        code: 'finding_not_scaffoldable_v1',
        message: 'Selected blank-frame findings must be resolved before scaffolding.',
        findingType: 'blankFrames',
        itemId: consumer.itemId,
        details: {
          animation: finding.animation,
          path: finding.path,
          layer: consumer.layer,
        },
      });
    });
  });

  const drafts = [...byItem.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([itemId, layers]) => {
      const firstLayer = layers.values().next().value;
      const typeName = firstLayer?.consumers[0]?.typeName;
      const byAnimation = new Map<string, ExtendLayerDraft[]>();
      [...layers.values()].forEach((layer) => {
        const animation = layer.source.split('/')[2] ?? '';
        const group = byAnimation.get(animation) ?? [];
        group.push(layer);
        byAnimation.set(animation, group);
      });
      return {
        itemId,
        typeName: typeof typeName === 'string' ? typeName : '',
        addAnimations: [...byAnimation.entries()]
          .sort(([left], [right]) => left.localeCompare(right))
          .map(([animation, layerDrafts]) => ({
            animation,
            layers: layerDrafts.sort((left, right) =>
              left.layer.localeCompare(right.layer)
              || (left.variant ?? '').localeCompare(right.variant ?? '')
              || left.destination.path.localeCompare(right.destination.path)),
          })),
      } satisfies ExtendAssetDraft;
    });

  return { drafts, diagnostics };
}

function missingDigest(
  itemId: string,
  kind: 'definition' | 'credit',
): AssetPackScaffoldDiagnostic {
  return {
    code: 'audit_report_invalid_v1',
    message: `Missing active baseline ${kind} digest for ${itemId}.`,
    itemId,
  };
}

export function scaffoldAuditAssetPack(
  request: AuditAssetPackScaffoldRequest,
  baseline: AssetPackScaffoldBaselineDigests,
): AssetPackScaffoldResult {
  if (request.itemIds.length === 0 && request.typeNames.length === 0) {
    return {
      ok: false,
      diagnostics: [{
        code: 'audit_report_invalid_v1',
        message: 'Audit scaffold requires at least one --item or --type selector.',
        path: request.reportPath,
      }],
    };
  }

  const envelope = readAuditEnvelope(request.reportPath);
  if (envelope.ok === false) return envelope;

  const report = envelope.envelope.data;
  const built = buildDrafts(request, report);
  if (built.diagnostics.length > 0) {
    return { ok: false, diagnostics: built.diagnostics };
  }
  if (built.drafts.length === 0) {
    return {
      ok: false,
      diagnostics: [{
        code: 'audit_report_invalid_v1',
        message: 'Selected findings did not match any scaffoldable work.',
        path: request.reportPath,
      }],
    };
  }

  const digestDiagnostics = built.drafts.flatMap((draft) => {
    const issues: AssetPackScaffoldDiagnostic[] = [];
    if (!baseline.definitionDigests.has(draft.itemId)) {
      issues.push(missingDigest(draft.itemId, 'definition'));
    }
    if (!baseline.creditDigests.has(draft.itemId)) {
      issues.push(missingDigest(draft.itemId, 'credit'));
    }
    return issues;
  });
  if (digestDiagnostics.length > 0) {
    return { ok: false, diagnostics: digestDiagnostics };
  }

  const packRoot = path.resolve(request.pack.outputDirectory);
  return publishPack(packRoot, (stagingRoot) => {
    const assets = built.drafts.map((draft) => ({
      kind: 'extend-item' as const,
      itemId: draft.itemId,
      baseDefinitionDigest: baseline.definitionDigests.get(draft.itemId)!,
      baseCreditDigest: baseline.creditDigests.get(draft.itemId)!,
      addAnimations: draft.addAnimations.map((animation) => ({
        animation: animation.animation,
        layers: animation.layers.map((layer) => ({
          layer: layer.layer,
          bodyTypes: [...layer.bodyTypes],
          source: layer.source,
          destination: layer.destination,
          ...(layer.variant ? { variant: layer.variant } : {}),
          consumers: layer.consumers.map((consumer) => ({
            itemId: consumer.itemId,
            typeName: consumer.typeName,
            layer: consumer.layer,
            bodyTypes: [...consumer.bodyTypes],
            ...(consumer.variant ? { variant: consumer.variant } : {}),
            recolors: [...consumer.recolors],
          })),
        })),
      })),
    }));

    writeJson(path.join(stagingRoot, 'asset-pack.json'), {
      schema: ASSET_PACK_SCHEMA,
      id: request.pack.packId,
      version: request.pack.version,
      displayName: request.pack.displayName,
      credits: request.pack.credits,
      assets,
    });

    scaffoldSourceDirectories(
      stagingRoot,
      assets.flatMap((asset) => asset.addAnimations.flatMap((animation) =>
        animation.layers.map((layer) => layer.source))),
    );
  });
}
