import {
  compareAssetPackVersions,
  parseAssetPackSemver,
  type AssetPackAcknowledgement,
} from '@lpc-toolkit/core';
import type {
  AssetPackWorkerUploadMetadata,
  AssetPackWorkbenchRevision,
} from '../lib/asset-pack-worker-protocol';

export type AssetPackFormalBlockerCode =
  | 'unsafe-archive'
  | 'worker-failed'
  | 'validation-error'
  | 'unacknowledged-warning'
  | 'missing-candidate'
  | 'draft-status'
  | 'not-serializable'
  | 'invalid-version'
  | 'candidate-revision-stale'
  | 'version-increase-required';

export interface AssetPackFormalBlocker {
  readonly code: AssetPackFormalBlockerCode;
  readonly message: string;
}

export interface AssetPackFormalGateInput {
  readonly workbench: AssetPackWorkbenchRevision;
  readonly originalReleaseFingerprint?: string;
  readonly originalUploadMetadata?: AssetPackWorkerUploadMetadata;
  readonly unsafe?: boolean;
}

export function suggestNextAssetPackPatchVersion(version: string): string | undefined {
  const parsed = parseAssetPackSemver(version);
  if (!parsed) return undefined;
  return `${String(parsed.major)}.${String(parsed.minor)}.${String(parsed.patch + 1)}`;
}

export function assetPackFormalBlockers(
  input: AssetPackFormalGateInput,
): readonly AssetPackFormalBlocker[] {
  const { workbench } = input;
  const blockers: AssetPackFormalBlocker[] = [];
  const document = parseManifest(workbench.manifestText);
  const currentVersion = typeof document?.version === 'string' ? document.version : undefined;
  const currentVersionValid = currentVersion !== undefined && parseAssetPackSemver(currentVersion) !== undefined;

  if (input.unsafe) blockers.push({ code: 'unsafe-archive', message: 'The uploaded archive is unsafe and cannot be formalized.' });
  if (workbench.diagnostics.some((diagnostic) => diagnostic.severity === 'error')) {
    blockers.push({ code: 'validation-error', message: 'Resolve all validation errors before formal download.' });
  }
  const warnings = workbench.diagnostics.filter((diagnostic) => diagnostic.severity === 'warning');
  if (warnings.some((warning) => !warningAcknowledged(warning, workbench))) {
    blockers.push({ code: 'unacknowledged-warning', message: 'Acknowledge every current warning before formal download.' });
  }
  if (!workbench.formalCandidate) {
    blockers.push({ code: 'missing-candidate', message: 'The current revision has no verified formal archive candidate.' });
  } else if (workbench.formalCandidate.revision !== workbench.revision) {
    blockers.push({ code: 'candidate-revision-stale', message: 'The formal archive candidate belongs to an older revision.' });
  }
  if (document?.status === 'draft' || workbench.uploadMetadata.uploadedStatus === 'draft') {
    blockers.push({ code: 'draft-status', message: 'Formal output must omit draft status.' });
  }
  if (!workbench.draftSerializable) {
    blockers.push({ code: 'not-serializable', message: 'The current manifest cannot be serialized safely.' });
  }
  if (!currentVersionValid) {
    blockers.push({ code: 'invalid-version', message: 'Set a valid SemVer version before formal download.' });
  }

  if (currentVersionValid && requiresVersionIncrease(input)) {
    blockers.push({ code: 'version-increase-required', message: 'Increase the version before formal download.' });
  }
  return blockers;

  function requiresVersionIncrease(gate: AssetPackFormalGateInput): boolean {
    const originalUpload = gate.originalUploadMetadata ?? gate.workbench.uploadMetadata;
    const uploaded = originalUpload.uploadedVersion;
    if (!uploaded || !parseAssetPackSemver(uploaded) || !currentVersion) return false;
    const releaseChanged = gate.originalReleaseFingerprint !== undefined
      && gate.workbench.releaseFingerprint !== undefined
      && gate.originalReleaseFingerprint !== gate.workbench.releaseFingerprint;
    const formalBytesChanged = gate.workbench.formalCandidate !== undefined
      && (gate.workbench.formalCandidate.byteIdenticalToUploadedFormal === false
        || gate.workbench.formalCandidate.archiveDigest !== originalUpload.originalArchiveDigest);
    const draftUpload = originalUpload.uploadedStatus === 'draft';
    return (releaseChanged || formalBytesChanged || draftUpload)
      && compareAssetPackVersions(currentVersion, uploaded) <= 0;
  }
}

export function canAcknowledgeAssetPackWarning(
  input: AssetPackFormalGateInput,
  _candidate: AssetPackAcknowledgement,
): boolean {
  return !assetPackFormalBlockers(input).some(({ code }) => code === 'version-increase-required');
}

function parseManifest(text: string): Readonly<Record<string, unknown>> | undefined {
  try {
    const value: unknown = JSON.parse(text);
    if (typeof value !== 'object' || value === null || Array.isArray(value)) return undefined;
    return value as Readonly<Record<string, unknown>>;
  } catch {
    return undefined;
  }
}

function warningAcknowledged(
  warning: AssetPackWorkbenchRevision['diagnostics'][number],
  workbench: AssetPackWorkbenchRevision,
): boolean {
  return workbench.acknowledgementRecords.some((record) => record.code === warning.code
    && warning.subject !== undefined
    && canonical(record.subject) === canonical(warning.subject)
    && record.contentDigest === workbench.contentDigest
    && record.reason.trim().length > 0);
}

function canonical(value: Readonly<Record<string, string | readonly string[]>>): string {
  return JSON.stringify(Object.fromEntries(Object.entries(value)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, entry]) => [key, Array.isArray(entry) ? [...entry] : entry])));
}
