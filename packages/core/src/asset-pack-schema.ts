import type { AnimationAuditConsumer } from './asset-animation-audit.js';
import { extensionDestinationBasePath } from './asset-pack-paths.js';
import { BODY_TYPES, LICENSE_GROUP_OF } from './constants.js';
import type {
  AnimationName,
  BodyType,
  ItemId,
  License,
  RawRecolors,
  TypeName,
} from './types.js';

export const ASSET_PACK_SCHEMA = 'lpc-toolkit.asset-pack.v1' as const;

export type AssetPackDiagnosticCode =
  | 'asset_pack_schema_invalid'
  | 'asset_pack_id_invalid'
  | 'asset_source_missing'
  | 'asset_png_decode_failed'
  | 'asset_geometry_mismatch'
  | 'asset_required_frame_blank'
  | 'asset_credit_missing'
  | 'asset_license_invalid'
  | 'asset_base_definition_changed'
  | 'asset_base_credit_changed'
  | 'asset_destination_unaccepted'
  | 'asset_path_conflict'
  | 'asset_replacement_unauthorized'
  | 'asset_output_root_unowned'
  | 'asset_digest_mismatch'
  | 'asset_publish_failed'
  | 'asset_path_inferred'
  | 'asset_optional_frame_blank'
  | 'asset_partial_body_coverage'
  | 'asset_partial_animation_coverage';

export interface AssetPackCreditSource {
  readonly authors: readonly string[];
  readonly licenses: readonly License[];
  readonly urls: readonly string[];
  readonly notes: string;
}

export interface AssetPackAcknowledgement {
  readonly code: AssetPackDiagnosticCode;
  readonly subject: Readonly<Record<string, string | readonly string[]>>;
  readonly contentDigest: string;
  readonly reason: string;
}

export interface AssetPackReplacementSource {
  readonly packId: string;
  readonly versions: string;
  readonly assets: readonly string[];
}

export interface AssetPackCompatibilitySource {
  readonly minimumCliVersion?: string;
  readonly requiredCapabilities?: readonly string[];
}

export interface NewItemSpriteSource {
  readonly animation: AnimationName;
  readonly source: string;
  readonly bodyTypes?: readonly BodyType[];
  readonly variant?: string;
}

export interface NewItemLayerSource {
  readonly id: string;
  readonly zPos: number;
  readonly bodyTypes?: readonly BodyType[];
  readonly sprites: readonly NewItemSpriteSource[];
}

export interface NewItemAssetSource {
  readonly kind: 'new-item';
  readonly localId: string;
  readonly displayName: string;
  readonly typeName: TypeName;
  readonly bodyTypes: readonly BodyType[];
  readonly animations: readonly AnimationName[];
  readonly layers: readonly NewItemLayerSource[];
  readonly variants?: readonly string[];
  readonly recolor?: RawRecolors;
}

export interface ExtendItemDestinationSource {
  readonly path: string;
  readonly evidence:
    | 'audit-exact'
    | 'audit-inferred'
    | 'artist-specified'
    | 'manual-review';
  readonly accepted: boolean;
}

export interface ExtendItemLayerSource {
  readonly layer: `layer_${number}`;
  readonly bodyTypes: readonly BodyType[];
  readonly source: string;
  readonly destination: ExtendItemDestinationSource;
  readonly variant?: string;
  readonly consumers?: readonly AnimationAuditConsumer[];
}

export interface ExtendItemAnimationSource {
  readonly animation: AnimationName;
  readonly layers: readonly ExtendItemLayerSource[];
}

export interface ExtendItemAssetSource {
  readonly kind: 'extend-item';
  readonly itemId: ItemId;
  readonly baseDefinitionDigest: string;
  readonly baseCreditDigest: string;
  readonly addAnimations: readonly ExtendItemAnimationSource[];
}

export type AssetPackStatus = 'draft';

export type AssetPackAssetSource = NewItemAssetSource | ExtendItemAssetSource;

export interface AssetPackSource {
  readonly schema: typeof ASSET_PACK_SCHEMA;
  readonly status?: AssetPackStatus;
  readonly id: string;
  readonly version: string;
  readonly displayName: string;
  readonly credits: AssetPackCreditSource;
  readonly creditOverrides?: Readonly<Record<string, AssetPackCreditSource>>;
  readonly replaces?: readonly AssetPackReplacementSource[];
  readonly acknowledgements?: readonly AssetPackAcknowledgement[];
  readonly compatibility?: AssetPackCompatibilitySource;
  readonly assets: readonly AssetPackAssetSource[];
}

export interface AssetPackDiagnostic {
  readonly code: AssetPackDiagnosticCode;
  readonly severity: 'error' | 'warning';
  readonly message: string;
  readonly packId?: string;
  readonly assetId?: string;
  readonly sourcePath?: string;
  readonly destinationPath?: string;
  readonly subject?: Readonly<Record<string, string | readonly string[]>>;
  readonly details?: Readonly<Record<string, unknown>>;
}

export type AssetPackParseResult =
  | { readonly ok: true; readonly source: AssetPackSource }
  | { readonly ok: false; readonly diagnostics: readonly AssetPackDiagnostic[] };

type UnknownRecord = Readonly<Record<string, unknown>>;

const DIAGNOSTIC_CODES = new Set<AssetPackDiagnosticCode>([
  'asset_pack_schema_invalid',
  'asset_pack_id_invalid',
  'asset_source_missing',
  'asset_png_decode_failed',
  'asset_geometry_mismatch',
  'asset_required_frame_blank',
  'asset_credit_missing',
  'asset_license_invalid',
  'asset_base_definition_changed',
  'asset_base_credit_changed',
  'asset_destination_unaccepted',
  'asset_path_conflict',
  'asset_replacement_unauthorized',
  'asset_output_root_unowned',
  'asset_digest_mismatch',
  'asset_publish_failed',
  'asset_path_inferred',
  'asset_optional_frame_blank',
  'asset_partial_body_coverage',
  'asset_partial_animation_coverage',
]);

const LICENSES = new Set<License>(Object.keys(LICENSE_GROUP_OF) as License[]);
const BODY_TYPE_SET = new Set<BodyType>(BODY_TYPES);
const PACK_ID_PATTERN = /^[a-z0-9]+(?:[.-][a-z0-9]+)*$/;
const LOCAL_ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const REPLACEMENT_ASSET_KEY_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_.-]*$/;
const SEMVER_PATTERN =
  /^\d+\.\d+\.\d+(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/;
const SHA256_PATTERN = /^sha256:[0-9a-f]{64}$/;
const SOURCE_LAYER_ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const EXTEND_LAYER_PATTERN = /^layer_[1-9]\d*$/;
const RECOLOR_KEY_PATTERN = /^color_\d+$/;
const REPLACEMENT_VERSION_TOKEN_PATTERN = new RegExp(
  `^(?:<=|>=|=|<|>)${SEMVER_PATTERN.source.slice(1, -1)}$`,
);

export function parseAssetPackSource(input: unknown): AssetPackParseResult {
  const diagnostics: AssetPackDiagnostic[] = [];
  const source = parsePackRecord(input, '$', diagnostics);
  return source && diagnostics.length === 0
    ? { ok: true, source }
    : { ok: false, diagnostics: sortDiagnostics(diagnostics) };
}

function parsePackRecord(
  input: unknown,
  path: string,
  diagnostics: AssetPackDiagnostic[],
): AssetPackSource | undefined {
  const record = asRecord(input, path, diagnostics);
  if (!record) return undefined;

  exactKeys(record, path, [
    'schema',
    'status',
    'id',
    'version',
    'displayName',
    'credits',
    'creditOverrides',
    'replaces',
    'acknowledgements',
    'compatibility',
    'assets',
  ], diagnostics);

  const schema = readString(record, 'schema', `${path}.schema`, diagnostics);
  const rawStatus = record.status;
  let status: AssetPackStatus | undefined;
  if (rawStatus !== undefined) {
    if (rawStatus === 'draft') {
      status = 'draft';
    } else {
      pushDiagnostic(diagnostics, {
        code: 'asset_pack_schema_invalid',
        severity: 'error',
        message: `Invalid asset-pack status at ${path}.status.`,
        details: { path: `${path}.status`, value: rawStatus },
      });
    }
  }

  const id = readString(record, 'id', `${path}.id`, diagnostics);
  const version = readString(record, 'version', `${path}.version`, diagnostics);
  const displayName = readString(
    record,
    'displayName',
    `${path}.displayName`,
    diagnostics,
  );

  if (schema !== ASSET_PACK_SCHEMA) {
    pushDiagnostic(diagnostics, {
      code: 'asset_pack_schema_invalid',
      severity: 'error',
      message: `Unsupported asset-pack schema at ${path}.schema.`,
      details: { path: `${path}.schema`, value: schema },
    });
  }

  if (id && !PACK_ID_PATTERN.test(id)) {
    pushDiagnostic(diagnostics, {
      code: 'asset_pack_id_invalid',
      severity: 'error',
      message: `Invalid pack id at ${path}.id.`,
      ...(id ? { packId: id } : {}),
      details: { path: `${path}.id`, value: id },
    });
  }

  if (version && !SEMVER_PATTERN.test(version)) {
    pushDiagnostic(diagnostics, {
      code: 'asset_pack_schema_invalid',
      severity: 'error',
      message: `Invalid semantic version at ${path}.version.`,
      ...(id ? { packId: id } : {}),
      details: { path: `${path}.version`, value: version },
    });
  }

  const credits = parseCreditSource(record.credits, `${path}.credits`, diagnostics);
  const creditOverrides = parseCreditOverrideRecord(
    record.creditOverrides,
    `${path}.creditOverrides`,
    diagnostics,
  );
  const replacements = parseReplacementList(
    record.replaces,
    `${path}.replaces`,
    diagnostics,
  );
  const acknowledgements = parseAcknowledgements(
    record.acknowledgements,
    `${path}.acknowledgements`,
    diagnostics,
  );
  const compatibility = parseCompatibility(
    record.compatibility,
    `${path}.compatibility`,
    diagnostics,
  );
  const assets = parseAssets(record.assets, `${path}.assets`, diagnostics);

  if (!schema || !id || !version || !displayName || !credits || !assets) {
    return undefined;
  }

  return {
    schema: ASSET_PACK_SCHEMA,
    ...(status ? { status } : {}),
    id,
    version,
    displayName,
    credits,
    ...(creditOverrides ? { creditOverrides } : {}),
    ...(replacements ? { replaces: replacements } : {}),
    ...(acknowledgements ? { acknowledgements } : {}),
    ...(compatibility ? { compatibility } : {}),
    assets,
  };
}


function parseCompatibility(
  input: unknown,
  path: string,
  diagnostics: AssetPackDiagnostic[],
): AssetPackCompatibilitySource | undefined {
  if (input === undefined) return undefined;
  const record = asRecord(input, path, diagnostics);
  if (!record) return undefined;
  exactKeys(record, path, ['minimumCliVersion', 'requiredCapabilities'], diagnostics);

  const minimumCliVersion = readOptionalString(
    record,
    'minimumCliVersion',
    `${path}.minimumCliVersion`,
    diagnostics,
  );
  const requiredCapabilities = parseOptionalStringArray(
    record.requiredCapabilities,
    `${path}.requiredCapabilities`,
    diagnostics,
  );
  const rawMinimumCliVersion = record.minimumCliVersion;
  const validMinimumCliVersion = rawMinimumCliVersion === undefined
    || (typeof rawMinimumCliVersion === 'string' && SEMVER_PATTERN.test(rawMinimumCliVersion));
  if (!validMinimumCliVersion && typeof rawMinimumCliVersion === 'string') {
    pushDiagnostic(diagnostics, {
      code: 'asset_pack_schema_invalid',
      severity: 'error',
      message: `Invalid minimum CLI semantic version at ${path}.minimumCliVersion.`,
      details: { path: `${path}.minimumCliVersion`, value: rawMinimumCliVersion },
    });
  }

  const validCapabilities = requiredCapabilities?.every((capability, index) => {
    const valid = capability.trim().length > 0 && requiredCapabilities.indexOf(capability) === index;
    if (!valid) {
      pushDiagnostic(diagnostics, {
        code: 'asset_pack_schema_invalid',
        severity: 'error',
        message: `Compatibility capabilities at ${path}.requiredCapabilities must be unique and non-empty.`,
        details: { path: `${path}.requiredCapabilities[${index}]`, value: capability },
      });
    }
    return valid;
  }) ?? true;

  if (!validMinimumCliVersion || !validCapabilities) return undefined;
  if (!minimumCliVersion && (!requiredCapabilities || requiredCapabilities.length === 0)) {
    return undefined;
  }
  return {
    ...(minimumCliVersion ? { minimumCliVersion } : {}),
    ...(requiredCapabilities && requiredCapabilities.length > 0 ? { requiredCapabilities } : {}),
  };
}

function parseAssets(
  input: unknown,
  path: string,
  diagnostics: AssetPackDiagnostic[],
): readonly AssetPackAssetSource[] | undefined {
  if (input === undefined) {
    pushDiagnostic(diagnostics, {
      code: 'asset_pack_schema_invalid',
      severity: 'error',
      message: `Missing assets array at ${path}.`,
      details: { path },
    });
    return undefined;
  }

  if (!Array.isArray(input)) {
    pushDiagnostic(diagnostics, {
      code: 'asset_pack_schema_invalid',
      severity: 'error',
      message: `Expected an array at ${path}.`,
      details: { path, value: input },
    });
    return undefined;
  }

  const assets: AssetPackAssetSource[] = [];
  const seenLocalIds = new Set<string>();

  input.forEach((entry, index) => {
    const entryPath = `${path}[${index}]`;
    const record = asRecord(entry, entryPath, diagnostics);
    if (!record) return;

    const kind = readString(record, 'kind', `${entryPath}.kind`, diagnostics);
    if (kind === 'new-item') {
      const parsed = parseNewItemAsset(record, entryPath, diagnostics);
      if (!parsed) return;
      if (seenLocalIds.has(parsed.localId)) {
        pushDiagnostic(diagnostics, {
          code: 'asset_pack_id_invalid',
          severity: 'error',
          message: `Duplicate local asset id "${parsed.localId}" at ${entryPath}.localId.`,
          assetId: parsed.localId,
          details: { path: `${entryPath}.localId`, value: parsed.localId },
        });
      } else {
        seenLocalIds.add(parsed.localId);
      }
      assets.push(parsed);
      return;
    }

    if (kind === 'extend-item') {
      const parsed = parseExtendItemAsset(record, entryPath, diagnostics);
      if (parsed) assets.push(parsed);
      return;
    }

    pushDiagnostic(diagnostics, {
      code: 'asset_pack_schema_invalid',
      severity: 'error',
      message: `Unknown asset kind at ${entryPath}.kind.`,
      details: { path: `${entryPath}.kind`, value: kind },
    });
  });

  return assets;
}

function parseNewItemAsset(
  record: UnknownRecord,
  path: string,
  diagnostics: AssetPackDiagnostic[],
): NewItemAssetSource | undefined {
  exactKeys(record, path, [
    'kind',
    'localId',
    'displayName',
    'typeName',
    'bodyTypes',
    'animations',
    'layers',
    'variants',
    'recolor',
  ], diagnostics);

  const localId = readString(record, 'localId', `${path}.localId`, diagnostics);
  const displayName = readString(
    record,
    'displayName',
    `${path}.displayName`,
    diagnostics,
  );
  const typeName = readString(record, 'typeName', `${path}.typeName`, diagnostics);
  const bodyTypes = parseBodyTypes(
    record.bodyTypes,
    `${path}.bodyTypes`,
    diagnostics,
  );
  const animations = parseStringArray(
    record.animations,
    `${path}.animations`,
    diagnostics,
  );
  const layers = parseNewItemLayers(
    record.layers,
    `${path}.layers`,
    bodyTypes,
    diagnostics,
  );
  const variants = parseOptionalStringArray(
    record.variants,
    `${path}.variants`,
    diagnostics,
  );
  const recolor = parseOptionalRawRecolors(
    record.recolor,
    `${path}.recolor`,
    diagnostics,
  );

  if (localId && !LOCAL_ID_PATTERN.test(localId)) {
    pushDiagnostic(diagnostics, {
      code: 'asset_pack_id_invalid',
      severity: 'error',
      message: `Invalid local asset id at ${path}.localId.`,
      assetId: localId,
      details: { path: `${path}.localId`, value: localId },
    });
  }

  if (!localId || !displayName || !typeName || !bodyTypes || !animations || !layers) {
    return undefined;
  }

  return {
    kind: 'new-item',
    localId,
    displayName,
    typeName,
    bodyTypes,
    animations,
    layers,
    ...(variants ? { variants } : {}),
    ...(recolor ? { recolor } : {}),
  };
}

function parseExtendItemAsset(
  record: UnknownRecord,
  path: string,
  diagnostics: AssetPackDiagnostic[],
): ExtendItemAssetSource | undefined {
  exactKeys(record, path, [
    'kind',
    'itemId',
    'baseDefinitionDigest',
    'baseCreditDigest',
    'addAnimations',
  ], diagnostics);

  const itemId = readString(record, 'itemId', `${path}.itemId`, diagnostics);
  const baseDefinitionDigest = readString(
    record,
    'baseDefinitionDigest',
    `${path}.baseDefinitionDigest`,
    diagnostics,
  );
  const baseCreditDigest = readString(
    record,
    'baseCreditDigest',
    `${path}.baseCreditDigest`,
    diagnostics,
  );
  const addAnimations = parseExtendAnimations(
    record.addAnimations,
    `${path}.addAnimations`,
    diagnostics,
  );

  if (baseDefinitionDigest && !SHA256_PATTERN.test(baseDefinitionDigest)) {
    pushDiagnostic(diagnostics, {
      code: 'asset_pack_schema_invalid',
      severity: 'error',
      message: `Invalid SHA-256 digest at ${path}.baseDefinitionDigest.`,
      details: { path: `${path}.baseDefinitionDigest`, value: baseDefinitionDigest },
    });
  }

  if (baseCreditDigest && !SHA256_PATTERN.test(baseCreditDigest)) {
    pushDiagnostic(diagnostics, {
      code: 'asset_pack_schema_invalid',
      severity: 'error',
      message: `Invalid SHA-256 digest at ${path}.baseCreditDigest.`,
      details: { path: `${path}.baseCreditDigest`, value: baseCreditDigest },
    });
  }

  if (!itemId || !baseDefinitionDigest || !baseCreditDigest || !addAnimations) {
    return undefined;
  }

  return {
    kind: 'extend-item',
    itemId,
    baseDefinitionDigest,
    baseCreditDigest,
    addAnimations,
  };
}

function parseNewItemLayers(
  input: unknown,
  path: string,
  parentBodyTypes: readonly BodyType[] | undefined,
  diagnostics: AssetPackDiagnostic[],
): readonly NewItemLayerSource[] | undefined {
  const layers = asArray(input, path, diagnostics);
  if (!layers) return undefined;

  const parsed: NewItemLayerSource[] = [];
  const seenIds = new Set<string>();

  layers.forEach((entry, index) => {
    const entryPath = `${path}[${index}]`;
    const record = asRecord(entry, entryPath, diagnostics);
    if (!record) return;

    exactKeys(record, entryPath, ['id', 'zPos', 'bodyTypes', 'sprites'], diagnostics);

    const id = readString(record, 'id', `${entryPath}.id`, diagnostics);
    const zPos = readInteger(record, 'zPos', `${entryPath}.zPos`, diagnostics);
    const bodyTypes = parseOptionalBodyTypes(
      record.bodyTypes,
      `${entryPath}.bodyTypes`,
      diagnostics,
    );
    const effectiveBodyTypes = bodyTypes ?? parentBodyTypes;
    const sprites = parseNewItemSprites(
      record.sprites,
      `${entryPath}.sprites`,
      effectiveBodyTypes,
      diagnostics,
    );

    if (id && !SOURCE_LAYER_ID_PATTERN.test(id)) {
      pushDiagnostic(diagnostics, {
        code: 'asset_pack_schema_invalid',
        severity: 'error',
        message: `Invalid semantic layer id at ${entryPath}.id.`,
        details: { path: `${entryPath}.id`, value: id },
      });
    }

    if (id && seenIds.has(id)) {
      pushDiagnostic(diagnostics, {
        code: 'asset_pack_schema_invalid',
        severity: 'error',
        message: `Duplicate semantic layer id "${id}" at ${entryPath}.id.`,
        details: { path: `${entryPath}.id`, value: id },
      });
    } else if (id) {
      seenIds.add(id);
    }

    if (bodyTypes && parentBodyTypes && !isSubset(bodyTypes, parentBodyTypes)) {
      pushDiagnostic(diagnostics, {
        code: 'asset_pack_schema_invalid',
        severity: 'error',
        message: `Layer body types at ${entryPath}.bodyTypes broaden their parent asset coverage.`,
        details: {
          path: `${entryPath}.bodyTypes`,
          parentBodyTypes,
          childBodyTypes: bodyTypes,
        },
      });
    }

    if (!id || zPos === undefined || !sprites) return;
    parsed.push({
      id,
      zPos,
      ...(bodyTypes ? { bodyTypes } : {}),
      sprites,
    });
  });

  return parsed;
}

function parseNewItemSprites(
  input: unknown,
  path: string,
  parentBodyTypes: readonly BodyType[] | undefined,
  diagnostics: AssetPackDiagnostic[],
): readonly NewItemSpriteSource[] | undefined {
  const sprites = asArray(input, path, diagnostics);
  if (!sprites) return undefined;

  const parsed: NewItemSpriteSource[] = [];
  sprites.forEach((entry, index) => {
    const entryPath = `${path}[${index}]`;
    const record = asRecord(entry, entryPath, diagnostics);
    if (!record) return;

    exactKeys(record, entryPath, ['animation', 'source', 'bodyTypes', 'variant'], diagnostics);

    const animation = readString(record, 'animation', `${entryPath}.animation`, diagnostics);
    const source = readSourcePath(record, 'source', `${entryPath}.source`, diagnostics);
    const bodyTypes = parseOptionalBodyTypes(
      record.bodyTypes,
      `${entryPath}.bodyTypes`,
      diagnostics,
    );
    const variant = readOptionalString(
      record,
      'variant',
      `${entryPath}.variant`,
      diagnostics,
    );

    if (bodyTypes && parentBodyTypes && !isSubset(bodyTypes, parentBodyTypes)) {
      pushDiagnostic(diagnostics, {
        code: 'asset_pack_schema_invalid',
        severity: 'error',
        message: `Sprite body types at ${entryPath}.bodyTypes broaden their parent coverage.`,
        details: {
          path: `${entryPath}.bodyTypes`,
          parentBodyTypes,
          childBodyTypes: bodyTypes,
        },
      });
    }

    if (!animation || !source) return;
    parsed.push({
      animation,
      source,
      ...(bodyTypes ? { bodyTypes } : {}),
      ...(variant ? { variant } : {}),
    });
  });

  return parsed;
}

function parseExtendAnimations(
  input: unknown,
  path: string,
  diagnostics: AssetPackDiagnostic[],
): readonly ExtendItemAnimationSource[] | undefined {
  const animations = asArray(input, path, diagnostics);
  if (!animations) return undefined;

  const parsed: ExtendItemAnimationSource[] = [];
  animations.forEach((entry, index) => {
    const entryPath = `${path}[${index}]`;
    const record = asRecord(entry, entryPath, diagnostics);
    if (!record) return;

    exactKeys(record, entryPath, ['animation', 'layers'], diagnostics);
    const animation = readString(record, 'animation', `${entryPath}.animation`, diagnostics);
    const layers = parseExtendLayers(
      record.layers,
      `${entryPath}.layers`,
      animation,
      diagnostics,
    );
    if (!animation || !layers) return;
    parsed.push({ animation, layers });
  });

  return parsed;
}

function parseExtendLayers(
  input: unknown,
  path: string,
  animation: string | undefined,
  diagnostics: AssetPackDiagnostic[],
): readonly ExtendItemLayerSource[] | undefined {
  const layers = asArray(input, path, diagnostics);
  if (!layers) return undefined;

  const parsed: ExtendItemLayerSource[] = [];
  layers.forEach((entry, index) => {
    const entryPath = `${path}[${index}]`;
    const record = asRecord(entry, entryPath, diagnostics);
    if (!record) return;

    exactKeys(record, entryPath, [
      'layer',
      'bodyTypes',
      'source',
      'destination',
      'variant',
      'consumers',
    ], diagnostics);

    const layer = readString(record, 'layer', `${entryPath}.layer`, diagnostics);
    const bodyTypes = parseBodyTypes(
      record.bodyTypes,
      `${entryPath}.bodyTypes`,
      diagnostics,
    );
    const source = readSourcePath(record, 'source', `${entryPath}.source`, diagnostics);
    const destination = parseDestination(
      record.destination,
      `${entryPath}.destination`,
      diagnostics,
    );
    const variant = readOptionalString(
      record,
      'variant',
      `${entryPath}.variant`,
      diagnostics,
    );
    const consumers = parseOptionalConsumers(
      record.consumers,
      `${entryPath}.consumers`,
      diagnostics,
    );

    if (
      animation
      && destination
      && extensionDestinationBasePath(destination.path, animation, variant) === undefined
    ) {
      pushDiagnostic(diagnostics, {
        code: 'asset_pack_schema_invalid',
        severity: 'error',
        message: `Extension destination does not match animation "${animation}" at ${entryPath}.destination.path.`,
        destinationPath: destination.path,
        details: { path: `${entryPath}.destination.path`, value: destination.path },
      });
    }

    if (layer && !EXTEND_LAYER_PATTERN.test(layer)) {
      pushDiagnostic(diagnostics, {
        code: 'asset_pack_schema_invalid',
        severity: 'error',
        message: `Invalid extension layer name at ${entryPath}.layer.`,
        details: { path: `${entryPath}.layer`, value: layer },
      });
    }

    if (!layer || !bodyTypes || !source || !destination) return;
    parsed.push({
      layer: layer as `layer_${number}`,
      bodyTypes,
      source,
      destination,
      ...(variant ? { variant } : {}),
      ...(consumers ? { consumers } : {}),
    });
  });

  return parsed;
}

function parseDestination(
  input: unknown,
  path: string,
  diagnostics: AssetPackDiagnostic[],
): ExtendItemDestinationSource | undefined {
  const record = asRecord(input, path, diagnostics);
  if (!record) return undefined;

  exactKeys(record, path, ['path', 'evidence', 'accepted'], diagnostics);

  const destinationPath = readManagedPath(record, 'path', path, 'spritesheets/', diagnostics);
  const evidence = readString(record, 'evidence', `${path}.evidence`, diagnostics);
  const accepted = readBoolean(record, 'accepted', `${path}.accepted`, diagnostics);
  const normalizedEvidence = normalizeDestinationEvidence(evidence);

  if (
    evidence
    && !normalizedEvidence
  ) {
    pushDiagnostic(diagnostics, {
      code: 'asset_pack_schema_invalid',
      severity: 'error',
      message: `Invalid destination evidence at ${path}.evidence.`,
      details: { path: `${path}.evidence`, value: evidence },
    });
  }

  if (normalizedEvidence === 'manual-review' && accepted === true) {
    pushDiagnostic(diagnostics, {
      code: 'asset_pack_schema_invalid',
      severity: 'error',
      message: `Manual-review destinations at ${path} cannot be accepted directly.`,
      details: { path, value: { evidence, accepted } },
    });
  }

  if (!destinationPath || !normalizedEvidence || accepted === undefined) return undefined;
  return {
    path: destinationPath,
    evidence: normalizedEvidence,
    accepted,
  };
}

function parseOptionalConsumers(
  input: unknown,
  path: string,
  diagnostics: AssetPackDiagnostic[],
): readonly AnimationAuditConsumer[] | undefined {
  if (input === undefined) return undefined;
  const entries = asArray(input, path, diagnostics);
  if (!entries) return undefined;

  const consumers: AnimationAuditConsumer[] = [];
  entries.forEach((entry, index) => {
    const entryPath = `${path}[${index}]`;
    const record = asRecord(entry, entryPath, diagnostics);
    if (!record) return;

    exactKeys(record, entryPath, [
      'itemId',
      'typeName',
      'layer',
      'bodyTypes',
      'variant',
      'recolors',
    ], diagnostics);

    const itemId = readString(record, 'itemId', `${entryPath}.itemId`, diagnostics);
    const typeName = readString(record, 'typeName', `${entryPath}.typeName`, diagnostics);
    const layer = readString(record, 'layer', `${entryPath}.layer`, diagnostics);
    const bodyTypes = parseBodyTypes(
      record.bodyTypes,
      `${entryPath}.bodyTypes`,
      diagnostics,
    );
    const variant = readOptionalString(
      record,
      'variant',
      `${entryPath}.variant`,
      diagnostics,
    );
    const recolors = parseStringArray(
      record.recolors,
      `${entryPath}.recolors`,
      diagnostics,
    );

    if (layer && !EXTEND_LAYER_PATTERN.test(layer)) {
      pushDiagnostic(diagnostics, {
        code: 'asset_pack_schema_invalid',
        severity: 'error',
        message: `Invalid consumer layer name at ${entryPath}.layer.`,
        details: { path: `${entryPath}.layer`, value: layer },
      });
    }

    if (!itemId || !typeName || !layer || !bodyTypes || !recolors) return;
    consumers.push({
      itemId,
      typeName,
      layer: layer as `layer_${number}`,
      bodyTypes,
      ...(variant ? { variant } : {}),
      recolors,
    });
  });

  return consumers;
}

function parseCreditOverrideRecord(
  input: unknown,
  path: string,
  diagnostics: AssetPackDiagnostic[],
): Readonly<Record<string, AssetPackCreditSource>> | undefined {
  if (input === undefined) return undefined;
  const record = asRecord(input, path, diagnostics);
  if (!record) return undefined;

  const entries = Object.entries(record);
  const parsedEntries = new Map<string, AssetPackCreditSource>();
  const overrides: Record<string, AssetPackCreditSource> = {};
  for (const [key, value] of sortedRecordEntries(record, path)) {
    if (!isManagedPath(key, 'sprites/')) {
      pushDiagnostic(diagnostics, {
        code: 'asset_pack_schema_invalid',
        severity: 'error',
        message: `Invalid credit override path at ${path}.${key}.`,
        sourcePath: key,
        details: { path: `${path}.${key}`, value: key },
      });
      continue;
    }

    const parsed = parseCreditSource(value, `${path}.${key}`, diagnostics);
    if (parsed) parsedEntries.set(key, parsed);
  }

  for (const [key] of entries) {
    const parsed = parsedEntries.get(key);
    if (parsed) overrides[key] = parsed;
  }

  return overrides;
}

function parseReplacementList(
  input: unknown,
  path: string,
  diagnostics: AssetPackDiagnostic[],
): readonly AssetPackReplacementSource[] | undefined {
  if (input === undefined) return undefined;
  const entries = asArray(input, path, diagnostics);
  if (!entries) return undefined;

  const replacements: AssetPackReplacementSource[] = [];
  entries.forEach((entry, index) => {
    const entryPath = `${path}[${index}]`;
    const record = asRecord(entry, entryPath, diagnostics);
    if (!record) return;

    exactKeys(record, entryPath, ['packId', 'versions', 'assets'], diagnostics);
    const packId = readString(record, 'packId', `${entryPath}.packId`, diagnostics);
    const versions = readString(record, 'versions', `${entryPath}.versions`, diagnostics);
    const assets = parseStringArray(record.assets, `${entryPath}.assets`, diagnostics);

    if (packId && !PACK_ID_PATTERN.test(packId)) {
      pushDiagnostic(diagnostics, {
        code: 'asset_pack_id_invalid',
        severity: 'error',
        message: `Invalid replacement pack id at ${entryPath}.packId.`,
        packId,
        details: { path: `${entryPath}.packId`, value: packId },
      });
    }

    if (assets) {
      assets.forEach((assetId, assetIndex) => {
        if (!REPLACEMENT_ASSET_KEY_PATTERN.test(assetId)) {
          pushDiagnostic(diagnostics, {
            code: 'asset_pack_id_invalid',
            severity: 'error',
            message: `Invalid replacement asset key at ${entryPath}.assets[${assetIndex}].`,
            assetId,
            details: { path: `${entryPath}.assets[${assetIndex}]`, value: assetId },
          });
        }
      });
    }

    const validVersions = versions ? isValidReplacementVersionRange(versions) : false;
    if (versions && !validVersions) {
      pushDiagnostic(diagnostics, {
        code: 'asset_pack_schema_invalid',
        severity: 'error',
        message: `Invalid replacement version range at ${entryPath}.versions.`,
        details: { path: `${entryPath}.versions`, value: versions },
      });
    }

    if (!packId || !versions || !assets) return;
    if (!validVersions) return;
    replacements.push({ packId, versions, assets });
  });

  return replacements;
}

function isValidReplacementVersionRange(versions: string): boolean {
  const tokens = versions.trim().split(/\s+/).filter((token) => token.length > 0);
  return tokens.length > 0 && tokens.every((token) => REPLACEMENT_VERSION_TOKEN_PATTERN.test(token));
}

function parseAcknowledgements(
  input: unknown,
  path: string,
  diagnostics: AssetPackDiagnostic[],
): readonly AssetPackAcknowledgement[] | undefined {
  if (input === undefined) return undefined;
  const entries = asArray(input, path, diagnostics);
  if (!entries) return undefined;

  const acknowledgements: AssetPackAcknowledgement[] = [];
  entries.forEach((entry, index) => {
    const entryPath = `${path}[${index}]`;
    const record = asRecord(entry, entryPath, diagnostics);
    if (!record) return;

    exactKeys(record, entryPath, ['code', 'subject', 'contentDigest', 'reason'], diagnostics);
    const code = readString(record, 'code', `${entryPath}.code`, diagnostics);
    const subject = parseSubject(record.subject, `${entryPath}.subject`, diagnostics);
    const contentDigest = readString(
      record,
      'contentDigest',
      `${entryPath}.contentDigest`,
      diagnostics,
    );
    const reason = readString(record, 'reason', `${entryPath}.reason`, diagnostics);

    if (code && !DIAGNOSTIC_CODES.has(code as AssetPackDiagnosticCode)) {
      pushDiagnostic(diagnostics, {
        code: 'asset_pack_schema_invalid',
        severity: 'error',
        message: `Invalid diagnostic code at ${entryPath}.code.`,
        details: { path: `${entryPath}.code`, value: code },
      });
    }

    if (contentDigest && !SHA256_PATTERN.test(contentDigest)) {
      pushDiagnostic(diagnostics, {
        code: 'asset_pack_schema_invalid',
        severity: 'error',
        message: `Invalid acknowledgement digest at ${entryPath}.contentDigest.`,
        details: { path: `${entryPath}.contentDigest`, value: contentDigest },
      });
    }

    if (reason !== undefined && reason.trim().length === 0) {
      pushDiagnostic(diagnostics, {
        code: 'asset_pack_schema_invalid',
        severity: 'error',
        message: `Acknowledgement reason at ${entryPath}.reason must be non-empty.`,
        details: { path: `${entryPath}.reason`, value: reason },
      });
    }

    if (!code || !subject || !contentDigest || !reason) return;
    acknowledgements.push({
      code: code as AssetPackDiagnosticCode,
      subject,
      contentDigest,
      reason,
    });
  });

  return acknowledgements;
}

function parseSubject(
  input: unknown,
  path: string,
  diagnostics: AssetPackDiagnostic[],
): Readonly<Record<string, string | readonly string[]>> | undefined {
  const record = asRecord(input, path, diagnostics);
  if (!record) return undefined;

  const entries = Object.entries(record);
  const parsedEntries = new Map<string, string | readonly string[]>();
  const subject: Record<string, string | readonly string[]> = {};
  for (const [key, value] of sortedRecordEntries(record, path)) {
    if (typeof value === 'string') {
      parsedEntries.set(key, value);
      continue;
    }
    if (Array.isArray(value) && value.every((entry) => typeof entry === 'string')) {
      parsedEntries.set(key, [...value]);
      continue;
    }
    pushDiagnostic(diagnostics, {
      code: 'asset_pack_schema_invalid',
      severity: 'error',
      message: `Invalid acknowledgement subject field at ${path}.${key}.`,
      details: { path: `${path}.${key}`, value },
    });
  }

  for (const [key] of entries) {
    const value = parsedEntries.get(key);
    if (value) subject[key] = value;
  }

  return subject;
}

function parseCreditSource(
  input: unknown,
  path: string,
  diagnostics: AssetPackDiagnostic[],
): AssetPackCreditSource | undefined {
  const record = asRecord(input, path, diagnostics, 'asset_credit_missing');
  if (!record) return undefined;

  exactKeys(record, path, ['authors', 'licenses', 'urls', 'notes'], diagnostics);

  const authors = parseStringArray(record.authors, `${path}.authors`, diagnostics, 'asset_credit_missing');
  const licenses = parseLicenseArray(
    record.licenses,
    `${path}.licenses`,
    diagnostics,
  );
  const urls = parseStringArray(record.urls, `${path}.urls`, diagnostics, 'asset_credit_missing');
  const notes = readString(record, 'notes', `${path}.notes`, diagnostics, 'asset_credit_missing');
  const rawAuthors = Array.isArray(record.authors) ? record.authors : undefined;
  const rawLicenses = Array.isArray(record.licenses) ? record.licenses : undefined;
  const rawUrls = Array.isArray(record.urls) ? record.urls : undefined;

  if (rawAuthors && rawAuthors.length === 0) {
    pushDiagnostic(diagnostics, {
      code: 'asset_credit_missing',
      severity: 'error',
      message: `Credit authors at ${path}.authors must be non-empty.`,
      details: { path: `${path}.authors` },
    });
  }

  if (rawLicenses && rawLicenses.length === 0) {
    pushDiagnostic(diagnostics, {
      code: 'asset_credit_missing',
      severity: 'error',
      message: `Credit licenses at ${path}.licenses must be non-empty.`,
      details: { path: `${path}.licenses` },
    });
  }

  if (rawUrls && notes !== undefined && rawUrls.length === 0 && notes.trim().length === 0) {
    pushDiagnostic(diagnostics, {
      code: 'asset_credit_missing',
      severity: 'error',
      message: `Credit notes at ${path}.notes are required when urls are empty.`,
      details: { path: `${path}.notes` },
    });
  }

  if (!authors || !licenses || !urls || notes === undefined) return undefined;
  return { authors, licenses, urls, notes };
}

function parseLicenseArray(
  input: unknown,
  path: string,
  diagnostics: AssetPackDiagnostic[],
): readonly License[] | undefined {
  const values = parseStringArray(input, path, diagnostics, 'asset_credit_missing');
  if (!values) return undefined;

  const licenses: License[] = [];
  values.forEach((value, index) => {
    if (!LICENSES.has(value as License)) {
      pushDiagnostic(diagnostics, {
        code: 'asset_license_invalid',
        severity: 'error',
        message: `Unsupported license at ${path}[${index}].`,
        details: { path: `${path}[${index}]`, value },
      });
      return;
    }
    licenses.push(value as License);
  });

  return licenses;
}

function parseBodyTypes(
  input: unknown,
  path: string,
  diagnostics: AssetPackDiagnostic[],
): readonly BodyType[] | undefined {
  const values = parseStringArray(input, path, diagnostics);
  if (!values) return undefined;

  const bodyTypes: BodyType[] = [];
  values.forEach((value, index) => {
    if (!BODY_TYPE_SET.has(value as BodyType)) {
      pushDiagnostic(diagnostics, {
        code: 'asset_pack_schema_invalid',
        severity: 'error',
        message: `Unsupported body type at ${path}[${index}].`,
        details: { path: `${path}[${index}]`, value },
      });
      return;
    }
    if (!bodyTypes.includes(value as BodyType)) {
      bodyTypes.push(value as BodyType);
    }
  });

  return bodyTypes;
}

function parseOptionalBodyTypes(
  input: unknown,
  path: string,
  diagnostics: AssetPackDiagnostic[],
): readonly BodyType[] | undefined {
  if (input === undefined) return undefined;
  return parseBodyTypes(input, path, diagnostics);
}

function parseOptionalStringArray(
  input: unknown,
  path: string,
  diagnostics: AssetPackDiagnostic[],
): readonly string[] | undefined {
  if (input === undefined) return undefined;
  return parseStringArray(input, path, diagnostics);
}

function parseOptionalRawRecolors(
  input: unknown,
  path: string,
  diagnostics: AssetPackDiagnostic[],
): RawRecolors | undefined {
  if (input === undefined) return undefined;
  return parseRawRecolors(input, path, diagnostics);
}

function parseRawRecolors(
  input: unknown,
  path: string,
  diagnostics: AssetPackDiagnostic[],
): RawRecolors | undefined {
  const record = asRecord(input, path, diagnostics);
  if (!record) return undefined;

  if ('material' in record || 'palettes' in record) {
    return parseRecolorConfig(record, path, diagnostics);
  }

  const entries = Object.entries(record);
  if (entries.length === 0) {
    pushDiagnostic(diagnostics, {
      code: 'asset_pack_schema_invalid',
      severity: 'error',
      message: `Empty recolor object at ${path}.`,
      details: { path },
    });
    return undefined;
  }

  const parsedEntries = new Map<
    `color_${number}`,
    NonNullable<ReturnType<typeof parseRecolorConfig>>
  >();
  sortedRecordEntries(record, path).forEach(([key, value]) => {
    if (!RECOLOR_KEY_PATTERN.test(key)) {
      pushDiagnostic(diagnostics, {
        code: 'asset_pack_schema_invalid',
        severity: 'error',
        message: `Unknown recolor field at ${path}.${key}.`,
        details: { path: `${path}.${key}` },
      });
      return;
    }
    const parsed = parseRecolorConfig(value, `${path}.${key}`, diagnostics);
    if (parsed) {
      parsedEntries.set(key as `color_${number}`, parsed);
    }
  });

  const multi: Record<`color_${number}`, ReturnType<typeof parseRecolorConfig>> = {};
  entries.forEach(([key]) => {
    const parsed = parsedEntries.get(key as `color_${number}`);
    if (parsed) multi[key as `color_${number}`] = parsed;
  });

  return multi as RawRecolors;
}

function parseRecolorConfig(
  input: unknown,
  path: string,
  diagnostics: AssetPackDiagnostic[],
) {
  const record = asRecord(input, path, diagnostics);
  if (!record) return undefined;

  exactKeys(record, path, ['material', 'palettes', 'type_name', 'base', 'source', 'label'], diagnostics);

  const material = readString(record, 'material', `${path}.material`, diagnostics);
  const palettes = parseStringArray(record.palettes, `${path}.palettes`, diagnostics);
  const typeName = readOptionalString(record, 'type_name', `${path}.type_name`, diagnostics);
  const base = readOptionalString(record, 'base', `${path}.base`, diagnostics);
  const source = parseOptionalStringArray(record.source, `${path}.source`, diagnostics);
  const label = readOptionalString(record, 'label', `${path}.label`, diagnostics);

  if (!material || !palettes) return undefined;
  return {
    material,
    palettes,
    ...(typeName ? { type_name: typeName } : {}),
    ...(base ? { base } : {}),
    ...(source ? { source } : {}),
    ...(label ? { label } : {}),
  };
}

function exactKeys(
  record: UnknownRecord,
  path: string,
  allowedKeys: readonly string[],
  diagnostics: AssetPackDiagnostic[],
) {
  const allowed = new Set(allowedKeys);
  sortedRecordEntries(record, path).forEach(([key]) => {
    if (allowed.has(key)) return;
    pushDiagnostic(diagnostics, {
      code: 'asset_pack_schema_invalid',
      severity: 'error',
      message: `Unknown field at ${path}.${key}.`,
      details: { path: `${path}.${key}` },
    });
  });
}

function sortedRecordEntries(
  record: UnknownRecord,
  path: string,
): [string, unknown][] {
  return Object.entries(record).sort(([left], [right]) =>
    `${path}.${left}`.localeCompare(`${path}.${right}`));
}

function sortDiagnostics(
  diagnostics: readonly AssetPackDiagnostic[],
): AssetPackDiagnostic[] {
  return diagnostics
    .map((diagnostic, index) => ({
      diagnostic,
      index,
      path: diagnosticPath(diagnostic),
    }))
    .sort((left, right) => left.path.localeCompare(right.path) || left.index - right.index)
    .map(({ diagnostic }) => diagnostic);
}

function diagnosticPath(diagnostic: AssetPackDiagnostic): string {
  const path = diagnostic.details?.path;
  return typeof path === 'string' ? path : '\uffff';
}

function asRecord(
  input: unknown,
  path: string,
  diagnostics: AssetPackDiagnostic[],
  code: AssetPackDiagnosticCode = 'asset_pack_schema_invalid',
): UnknownRecord | undefined {
  if (isRecord(input)) return input;
  pushDiagnostic(diagnostics, {
    code,
    severity: 'error',
    message: `Expected an object at ${path}.`,
    details: { path, value: input },
  });
  return undefined;
}

function asArray(
  input: unknown,
  path: string,
  diagnostics: AssetPackDiagnostic[],
): readonly unknown[] | undefined {
  if (Array.isArray(input)) return input;
  pushDiagnostic(diagnostics, {
    code: 'asset_pack_schema_invalid',
    severity: 'error',
    message: `Expected an array at ${path}.`,
    details: { path, value: input },
  });
  return undefined;
}

function readString(
  record: UnknownRecord,
  key: string,
  path: string,
  diagnostics: AssetPackDiagnostic[],
  code: AssetPackDiagnosticCode = 'asset_pack_schema_invalid',
): string | undefined {
  const value = record[key];
  if (typeof value === 'string') return value;
  pushDiagnostic(diagnostics, {
    code,
    severity: 'error',
    message: `Expected a string at ${path}.`,
    details: { path, value },
  });
  return undefined;
}

function readOptionalString(
  record: UnknownRecord,
  key: string,
  path: string,
  diagnostics: AssetPackDiagnostic[],
): string | undefined {
  const value = record[key];
  if (value === undefined) return undefined;
  if (typeof value === 'string') return value;
  pushDiagnostic(diagnostics, {
    code: 'asset_pack_schema_invalid',
    severity: 'error',
    message: `Expected a string at ${path}.`,
    details: { path, value },
  });
  return undefined;
}

function readBoolean(
  record: UnknownRecord,
  key: string,
  path: string,
  diagnostics: AssetPackDiagnostic[],
): boolean | undefined {
  const value = record[key];
  if (typeof value === 'boolean') return value;
  pushDiagnostic(diagnostics, {
    code: 'asset_pack_schema_invalid',
    severity: 'error',
    message: `Expected a boolean at ${path}.`,
    details: { path, value },
  });
  return undefined;
}

function readInteger(
  record: UnknownRecord,
  key: string,
  path: string,
  diagnostics: AssetPackDiagnostic[],
): number | undefined {
  const value = record[key];
  if (typeof value === 'number' && Number.isInteger(value)) return value;
  pushDiagnostic(diagnostics, {
    code: 'asset_pack_schema_invalid',
    severity: 'error',
    message: `Expected an integer at ${path}.`,
    details: { path, value },
  });
  return undefined;
}

function parseStringArray(
  input: unknown,
  path: string,
  diagnostics: AssetPackDiagnostic[],
  code: AssetPackDiagnosticCode = 'asset_pack_schema_invalid',
): readonly string[] | undefined {
  if (!Array.isArray(input)) {
    pushDiagnostic(diagnostics, {
      code,
      severity: 'error',
      message: `Expected an array at ${path}.`,
      details: { path, value: input },
    });
    return undefined;
  }

  const values: string[] = [];
  input.forEach((entry, index) => {
    if (typeof entry === 'string') {
      values.push(entry);
      return;
    }
    pushDiagnostic(diagnostics, {
      code,
      severity: 'error',
      message: `Expected a string at ${path}[${index}].`,
      details: { path: `${path}[${index}]`, value: entry },
    });
  });
  return values;
}

function readSourcePath(
  record: UnknownRecord,
  key: string,
  path: string,
  diagnostics: AssetPackDiagnostic[],
): string | undefined {
  return readManagedPath(record, key, path, 'sprites/', diagnostics);
}

function readManagedPath(
  record: UnknownRecord,
  key: string,
  path: string,
  prefix: string,
  diagnostics: AssetPackDiagnostic[],
): string | undefined {
  const value = readString(record, key, path, diagnostics);
  if (!value) return undefined;
  if (isManagedPath(value, prefix)) return value;

  pushDiagnostic(diagnostics, {
    code: 'asset_pack_schema_invalid',
    severity: 'error',
    message: `Invalid managed path at ${path}.`,
    ...(prefix === 'sprites/' ? { sourcePath: value } : { destinationPath: value }),
    details: { path, value, prefix },
  });
  return undefined;
}

function isManagedPath(value: string, prefix: string): boolean {
  if (value.length === 0) return false;
  if (!value.startsWith(prefix)) return false;
  if (value.startsWith('/') || /^[A-Za-z]:/.test(value)) return false;
  if (value.includes('\\')) return false;

  const parts = value.split('/');
  if (parts.some((part) => part.length === 0 || part === '.' || part === '..')) {
    return false;
  }

  return true;
}

function normalizeDestinationEvidence(
  value: string | undefined,
): ExtendItemDestinationSource['evidence'] | undefined {
  if (
    value === 'audit-exact'
    || value === 'audit-inferred'
    || value === 'artist-specified'
    || value === 'manual-review'
  ) {
    return value;
  }
  return undefined;
}

function isSubset(
  candidate: readonly BodyType[],
  parent: readonly BodyType[],
): boolean {
  const parentSet = new Set(parent);
  return candidate.every((entry) => parentSet.has(entry));
}

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function pushDiagnostic(
  diagnostics: AssetPackDiagnostic[],
  diagnostic: AssetPackDiagnostic,
) {
  diagnostics.push(diagnostic);
}
