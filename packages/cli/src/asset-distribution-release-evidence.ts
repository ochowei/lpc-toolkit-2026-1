import { createHash } from 'node:crypto';
import {
  ASSET_AUTHORING_RELEASE_ARTIFACT_IDS,
  assetAuthoringReleaseReceiptDigestInput,
  type AssetAuthoringPreviewAcceptanceReceipt,
  type AssetAuthoringReleaseDeclarationReceipt,
  type AssetAuthoringReleaseGateProjection,
  type AssetDistributionRelease,
} from '@lpc-toolkit/core';
import type { AssetPackArchiveSnapshot } from './asset-pack-archive-format.js';
import type { AssetReleaseProvenanceVerificationData } from './asset-release-provenance.js';
import type {
  AssetAuthoringArchiveInspectionReceipt,
  AssetAuthoringFormalArchiveReceipt,
} from './asset-authoring-session.js';

export const ASSET_DISTRIBUTION_RELEASE_EVIDENCE_SCHEMA =
  'lpc-toolkit.asset-distribution-release-evidence.v1' as const;
export const ASSET_DISTRIBUTION_LICENSE_EVIDENCE_SCHEMA =
  'lpc-toolkit.asset-distribution-license-evidence.v1' as const;
export const ASSET_DISTRIBUTION_PROVIDER_EVIDENCE_SCHEMA =
  'lpc-toolkit.asset-distribution-provider-evidence.v1' as const;

export interface AssetDistributionTransportEvidenceDiagnostic {
  readonly code: string;
  readonly message: string;
  readonly details?: Readonly<Record<string, unknown>>;
}

export interface AssetDistributionLicenseEvidence {
  readonly schema: typeof ASSET_DISTRIBUTION_LICENSE_EVIDENCE_SCHEMA;
  readonly creditsDigest: string;
  readonly licenses: readonly string[];
}

export type AssetDistributionLicenseEvidenceParseResult =
  | { readonly ok: true; readonly evidence: AssetDistributionLicenseEvidence }
  | { readonly ok: false; readonly diagnostics: readonly AssetDistributionTransportEvidenceDiagnostic[] };

export interface AssetDistributionProviderEvidence {
  readonly schema: typeof ASSET_DISTRIBUTION_PROVIDER_EVIDENCE_SCHEMA;
  readonly invocationDigest: string;
  readonly evidenceDigest: string;
  readonly role: 'provenance-only';
}

export type AssetDistributionProviderEvidenceParseResult =
  | { readonly ok: true; readonly evidence: AssetDistributionProviderEvidence }
  | { readonly ok: false; readonly diagnostics: readonly AssetDistributionTransportEvidenceDiagnostic[] };

export interface AssetDistributionCreditsEvidence {
  readonly source: 'formal-archive';
  readonly archiveDigest: string;
  readonly bytes: Uint8Array;
}

export interface AssetDistributionValidationEvidence {
  readonly receiptId: string;
  readonly valid: boolean;
  readonly manifestDigest: string;
  readonly contentDigest: string;
  readonly sourceDigests: readonly { readonly path: string; readonly digest: string }[];
}

export interface AssetDistributionHandoffEvidence {
  readonly handoffDigest: string;
  readonly receiptDigest: string;
  readonly status: 'current';
  readonly archiveDigest: string;
  readonly manifestDigest: string;
  readonly contentDigest: string;
  readonly creditDigest: string;
}

export interface AssetDistributionReleaseEvidenceInput {
  readonly release: AssetDistributionRelease;
  readonly archive: AssetPackArchiveSnapshot;
  readonly credits: AssetDistributionCreditsEvidence;
  readonly licenseEvidenceBytes: Uint8Array;
  readonly validation: AssetDistributionValidationEvidence;
  readonly releaseGates: AssetAuthoringReleaseGateProjection;
  readonly releaseDeclaration: AssetAuthoringReleaseDeclarationReceipt;
  readonly previewAcceptance: AssetAuthoringPreviewAcceptanceReceipt;
  readonly formalArchive: AssetAuthoringFormalArchiveReceipt;
  readonly archiveInspection: AssetAuthoringArchiveInspectionReceipt;
  readonly provenance?: AssetReleaseProvenanceVerificationData;
  readonly provider?: AssetDistributionProviderEvidence;
  readonly handoff?: AssetDistributionHandoffEvidence;
}

export type AssetDistributionReleaseEvidenceResult =
  | {
    readonly ok: true;
    readonly decision: 'publishable';
    readonly releaseEvidenceDigest: string;
    readonly creditsDigest: string;
    readonly licenseEvidenceDigest: string;
    readonly provenanceDigest?: string;
    readonly providerEvidenceDigest?: string;
    readonly handoffEvidenceDigest?: string;
  }
  | {
    readonly ok: false;
    readonly diagnostics: readonly AssetDistributionTransportEvidenceDiagnostic[];
  };

type JsonRecord = Readonly<Record<string, unknown>>;
type DigestBinding = { readonly path: string; readonly digest: string };

const DIGEST_PATTERN = /^sha256:[0-9a-f]{64}$/u;
const LICENSES = new Set([
  'CC0',
  'CC-BY',
  'CC-BY 3.0',
  'CC-BY 3.0+',
  'CC-BY 4.0',
  'CC-BY-SA 3.0',
  'CC-BY-SA 4.0',
  'OGA-BY 3.0',
  'OGA-BY 3.0+',
  'OGA-BY 4.0',
  'GPL 2.0',
  'GPL 3.0',
]);
const LICENSE_EVIDENCE_KEYS = ['schema', 'creditsDigest', 'licenses'] as const;
const PROVIDER_EVIDENCE_KEYS = ['schema', 'invocationDigest', 'evidenceDigest', 'role'] as const;
const RELEASE_GATE_IDS = [
  'acknowledgements',
  'validation',
  'releaseDeclaration',
  'preview',
  'previewArtifacts',
  'previewAcceptance',
] as const;

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function invalid(
  code: string,
  message: string,
  details?: Readonly<Record<string, unknown>>,
): AssetDistributionTransportEvidenceDiagnostic {
  return { code, message, ...(details === undefined ? {} : { details }) };
}

function sha256(bytes: Uint8Array): string {
  return `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
}

function compareCodeUnits(left: string, right: string): number {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (!isRecord(value)) return value;
  return Object.fromEntries(
    Object.keys(value)
      .filter((key) => value[key] !== undefined)
      .sort(compareCodeUnits)
      .map((key) => [key, canonicalize(value[key])]),
  );
}

function canonicalJson(value: unknown): string {
  return JSON.stringify(canonicalize(value)) ?? '';
}

function sameDigests(left: readonly DigestBinding[], right: readonly DigestBinding[]): boolean {
  return left.length === right.length && left.every((entry, index) => {
    const other = right[index];
    return other !== undefined && entry.path === other.path && entry.digest === other.digest;
  });
}

function archiveSources(snapshot: AssetPackArchiveSnapshot): readonly DigestBinding[] {
  return [...snapshot.payload.sourceDigests]
    .sort(([left], [right]) => compareCodeUnits(left, right))
    .map(([path, digest]) => ({ path, digest }));
}

function exactKeys(
  record: JsonRecord,
  expected: readonly string[],
  path: string,
): readonly AssetDistributionTransportEvidenceDiagnostic[] {
  const expectedSet = new Set(expected);
  return Object.keys(record)
    .filter((key) => !expectedSet.has(key))
    .map((key) => invalid(
      'asset_distribution_invalid',
      `Unknown field at ${path}.${key}.`,
      { path: `${path}.${key}` },
    ));
}

function requiredDigest(
  record: JsonRecord,
  key: string,
): string | undefined {
  const value = record[key];
  return typeof value === 'string' && DIGEST_PATTERN.test(value) ? value : undefined;
}

function sortedUniqueLicenses(value: unknown): readonly string[] | undefined {
  if (!Array.isArray(value) || value.some((entry) => typeof entry !== 'string' || !LICENSES.has(entry))) {
    return undefined;
  }
  const licenses = value as string[];
  const sorted = [...licenses].sort(compareCodeUnits);
  if (
    licenses.length === 0
    || new Set(licenses).size !== licenses.length
    || licenses.some((license, index) => license !== sorted[index])
  ) return undefined;
  return licenses;
}

function parseCanonicalJson(bytes: Uint8Array): { readonly value: unknown; readonly text: string } | undefined {
  try {
    const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    return { value: JSON.parse(text) as unknown, text };
  } catch {
    return undefined;
  }
}

export function parseAssetDistributionLicenseEvidence(
  input: unknown,
): AssetDistributionLicenseEvidenceParseResult {
  if (!isRecord(input)) {
    return { ok: false, diagnostics: [invalid('asset_distribution_license_mismatch', '$ must be an object.')] };
  }
  const diagnostics: AssetDistributionTransportEvidenceDiagnostic[] = [
    ...exactKeys(input, LICENSE_EVIDENCE_KEYS, '$'),
  ];
  if (input.schema !== ASSET_DISTRIBUTION_LICENSE_EVIDENCE_SCHEMA) {
    diagnostics.push(invalid(
      'asset_distribution_license_mismatch',
      'Unsupported license evidence schema.',
    ));
  }
  const creditsDigest = requiredDigest(input, 'creditsDigest');
  if (creditsDigest === undefined) {
    diagnostics.push(invalid('asset_distribution_license_mismatch', '$.creditsDigest must be a sha256 digest.'));
  }
  const licenses = sortedUniqueLicenses(input.licenses);
  if (licenses === undefined) {
    diagnostics.push(invalid(
      'asset_distribution_license_mismatch',
      '$.licenses must be a sorted, unique list of supported licenses.',
    ));
  }
  if (diagnostics.length > 0 || creditsDigest === undefined || licenses === undefined) {
    return { ok: false, diagnostics };
  }
  return {
    ok: true,
    evidence: {
      schema: ASSET_DISTRIBUTION_LICENSE_EVIDENCE_SCHEMA,
      creditsDigest,
      licenses,
    },
  };
}

export function parseAssetDistributionProviderEvidence(
  input: unknown,
): AssetDistributionProviderEvidenceParseResult {
  if (!isRecord(input)) {
    return { ok: false, diagnostics: [invalid('asset_distribution_invalid', '$ must be an object.')] };
  }
  const diagnostics: AssetDistributionTransportEvidenceDiagnostic[] = [
    ...exactKeys(input, PROVIDER_EVIDENCE_KEYS, '$'),
  ];
  if (input.schema !== ASSET_DISTRIBUTION_PROVIDER_EVIDENCE_SCHEMA) {
    diagnostics.push(invalid('asset_distribution_invalid', 'Unsupported provider evidence schema.'));
  }
  const invocationDigest = requiredDigest(input, 'invocationDigest');
  const evidenceDigest = requiredDigest(input, 'evidenceDigest');
  if (invocationDigest === undefined) diagnostics.push(invalid('asset_distribution_invalid', '$.invocationDigest must be a sha256 digest.'));
  if (evidenceDigest === undefined) diagnostics.push(invalid('asset_distribution_invalid', '$.evidenceDigest must be a sha256 digest.'));
  if (input.role !== 'provenance-only') {
    diagnostics.push(invalid(
      'asset_distribution_provider_authority_forbidden',
      'Provider evidence may be retained as provenance only; it cannot assert authorship or license authority.',
    ));
  }
  if (diagnostics.length > 0 || invocationDigest === undefined || evidenceDigest === undefined || input.role !== 'provenance-only') {
    return { ok: false, diagnostics };
  }
  return {
    ok: true,
    evidence: {
      schema: ASSET_DISTRIBUTION_PROVIDER_EVIDENCE_SCHEMA,
      invocationDigest,
      evidenceDigest,
      role: 'provenance-only',
    },
  };
}

function licenseEvidenceFromBytes(
  bytes: Uint8Array,
): { readonly evidence: AssetDistributionLicenseEvidence; readonly digest: string } | undefined {
  const parsedBytes = parseCanonicalJson(bytes);
  if (parsedBytes === undefined) return undefined;
  const parsed = parseAssetDistributionLicenseEvidence(parsedBytes.value);
  if (!parsed.ok || parsedBytes.text !== canonicalJson(parsed.evidence)) return undefined;
  return { evidence: parsed.evidence, digest: sha256(bytes) };
}

function previewAcceptanceDigest(receipt: AssetAuthoringPreviewAcceptanceReceipt): string {
  return sha256(Buffer.from(assetAuthoringReleaseReceiptDigestInput(receipt), 'utf8'));
}

function gatesAreCurrent(gates: AssetAuthoringReleaseGateProjection): boolean {
  if (!gates.releaseReady || gates.gates.length !== RELEASE_GATE_IDS.length) return false;
  const seen = new Set<string>();
  for (const gate of gates.gates) {
    if (!RELEASE_GATE_IDS.includes(gate.id) || gate.freshness !== 'current' || seen.has(gate.id)) return false;
    seen.add(gate.id);
  }
  return seen.size === RELEASE_GATE_IDS.length;
}

interface AssetDistributionReleaseEvidenceProjection {
  readonly schema: typeof ASSET_DISTRIBUTION_RELEASE_EVIDENCE_SCHEMA;
  readonly release: {
    readonly namespace: string;
    readonly packId: string;
    readonly version: string;
    readonly archiveDigest: string;
    readonly byteLength: number;
    readonly manifestDigest: string;
    readonly contentDigest: string;
    readonly sourceDigests: readonly DigestBinding[];
    readonly creditsDigest: string;
    readonly licenseEvidenceDigest: string;
    readonly provenanceDigest?: string;
  };
  readonly validation: {
    readonly receiptId: string;
    readonly manifestDigest: string;
    readonly contentDigest: string;
    readonly sourceDigests: readonly DigestBinding[];
  };
  readonly humanApproval: {
    readonly declarationDigest: string;
    readonly previewAcceptanceDigest: string;
    readonly gates: readonly { readonly id: string; readonly freshness: string }[];
  };
  readonly licenseEvidence: {
    readonly digest: string;
    readonly licenses: readonly string[];
  };
  readonly provenance?: {
    readonly provenanceDigest: string;
    readonly projectionDigest: string;
    readonly releaseDeclarationReceiptDigest: string;
    readonly previewAcceptanceReceiptDigest: string;
  };
  readonly provider?: AssetDistributionProviderEvidence;
  readonly handoff?: AssetDistributionHandoffEvidence;
}

function evidenceProjection(
  input: AssetDistributionReleaseEvidenceInput,
  licenseEvidence: AssetDistributionLicenseEvidence,
): AssetDistributionReleaseEvidenceProjection {
  const release = input.release.release;
  const previewDigest = previewAcceptanceDigest(input.previewAcceptance);
  return {
    schema: ASSET_DISTRIBUTION_RELEASE_EVIDENCE_SCHEMA,
    release: {
      namespace: release.namespace,
      packId: release.packId,
      version: release.version,
      archiveDigest: release.archiveDigest,
      byteLength: release.byteLength,
      manifestDigest: release.manifestDigest,
      contentDigest: release.contentDigest,
      sourceDigests: release.sourceDigests.map(({ path, digest }) => ({ path, digest })),
      creditsDigest: release.creditsDigest,
      licenseEvidenceDigest: release.licenseEvidenceDigest,
      ...(release.provenanceDigest === undefined ? {} : { provenanceDigest: release.provenanceDigest }),
    },
    validation: {
      receiptId: input.validation.receiptId,
      manifestDigest: input.validation.manifestDigest,
      contentDigest: input.validation.contentDigest,
      sourceDigests: input.validation.sourceDigests.map(({ path, digest }) => ({ path, digest })),
    },
    humanApproval: {
      declarationDigest: input.releaseDeclaration.declarationDigest,
      previewAcceptanceDigest: previewDigest,
      gates: input.releaseGates.gates.map(({ id, freshness }) => ({ id, freshness })),
    },
    licenseEvidence: {
      digest: sha256(input.licenseEvidenceBytes),
      licenses: [...licenseEvidence.licenses],
    },
    ...(input.provenance === undefined ? {} : {
      provenance: {
        provenanceDigest: input.provenance.provenanceDigest,
        projectionDigest: input.provenance.projectionDigest,
        releaseDeclarationReceiptDigest: input.provenance.releaseDeclarationReceiptDigest,
        previewAcceptanceReceiptDigest: input.provenance.previewAcceptanceReceiptDigest,
      },
    }),
    ...(input.provider === undefined ? {} : { provider: input.provider }),
    ...(input.handoff === undefined ? {} : { handoff: input.handoff }),
  };
}

function requireLicenseEvidence(
  bytes: Uint8Array,
): { readonly evidence: AssetDistributionLicenseEvidence; readonly digest: string } {
  const parsed = licenseEvidenceFromBytes(bytes);
  if (parsed === undefined) throw new Error('Invalid canonical license evidence.');
  return parsed;
}

export function assetDistributionReleaseEvidenceDigestInput(
  input: AssetDistributionReleaseEvidenceInput,
): string {
  const licenseEvidence = requireLicenseEvidence(input.licenseEvidenceBytes);
  return canonicalJson(evidenceProjection(input, licenseEvidence.evidence));
}

export function assetDistributionReleaseEvidenceDigest(
  input: AssetDistributionReleaseEvidenceInput,
): string {
  return sha256(Buffer.from(assetDistributionReleaseEvidenceDigestInput(input), 'utf8'));
}

function failure(
  code: string,
  message: string,
  details?: Readonly<Record<string, unknown>>,
): AssetDistributionReleaseEvidenceResult {
  return { ok: false, diagnostics: [invalid(code, message, details)] };
}

export function verifyAssetDistributionReleaseEvidence(
  input: AssetDistributionReleaseEvidenceInput,
): AssetDistributionReleaseEvidenceResult {
  const release = input.release.release;
  const archive = input.archive;
  const actualArchiveDigest = sha256(archive.archiveBytes);
  if (archive.payload.pack.status === 'draft') {
    return failure('asset_distribution_record_mismatch', 'Draft archives cannot be publishable distribution releases.');
  }
  if (
    actualArchiveDigest !== archive.archiveDigest
    || release.archiveDigest !== archive.archiveDigest
    || release.byteLength !== archive.archiveBytes.byteLength
  ) {
    return failure(
      'asset_distribution_archive_tampered',
      'The release record does not bind the exact formal archive bytes.',
    );
  }
  const manifestDigest = sha256(archive.manifestBytes);
  const sources = archiveSources(archive);
  if (
    release.packId !== archive.payload.pack.id
    || release.version !== archive.payload.pack.version
    || release.archiveKind !== 'formal'
    || release.manifestDigest !== manifestDigest
    || release.contentDigest !== archive.payload.contentDigest
    || !sameDigests(release.sourceDigests, sources)
  ) {
    return failure('asset_distribution_record_mismatch', 'The release record does not match archive identity or content evidence.');
  }
  if (!input.credits.bytes.byteLength || input.credits.source !== 'formal-archive' || input.credits.archiveDigest !== archive.archiveDigest) {
    return failure('asset_distribution_credit_mismatch', 'Credits evidence is missing or is not bound to the exact formal archive.');
  }
  const creditsDigest = sha256(input.credits.bytes);
  if (creditsDigest !== release.creditsDigest) {
    return failure('asset_distribution_credit_mismatch', 'The exact credits evidence does not match the release record.');
  }
  const licenseEvidence = licenseEvidenceFromBytes(input.licenseEvidenceBytes);
  if (licenseEvidence === undefined) {
    return failure('asset_distribution_license_mismatch', 'License evidence must be canonical JSON with supported normalized licenses.');
  }
  if (
    licenseEvidence.digest !== release.licenseEvidenceDigest
    || licenseEvidence.evidence.creditsDigest !== creditsDigest
  ) {
    return failure('asset_distribution_license_mismatch', 'License evidence does not bind the exact credits evidence or release digest.');
  }
  if (
    !input.validation.valid
    || input.validation.receiptId.length === 0
    || input.validation.manifestDigest !== manifestDigest
    || input.validation.contentDigest !== archive.payload.contentDigest
    || !sameDigests(input.validation.sourceDigests, sources)
  ) {
    return failure('asset_distribution_record_mismatch', 'Existing validation evidence is missing or stale for the exact archive.');
  }
  if (!gatesAreCurrent(input.releaseGates)) {
    return failure('asset_distribution_release_authorization_required', 'Existing validation, preview, release declaration, and human approval gates are not current.');
  }
  const declaration = input.releaseDeclaration;
  if (
    declaration.manifestDigest !== manifestDigest
    || !sameDigests(declaration.sourceDigests, sources)
    || declaration.validationReceiptId !== input.validation.receiptId
    || declaration.creditDigests.authorAndSource !== creditsDigest
    || declaration.creditDigests.licenseAuthority !== creditsDigest
    || declaration.acknowledgements.contentDigest !== archive.payload.contentDigest
  ) {
    return failure('asset_distribution_release_authorization_required', 'The release declaration is not bound to current validation and attribution evidence.');
  }
  const previewDigest = previewAcceptanceDigest(input.previewAcceptance);
  if (
    input.previewAcceptance.declarationReceiptDigest !== declaration.declarationDigest
    || input.previewAcceptance.manifestDigest !== manifestDigest
    || !sameDigests(input.previewAcceptance.sourceDigests, sources)
    || input.previewAcceptance.validationReceiptId !== input.validation.receiptId
    || input.previewAcceptance.artifacts.length !== ASSET_AUTHORING_RELEASE_ARTIFACT_IDS.length
    || new Set(input.previewAcceptance.artifacts.map(({ id }) => id)).size !== ASSET_AUTHORING_RELEASE_ARTIFACT_IDS.length
  ) {
    return failure('asset_distribution_release_authorization_required', 'Preview acceptance is not bound to the current declaration and archive.');
  }
  const formalArchive = input.formalArchive;
  if (
    formalArchive.archiveDigest !== archive.archiveDigest
    || formalArchive.manifestDigest !== manifestDigest
    || formalArchive.contentDigest !== archive.payload.contentDigest
    || !sameDigests(formalArchive.sourceDigests, sources)
    || formalArchive.validationReceiptId !== input.validation.receiptId
    || formalArchive.declarationReceiptDigest !== declaration.declarationDigest
    || formalArchive.previewAcceptanceReceiptDigest !== previewDigest
  ) {
    return failure('asset_distribution_record_mismatch', 'The formal archive receipt is not bound to current release evidence.');
  }
  const inspection = input.archiveInspection;
  if (
    inspection.archiveDigest !== archive.archiveDigest
    || inspection.formalArchiveDigest !== formalArchive.archiveDigest
    || inspection.packId !== archive.payload.pack.id
    || inspection.version !== archive.payload.pack.version
    || inspection.manifestDigest !== manifestDigest
    || inspection.contentDigest !== archive.payload.contentDigest
    || !sameDigests(inspection.sourceDigests, sources)
  ) {
    return failure('asset_distribution_record_mismatch', 'The archive inspection receipt is not bound to the exact formal archive.');
  }
  if (input.provenance !== undefined) {
    const provenance = input.provenance;
    if (
      release.provenanceDigest === undefined
      || provenance.verified !== true
      || provenance.provenanceDigest !== release.provenanceDigest
      || provenance.archiveDigest !== archive.archiveDigest
      || provenance.manifestDigest !== manifestDigest
      || provenance.contentDigest !== archive.payload.contentDigest
      || !sameDigests(provenance.sourceDigests, sources)
      || provenance.releaseDeclarationReceiptDigest !== declaration.declarationDigest
      || provenance.previewAcceptanceReceiptDigest !== previewDigest
    ) {
      return failure('asset_distribution_provenance_mismatch', 'D1 provenance evidence does not bind the exact archive and human release evidence.');
    }
  } else if (release.provenanceDigest !== undefined) {
    return failure('asset_distribution_provenance_mismatch', 'The release declares D1 provenance but no verified provenance evidence was supplied.');
  }
  if (input.provider !== undefined) {
    const provider = parseAssetDistributionProviderEvidence(input.provider);
    if (!provider.ok) return { ok: false, diagnostics: provider.diagnostics };
  }
  if (input.handoff !== undefined) {
    if (
      input.handoff.status !== 'current'
      || input.handoff.archiveDigest !== archive.archiveDigest
      || input.handoff.manifestDigest !== manifestDigest
      || input.handoff.contentDigest !== archive.payload.contentDigest
      || input.handoff.creditDigest !== creditsDigest
    ) {
      return failure('asset_distribution_record_mismatch', 'D3 handoff evidence is stale or does not bind to the exact archive.');
    }
  }
  const computedEvidenceDigest = assetDistributionReleaseEvidenceDigest(input);
  if (computedEvidenceDigest !== input.release.authorization.releaseEvidenceDigest) {
    return failure('asset_distribution_record_mismatch', 'Release authorization evidence digest does not match the canonical evidence projection.');
  }
  return {
    ok: true,
    decision: 'publishable',
    releaseEvidenceDigest: computedEvidenceDigest,
    creditsDigest,
    licenseEvidenceDigest: licenseEvidence.digest,
    ...(release.provenanceDigest === undefined ? {} : { provenanceDigest: release.provenanceDigest }),
    ...(input.provider === undefined ? {} : { providerEvidenceDigest: input.provider.evidenceDigest }),
    ...(input.handoff === undefined ? {} : { handoffEvidenceDigest: input.handoff.receiptDigest }),
  };
}
