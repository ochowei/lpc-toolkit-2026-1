export const ASSET_WEB_CLI_HANDOFF_SCHEMA =
  'lpc-toolkit.web-cli-handoff.v1' as const;
export const ASSET_AUTHORING_WEB_HANDOFF_RECEIPT_SCHEMA =
  'lpc-toolkit.asset-authoring-web-handoff-receipt.v1' as const;

export const ASSET_WEB_CLI_HANDOFF_CAPABILITIES = [
  'asset-authoring-web-cli-handoff.v1',
  'asset-authoring-web-cli-recovery.v1',
] as const;

export type AssetWebCliHandoffArchiveKind = 'draft' | 'formal';

export interface AssetWebCliHandoffSource {
  readonly path: string;
  readonly digest: string;
}

export interface AssetWebCliHandoff {
  readonly schema: typeof ASSET_WEB_CLI_HANDOFF_SCHEMA;
  readonly direction: 'web-to-cli';
  readonly handoffId: string;
  readonly purpose: 'cli-authoring-review';
  readonly createdAt: string;
  readonly web: {
    readonly workbenchRevision: number;
    readonly stateDigest: string;
    readonly baselineReleaseTag: string;
  };
  readonly pack: {
    readonly id: string;
    readonly version: string;
    readonly archiveKind: AssetWebCliHandoffArchiveKind;
    readonly manifestDigest: string;
    readonly contentDigest: string;
    readonly releaseFingerprint: string;
  };
  readonly payload: {
    readonly fileName: string;
    readonly byteLength: number;
    readonly archiveDigest: string;
  };
  readonly sources: readonly AssetWebCliHandoffSource[];
  readonly attribution: {
    readonly creditDigest: string;
    readonly acknowledgementDigest: string;
    readonly required: true;
  };
  readonly consent: {
    readonly handoffConfirmed: true;
  };
  readonly privacy: {
    readonly absolutePaths: false;
    readonly credentials: false;
    readonly providerPayloads: false;
    readonly browserState: false;
  };
}

export interface AssetAuthoringWebHandoffReceipt {
  readonly schema: typeof ASSET_AUTHORING_WEB_HANDOFF_RECEIPT_SCHEMA;
  readonly handoffId: string;
  readonly handoffDigest: string;
  readonly archiveDigest: string;
  readonly sessionId: string;
  readonly manifestDigest: string;
  readonly contentDigest: string;
  readonly sourceDigests: readonly AssetWebCliHandoffSource[];
  readonly creditDigest: string;
  readonly status: 'imported';
  readonly recordedAt: string;
}

export interface AssetWebCliHandoffStateProjection {
  readonly schema: typeof ASSET_WEB_CLI_HANDOFF_SCHEMA;
  readonly baselineReleaseTag: string;
  readonly workbenchRevision: number;
  readonly pack: {
    readonly id: string;
    readonly version: string;
    readonly archiveKind: AssetWebCliHandoffArchiveKind;
    readonly manifestDigest: string;
    readonly contentDigest: string;
    readonly releaseFingerprint: string;
  };
  readonly payload: {
    readonly archiveDigest: string;
    readonly byteLength: number;
  };
  readonly sources: readonly AssetWebCliHandoffSource[];
  readonly attribution: {
    readonly creditDigest: string;
    readonly acknowledgementDigest: string;
  };
}

export type AssetWebCliHandoffDiagnosticCode =
  | 'asset_web_cli_handoff_schema_invalid'
  | 'asset_web_cli_handoff_unsupported'
  | 'asset_web_cli_handoff_private_data'
  | 'asset_web_cli_handoff_digest_invalid'
  | 'asset_web_cli_handoff_path_invalid'
  | 'asset_web_cli_handoff_limit_exceeded'
  | 'asset_web_cli_handoff_uuid_invalid'
  | 'asset_web_cli_handoff_timestamp_invalid'
  | 'asset_web_cli_handoff_value_invalid'
  | 'asset_web_cli_handoff_attribution_required'
  | 'asset_web_cli_handoff_consent_required';

export interface AssetWebCliHandoffDiagnostic {
  readonly code: AssetWebCliHandoffDiagnosticCode;
  readonly message: string;
  readonly path: string;
}

export type AssetWebCliHandoffParseResult =
  | { readonly ok: true; readonly handoff: AssetWebCliHandoff }
  | { readonly ok: false; readonly diagnostics: readonly AssetWebCliHandoffDiagnostic[] };

export type AssetAuthoringWebHandoffReceiptParseResult =
  | { readonly ok: true; readonly receipt: AssetAuthoringWebHandoffReceipt }
  | { readonly ok: false; readonly diagnostics: readonly AssetWebCliHandoffDiagnostic[] };

type JsonRecord = Readonly<Record<string, unknown>>;

const DIGEST_PATTERN = /^sha256:[0-9a-f]{64}$/u;
const UUID_V4_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const PACK_ID_PATTERN = /^[a-z0-9]+(?:[.-][a-z0-9]+)*$/u;
const SEMVER_PATTERN =
  /^\d+\.\d+\.\d+(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/u;
const ISO_TIMESTAMP_PATTERN =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u;
const MAX_HANDOFF_JSON_BYTES = 64 * 1024;
const MAX_SOURCES = 4096;
const MAX_STRING_BYTES = 1024;

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function utf8ByteLength(value: string): number {
  let bytes = 0;
  for (const character of value) {
    const codePoint = character.codePointAt(0);
    if (codePoint === undefined) continue;
    if (codePoint <= 0x7f) bytes += 1;
    else if (codePoint <= 0x7ff) bytes += 2;
    else if (codePoint <= 0xffff) bytes += 3;
    else bytes += 4;
  }
  return bytes;
}

function utf8Bytes(value: string): readonly number[] {
  const bytes: number[] = [];
  for (const character of value) {
    const codePoint = character.codePointAt(0);
    if (codePoint === undefined) continue;
    if (codePoint <= 0x7f) {
      bytes.push(codePoint);
    } else if (codePoint <= 0x7ff) {
      bytes.push(0xc0 | (codePoint >> 6), 0x80 | (codePoint & 0x3f));
    } else if (codePoint <= 0xffff) {
      bytes.push(
        0xe0 | (codePoint >> 12),
        0x80 | ((codePoint >> 6) & 0x3f),
        0x80 | (codePoint & 0x3f),
      );
    } else {
      bytes.push(
        0xf0 | (codePoint >> 18),
        0x80 | ((codePoint >> 12) & 0x3f),
        0x80 | ((codePoint >> 6) & 0x3f),
        0x80 | (codePoint & 0x3f),
      );
    }
  }
  return bytes;
}

function compareUtf8(left: string, right: string): number {
  const leftBytes = utf8Bytes(left);
  const rightBytes = utf8Bytes(right);
  const length = Math.min(leftBytes.length, rightBytes.length);
  for (let index = 0; index < length; index += 1) {
    const leftByte = leftBytes[index];
    const rightByte = rightBytes[index];
    if (leftByte === undefined || rightByte === undefined) continue;
    if (leftByte !== rightByte) return leftByte - rightByte;
  }
  return leftBytes.length - rightBytes.length;
}

function diagnostic(
  code: AssetWebCliHandoffDiagnosticCode,
  path: string,
  message: string,
): AssetWebCliHandoffDiagnostic {
  return { code, path, message };
}

function invalid(path: string, message: string): AssetWebCliHandoffDiagnostic {
  return diagnostic('asset_web_cli_handoff_schema_invalid', path, message);
}

function exactKeys(
  record: JsonRecord,
  path: string,
  keys: readonly string[],
  diagnostics: AssetWebCliHandoffDiagnostic[],
): void {
  const allowed = new Set(keys);
  for (const key of Object.keys(record)) {
    if (!allowed.has(key)) {
      diagnostics.push(invalid(`${path}.${key}`, `Unknown field at ${path}.${key}.`));
    }
  }
}

function requiredRecord(
  value: unknown,
  path: string,
  diagnostics: AssetWebCliHandoffDiagnostic[],
): JsonRecord | undefined {
  if (!isRecord(value)) {
    diagnostics.push(invalid(path, `${path} must be an object.`));
    return undefined;
  }
  return value;
}

function requiredString(
  record: JsonRecord,
  key: string,
  path: string,
  diagnostics: AssetWebCliHandoffDiagnostic[],
): string | undefined {
  const value = record[key];
  if (typeof value !== 'string' || value.length === 0 || value.trim() !== value) {
    diagnostics.push(invalid(path, `${path} must be a non-empty trimmed string.`));
    return undefined;
  }
  if (utf8ByteLength(value) > MAX_STRING_BYTES) {
    diagnostics.push(diagnostic(
      'asset_web_cli_handoff_limit_exceeded',
      path,
      `${path} exceeds ${MAX_STRING_BYTES} UTF-8 bytes.`,
    ));
  }
  return value;
}

function containsPrivateText(value: string): boolean {
  return value.startsWith('/')
    || value.startsWith('~')
    || /^[A-Za-z]:[\\/]/u.test(value)
    || value.includes('\\')
    || value.includes('://')
    || value.includes('\u0000')
    || [...value].some((character) => (character.codePointAt(0) ?? 0) < 0x20)
    || /(?:bearer|api[_-]?key|password|cookie|secret|token)\s*[:=]/iu.test(value);
}

function requiredDigest(
  value: unknown,
  path: string,
  diagnostics: AssetWebCliHandoffDiagnostic[],
): string | undefined {
  if (typeof value !== 'string' || !DIGEST_PATTERN.test(value)) {
    diagnostics.push(diagnostic(
      'asset_web_cli_handoff_digest_invalid',
      path,
      `${path} must be a sha256 digest.`,
    ));
    return undefined;
  }
  return value;
}

function requiredBoolean(
  record: JsonRecord,
  key: string,
  path: string,
  diagnostics: AssetWebCliHandoffDiagnostic[],
): boolean | undefined {
  const value = record[key];
  if (typeof value !== 'boolean') {
    diagnostics.push(invalid(path, `${path} must be a boolean.`));
    return undefined;
  }
  return value;
}

function requiredNonNegativeInteger(
  record: JsonRecord,
  key: string,
  path: string,
  diagnostics: AssetWebCliHandoffDiagnostic[],
  positive = false,
): number | undefined {
  const value = record[key];
  const minimum = positive ? 1 : 0;
  if (!Number.isSafeInteger(value) || (typeof value === 'number' && value < minimum)) {
    diagnostics.push(diagnostic(
      'asset_web_cli_handoff_limit_exceeded',
      path,
      `${path} must be a safe integer greater than or equal to ${minimum}.`,
    ));
    return undefined;
  }
  return value as number;
}

function requiredLogicalPath(
  value: unknown,
  path: string,
  diagnostics: AssetWebCliHandoffDiagnostic[],
): string | undefined {
  const result = requiredStringValue(value, path, diagnostics);
  if (result === undefined) return undefined;
  const segments = result.split('/');
  const unsafe = result.startsWith('/')
    || result.startsWith('~')
    || /^[A-Za-z]:[\\/]/u.test(result)
    || result.includes('\\')
    || result.includes('//')
    || result.includes('\u0000')
    || segments.some((segment) => segment === '' || segment === '.' || segment === '..')
    || [...result].some((character) => {
      const codePoint = character.codePointAt(0) ?? 0;
      return codePoint < 0x20;
    });
  if (unsafe) {
    diagnostics.push(diagnostic(
      'asset_web_cli_handoff_path_invalid',
      path,
      `${path} must be a relative logical path without traversal.`,
    ));
    return undefined;
  }
  return result;
}

function requiredStringValue(
  value: unknown,
  path: string,
  diagnostics: AssetWebCliHandoffDiagnostic[],
): string | undefined {
  if (typeof value !== 'string' || value.length === 0 || value.trim() !== value) {
    diagnostics.push(invalid(path, `${path} must be a non-empty trimmed string.`));
    return undefined;
  }
  if (utf8ByteLength(value) > MAX_STRING_BYTES) {
    diagnostics.push(diagnostic(
      'asset_web_cli_handoff_limit_exceeded',
      path,
      `${path} exceeds ${MAX_STRING_BYTES} UTF-8 bytes.`,
    ));
    return undefined;
  }
  return value;
}

function requiredUuid(
  value: unknown,
  path: string,
  diagnostics: AssetWebCliHandoffDiagnostic[],
): string | undefined {
  const result = requiredStringValue(value, path, diagnostics);
  if (result !== undefined && !UUID_V4_PATTERN.test(result)) {
    diagnostics.push(diagnostic(
      'asset_web_cli_handoff_uuid_invalid',
      path,
      `${path} must be a UUID version 4.`,
    ));
  }
  return result;
}

function requiredTimestamp(
  value: unknown,
  path: string,
  diagnostics: AssetWebCliHandoffDiagnostic[],
): string | undefined {
  const result = requiredStringValue(value, path, diagnostics);
  if (
    result !== undefined
    && (!ISO_TIMESTAMP_PATTERN.test(result) || Number.isNaN(Date.parse(result)))
  ) {
    diagnostics.push(diagnostic(
      'asset_web_cli_handoff_timestamp_invalid',
      path,
      `${path} must be an ISO-8601 UTC timestamp with milliseconds.`,
    ));
  }
  return result;
}

function parseSources(
  value: unknown,
  path: string,
  diagnostics: AssetWebCliHandoffDiagnostic[],
): readonly AssetWebCliHandoffSource[] | undefined {
  if (!Array.isArray(value)) {
    diagnostics.push(invalid(path, `${path} must be an array.`));
    return undefined;
  }
  if (value.length > MAX_SOURCES) {
    diagnostics.push(diagnostic(
      'asset_web_cli_handoff_limit_exceeded',
      path,
      `${path} exceeds ${MAX_SOURCES} entries.`,
    ));
  }
  const sources: AssetWebCliHandoffSource[] = [];
  const seen = new Set<string>();
  value.forEach((entry, index) => {
    const entryPath = `${path}[${index}]`;
    const record = requiredRecord(entry, entryPath, diagnostics);
    if (!record) return;
    exactKeys(record, entryPath, ['path', 'digest'], diagnostics);
    const sourcePath = requiredLogicalPath(record.path, `${entryPath}.path`, diagnostics);
    const digest = requiredDigest(record.digest, `${entryPath}.digest`, diagnostics);
    if (sourcePath === undefined || digest === undefined) return;
    if (seen.has(sourcePath)) {
      diagnostics.push(invalid(
        `${entryPath}.path`,
        `${path} must not contain duplicate paths.`,
      ));
      return;
    }
    seen.add(sourcePath);
    sources.push({ path: sourcePath, digest });
  });
  return sources.sort((left, right) => compareUtf8(left.path, right.path));
}

function parseHandoffRecord(
  input: unknown,
  diagnostics: AssetWebCliHandoffDiagnostic[],
): AssetWebCliHandoff | undefined {
  const record = requiredRecord(input, '$', diagnostics);
  if (!record) return undefined;
  exactKeys(record, '$', [
    'schema',
    'direction',
    'handoffId',
    'purpose',
    'createdAt',
    'web',
    'pack',
    'payload',
    'sources',
    'attribution',
    'consent',
    'privacy',
  ], diagnostics);

  if (record.schema !== ASSET_WEB_CLI_HANDOFF_SCHEMA) {
    diagnostics.push(diagnostic(
      'asset_web_cli_handoff_unsupported',
      '$.schema',
      'Unsupported Web-to-CLI handoff schema.',
    ));
  }
  if (record.direction !== 'web-to-cli') {
    diagnostics.push(invalid('$.direction', '$.direction must be web-to-cli.'));
  }
  if (record.purpose !== 'cli-authoring-review') {
    diagnostics.push(invalid('$.purpose', '$.purpose must be cli-authoring-review.'));
  }

  const handoffId = requiredStringValue(record.handoffId, '$.handoffId', diagnostics);
  if (handoffId !== undefined && !UUID_V4_PATTERN.test(handoffId)) {
    diagnostics.push(diagnostic(
      'asset_web_cli_handoff_uuid_invalid',
      '$.handoffId',
      '$.handoffId must be a UUID version 4.',
    ));
  }
  const createdAt = requiredStringValue(record.createdAt, '$.createdAt', diagnostics);
  if (
    createdAt !== undefined
    && (!ISO_TIMESTAMP_PATTERN.test(createdAt) || Number.isNaN(Date.parse(createdAt)))
  ) {
    diagnostics.push(diagnostic(
      'asset_web_cli_handoff_timestamp_invalid',
      '$.createdAt',
      '$.createdAt must be an ISO-8601 UTC timestamp with milliseconds.',
    ));
  }

  const web = parseWeb(record.web, diagnostics);
  const pack = parsePack(record.pack, diagnostics);
  const payload = parsePayload(record.payload, diagnostics);
  const sources = parseSources(record.sources, '$.sources', diagnostics);
  const attribution = parseAttribution(record.attribution, diagnostics);
  const consent = parseConsent(record.consent, diagnostics);
  const privacy = parsePrivacy(record.privacy, diagnostics);

  if (
    diagnostics.length > 0
    || handoffId === undefined
    || createdAt === undefined
    || web === undefined
    || pack === undefined
    || payload === undefined
    || sources === undefined
    || attribution === undefined
    || consent === undefined
    || privacy === undefined
  ) {
    return undefined;
  }
  return {
    schema: ASSET_WEB_CLI_HANDOFF_SCHEMA,
    direction: 'web-to-cli',
    handoffId,
    purpose: 'cli-authoring-review',
    createdAt,
    web,
    pack,
    payload,
    sources,
    attribution,
    consent,
    privacy,
  };
}

function parseWeb(
  value: unknown,
  diagnostics: AssetWebCliHandoffDiagnostic[],
): AssetWebCliHandoff['web'] | undefined {
  const record = requiredRecord(value, '$.web', diagnostics);
  if (!record) return undefined;
  exactKeys(record, '$.web', ['workbenchRevision', 'stateDigest', 'baselineReleaseTag'], diagnostics);
  const workbenchRevision = requiredNonNegativeInteger(
    record,
    'workbenchRevision',
    '$.web.workbenchRevision',
    diagnostics,
  );
  const stateDigest = requiredDigest(record.stateDigest, '$.web.stateDigest', diagnostics);
  const baselineReleaseTag = requiredString(record, 'baselineReleaseTag', '$.web.baselineReleaseTag', diagnostics);
  if (baselineReleaseTag !== undefined && containsPrivateText(baselineReleaseTag)) {
    diagnostics.push(diagnostic(
      'asset_web_cli_handoff_private_data',
      '$.web.baselineReleaseTag',
      '$.web.baselineReleaseTag must not contain a path, URL, secret, or private value.',
    ));
  }
  if (workbenchRevision === undefined || stateDigest === undefined || baselineReleaseTag === undefined) {
    return undefined;
  }
  return { workbenchRevision, stateDigest, baselineReleaseTag };
}

function parsePack(
  value: unknown,
  diagnostics: AssetWebCliHandoffDiagnostic[],
): AssetWebCliHandoff['pack'] | undefined {
  const record = requiredRecord(value, '$.pack', diagnostics);
  if (!record) return undefined;
  exactKeys(record, '$.pack', [
    'id',
    'version',
    'archiveKind',
    'manifestDigest',
    'contentDigest',
    'releaseFingerprint',
  ], diagnostics);
  const id = requiredString(record, 'id', '$.pack.id', diagnostics);
  const version = requiredString(record, 'version', '$.pack.version', diagnostics);
  const archiveKind = record.archiveKind;
  if (archiveKind !== 'draft' && archiveKind !== 'formal') {
    diagnostics.push(invalid('$.pack.archiveKind', '$.pack.archiveKind must be draft or formal.'));
  }
  if (id !== undefined && !PACK_ID_PATTERN.test(id)) {
    diagnostics.push(invalid('$.pack.id', '$.pack.id must be a lowercase asset-pack identifier.'));
  }
  if (version !== undefined && !SEMVER_PATTERN.test(version)) {
    diagnostics.push(invalid('$.pack.version', '$.pack.version must be a semantic version.'));
  }
  const manifestDigest = requiredDigest(record.manifestDigest, '$.pack.manifestDigest', diagnostics);
  const contentDigest = requiredDigest(record.contentDigest, '$.pack.contentDigest', diagnostics);
  const releaseFingerprint = requiredDigest(
    record.releaseFingerprint,
    '$.pack.releaseFingerprint',
    diagnostics,
  );
  if (
    id === undefined
    || version === undefined
    || (archiveKind !== 'draft' && archiveKind !== 'formal')
    || manifestDigest === undefined
    || contentDigest === undefined
    || releaseFingerprint === undefined
  ) {
    return undefined;
  }
  return {
    id,
    version,
    archiveKind,
    manifestDigest,
    contentDigest,
    releaseFingerprint,
  };
}

function parsePayload(
  value: unknown,
  diagnostics: AssetWebCliHandoffDiagnostic[],
): AssetWebCliHandoff['payload'] | undefined {
  const record = requiredRecord(value, '$.payload', diagnostics);
  if (!record) return undefined;
  exactKeys(record, '$.payload', ['fileName', 'byteLength', 'archiveDigest'], diagnostics);
  const fileName = requiredString(record, 'fileName', '$.payload.fileName', diagnostics);
  if (
    fileName !== undefined
    && (fileName.includes('/')
      || fileName.includes('\\')
      || fileName === '.'
      || fileName === '..'
      || containsPrivateText(fileName))
  ) {
    diagnostics.push(diagnostic(
      'asset_web_cli_handoff_path_invalid',
      '$.payload.fileName',
      '$.payload.fileName must be a descriptive file name without a path.',
    ));
  }
  const byteLength = requiredNonNegativeInteger(
    record,
    'byteLength',
    '$.payload.byteLength',
    diagnostics,
    true,
  );
  const archiveDigest = requiredDigest(record.archiveDigest, '$.payload.archiveDigest', diagnostics);
  if (fileName === undefined || byteLength === undefined || archiveDigest === undefined) return undefined;
  return { fileName, byteLength, archiveDigest };
}

function parseAttribution(
  value: unknown,
  diagnostics: AssetWebCliHandoffDiagnostic[],
): AssetWebCliHandoff['attribution'] | undefined {
  const record = requiredRecord(value, '$.attribution', diagnostics);
  if (!record) return undefined;
  exactKeys(record, '$.attribution', ['creditDigest', 'acknowledgementDigest', 'required'], diagnostics);
  const creditDigest = requiredDigest(record.creditDigest, '$.attribution.creditDigest', diagnostics);
  const acknowledgementDigest = requiredDigest(
    record.acknowledgementDigest,
    '$.attribution.acknowledgementDigest',
    diagnostics,
  );
  const required = requiredBoolean(record, 'required', '$.attribution.required', diagnostics);
  if (required !== true) {
    diagnostics.push(diagnostic(
      'asset_web_cli_handoff_attribution_required',
      '$.attribution.required',
      '$.attribution.required must be true.',
    ));
  }
  if (creditDigest === undefined || acknowledgementDigest === undefined || required !== true) return undefined;
  return { creditDigest, acknowledgementDigest, required: true };
}

function parseConsent(
  value: unknown,
  diagnostics: AssetWebCliHandoffDiagnostic[],
): AssetWebCliHandoff['consent'] | undefined {
  const record = requiredRecord(value, '$.consent', diagnostics);
  if (!record) return undefined;
  exactKeys(record, '$.consent', ['handoffConfirmed'], diagnostics);
  const handoffConfirmed = requiredBoolean(
    record,
    'handoffConfirmed',
    '$.consent.handoffConfirmed',
    diagnostics,
  );
  if (handoffConfirmed !== true) {
    diagnostics.push(diagnostic(
      'asset_web_cli_handoff_consent_required',
      '$.consent.handoffConfirmed',
      '$.consent.handoffConfirmed must be true.',
    ));
    return undefined;
  }
  return { handoffConfirmed: true };
}

function parsePrivacy(
  value: unknown,
  diagnostics: AssetWebCliHandoffDiagnostic[],
): AssetWebCliHandoff['privacy'] | undefined {
  const record = requiredRecord(value, '$.privacy', diagnostics);
  if (!record) return undefined;
  exactKeys(record, '$.privacy', [
    'absolutePaths',
    'credentials',
    'providerPayloads',
    'browserState',
  ], diagnostics);
  const absolutePaths = requiredBoolean(record, 'absolutePaths', '$.privacy.absolutePaths', diagnostics);
  const credentials = requiredBoolean(record, 'credentials', '$.privacy.credentials', diagnostics);
  const providerPayloads = requiredBoolean(
    record,
    'providerPayloads',
    '$.privacy.providerPayloads',
    diagnostics,
  );
  const browserState = requiredBoolean(record, 'browserState', '$.privacy.browserState', diagnostics);
  const entries = [
    ['$.privacy.absolutePaths', absolutePaths],
    ['$.privacy.credentials', credentials],
    ['$.privacy.providerPayloads', providerPayloads],
    ['$.privacy.browserState', browserState],
  ] as const;
  entries.forEach(([entryPath, valueEntry]) => {
    if (valueEntry === true) {
      diagnostics.push(diagnostic(
        'asset_web_cli_handoff_private_data',
        entryPath,
        `${entryPath} must be false.`,
      ));
    }
  });
  if (
    absolutePaths !== false
    || credentials !== false
    || providerPayloads !== false
    || browserState !== false
  ) {
    return undefined;
  }
  return {
    absolutePaths: false,
    credentials: false,
    providerPayloads: false,
    browserState: false,
  };
}

export function parseAssetWebCliHandoff(value: unknown): AssetWebCliHandoffParseResult {
  const diagnostics: AssetWebCliHandoffDiagnostic[] = [];
  const handoff = parseHandoffRecord(value, diagnostics);
  return handoff && diagnostics.length === 0
    ? { ok: true, handoff }
    : { ok: false, diagnostics: sortDiagnostics(diagnostics) };
}

export function parseAssetWebCliHandoffJson(value: string): AssetWebCliHandoffParseResult {
  if (utf8ByteLength(value) > MAX_HANDOFF_JSON_BYTES) {
    return {
      ok: false,
      diagnostics: [diagnostic(
        'asset_web_cli_handoff_limit_exceeded',
        '$',
        `Handoff JSON exceeds ${MAX_HANDOFF_JSON_BYTES} UTF-8 bytes.`,
      )],
    };
  }
  try {
    return parseAssetWebCliHandoff(JSON.parse(value) as unknown);
  } catch {
    return {
      ok: false,
      diagnostics: [invalid('$', 'Handoff JSON must be valid JSON.')],
    };
  }
}

export function parseAssetAuthoringWebHandoffReceipt(
  value: unknown,
): AssetAuthoringWebHandoffReceiptParseResult {
  const diagnostics: AssetWebCliHandoffDiagnostic[] = [];
  const record = requiredRecord(value, '$', diagnostics);
  if (!record) return { ok: false, diagnostics };
  exactKeys(record, '$', [
    'schema',
    'handoffId',
    'handoffDigest',
    'archiveDigest',
    'sessionId',
    'manifestDigest',
    'contentDigest',
    'sourceDigests',
    'creditDigest',
    'status',
    'recordedAt',
  ], diagnostics);
  if (record.schema !== ASSET_AUTHORING_WEB_HANDOFF_RECEIPT_SCHEMA) {
    diagnostics.push(diagnostic(
      'asset_web_cli_handoff_unsupported',
      '$.schema',
      'Unsupported Web-handoff receipt schema.',
    ));
  }
  const handoffId = requiredUuid(record.handoffId, '$.handoffId', diagnostics);
  const handoffDigest = requiredDigest(record.handoffDigest, '$.handoffDigest', diagnostics);
  const archiveDigest = requiredDigest(record.archiveDigest, '$.archiveDigest', diagnostics);
  const sessionId = requiredUuid(record.sessionId, '$.sessionId', diagnostics);
  const manifestDigest = requiredDigest(record.manifestDigest, '$.manifestDigest', diagnostics);
  const contentDigest = requiredDigest(record.contentDigest, '$.contentDigest', diagnostics);
  const sourceDigests = parseSources(record.sourceDigests, '$.sourceDigests', diagnostics);
  const creditDigest = requiredDigest(record.creditDigest, '$.creditDigest', diagnostics);
  if (record.status !== 'imported') {
    diagnostics.push(invalid('$.status', '$.status must be imported.'));
  }
  const recordedAt = requiredTimestamp(record.recordedAt, '$.recordedAt', diagnostics);
  if (
    diagnostics.length > 0
    || handoffId === undefined
    || handoffDigest === undefined
    || archiveDigest === undefined
    || sessionId === undefined
    || manifestDigest === undefined
    || contentDigest === undefined
    || sourceDigests === undefined
    || creditDigest === undefined
    || recordedAt === undefined
  ) {
    return { ok: false, diagnostics: sortDiagnostics(diagnostics) };
  }
  return {
    ok: true,
    receipt: {
      schema: ASSET_AUTHORING_WEB_HANDOFF_RECEIPT_SCHEMA,
      handoffId,
      handoffDigest,
      archiveDigest,
      sessionId,
      manifestDigest,
      contentDigest,
      sourceDigests,
      creditDigest,
      status: 'imported',
      recordedAt,
    },
  };
}

export function parseAssetAuthoringWebHandoffReceiptJson(
  value: string,
): AssetAuthoringWebHandoffReceiptParseResult {
  if (utf8ByteLength(value) > MAX_HANDOFF_JSON_BYTES) {
    return {
      ok: false,
      diagnostics: [diagnostic(
        'asset_web_cli_handoff_limit_exceeded',
        '$',
        `Web-handoff receipt JSON exceeds ${MAX_HANDOFF_JSON_BYTES} UTF-8 bytes.`,
      )],
    };
  }
  try {
    return parseAssetAuthoringWebHandoffReceipt(JSON.parse(value) as unknown);
  } catch {
    return {
      ok: false,
      diagnostics: [invalid('$', 'Web-handoff receipt JSON must be valid JSON.')],
    };
  }
}

export function assetAuthoringWebHandoffReceiptProjection(
  receipt: AssetAuthoringWebHandoffReceipt,
): AssetAuthoringWebHandoffReceipt {
  return {
    schema: ASSET_AUTHORING_WEB_HANDOFF_RECEIPT_SCHEMA,
    handoffId: receipt.handoffId,
    handoffDigest: receipt.handoffDigest,
    archiveDigest: receipt.archiveDigest,
    sessionId: receipt.sessionId,
    manifestDigest: receipt.manifestDigest,
    contentDigest: receipt.contentDigest,
    sourceDigests: sortSources(receipt.sourceDigests),
    creditDigest: receipt.creditDigest,
    status: 'imported',
    recordedAt: receipt.recordedAt,
  };
}

export function assetAuthoringWebHandoffReceiptDigestInput(
  receipt: AssetAuthoringWebHandoffReceipt,
): string {
  return JSON.stringify(assetAuthoringWebHandoffReceiptProjection(receipt));
}

export function assetWebCliHandoffStateProjection(
  handoff: AssetWebCliHandoff,
): AssetWebCliHandoffStateProjection {
  return {
    schema: ASSET_WEB_CLI_HANDOFF_SCHEMA,
    baselineReleaseTag: handoff.web.baselineReleaseTag,
    workbenchRevision: handoff.web.workbenchRevision,
    pack: {
      id: handoff.pack.id,
      version: handoff.pack.version,
      archiveKind: handoff.pack.archiveKind,
      manifestDigest: handoff.pack.manifestDigest,
      contentDigest: handoff.pack.contentDigest,
      releaseFingerprint: handoff.pack.releaseFingerprint,
    },
    payload: {
      archiveDigest: handoff.payload.archiveDigest,
      byteLength: handoff.payload.byteLength,
    },
    sources: sortSources(handoff.sources),
    attribution: {
      creditDigest: handoff.attribution.creditDigest,
      acknowledgementDigest: handoff.attribution.acknowledgementDigest,
    },
  };
}

/** Returns canonical JSON input for a caller-owned cryptographic state digest. */
export function assetWebCliHandoffStateDigestInput(
  handoff: AssetWebCliHandoff,
): string {
  return JSON.stringify(assetWebCliHandoffStateProjection(handoff));
}

/** Returns canonical JSON input for a caller-owned handoff transfer digest. */
export function assetWebCliHandoffDigestInput(
  handoff: AssetWebCliHandoff,
): string {
  return JSON.stringify({
    schema: ASSET_WEB_CLI_HANDOFF_SCHEMA,
    direction: 'web-to-cli',
    handoffId: handoff.handoffId,
    purpose: 'cli-authoring-review',
    createdAt: handoff.createdAt,
    web: {
      workbenchRevision: handoff.web.workbenchRevision,
      stateDigest: handoff.web.stateDigest,
      baselineReleaseTag: handoff.web.baselineReleaseTag,
    },
    pack: {
      id: handoff.pack.id,
      version: handoff.pack.version,
      archiveKind: handoff.pack.archiveKind,
      manifestDigest: handoff.pack.manifestDigest,
      contentDigest: handoff.pack.contentDigest,
      releaseFingerprint: handoff.pack.releaseFingerprint,
    },
    payload: {
      fileName: handoff.payload.fileName,
      byteLength: handoff.payload.byteLength,
      archiveDigest: handoff.payload.archiveDigest,
    },
    sources: sortSources(handoff.sources),
    attribution: {
      creditDigest: handoff.attribution.creditDigest,
      acknowledgementDigest: handoff.attribution.acknowledgementDigest,
      required: true,
    },
    consent: {
      handoffConfirmed: true,
    },
    privacy: {
      absolutePaths: false,
      credentials: false,
      providerPayloads: false,
      browserState: false,
    },
  });
}

export function assetWebCliHandoffPrivacyIsSafe(
  handoff: AssetWebCliHandoff,
): boolean {
  return handoff.privacy.absolutePaths === false
    && handoff.privacy.credentials === false
    && handoff.privacy.providerPayloads === false
    && handoff.privacy.browserState === false;
}

export function assetWebCliHandoffAttributionIsRequired(
  handoff: AssetWebCliHandoff,
): boolean {
  return handoff.attribution.required === true;
}

export function assetWebCliHandoffStateIsStale(
  handoff: AssetWebCliHandoff,
  observedStateDigest: string,
): boolean {
  return handoff.web.stateDigest !== observedStateDigest;
}

export function assetWebCliCapabilitiesMissing(
  availableCapabilities: readonly string[],
  requiredCapabilities: readonly string[] = ASSET_WEB_CLI_HANDOFF_CAPABILITIES,
): readonly string[] {
  const available = new Set(availableCapabilities);
  return [...new Set(requiredCapabilities)]
    .filter((capability) => !available.has(capability))
    .sort(compareUtf8);
}

export function assetWebCliCapabilitiesCompatible(
  availableCapabilities: readonly string[],
  requiredCapabilities: readonly string[] = ASSET_WEB_CLI_HANDOFF_CAPABILITIES,
): boolean {
  return assetWebCliCapabilitiesMissing(availableCapabilities, requiredCapabilities).length === 0;
}

function sortSources(
  sources: readonly AssetWebCliHandoffSource[],
): readonly AssetWebCliHandoffSource[] {
  return [...sources]
    .map(({ path, digest }) => ({ path, digest }))
    .sort((left, right) => compareUtf8(left.path, right.path));
}

function sortDiagnostics(
  diagnostics: readonly AssetWebCliHandoffDiagnostic[],
): readonly AssetWebCliHandoffDiagnostic[] {
  return [...diagnostics].sort((left, right) => {
    const pathOrder = compareUtf8(left.path, right.path);
    if (pathOrder !== 0) return pathOrder;
    return compareUtf8(left.code, right.code);
  });
}
