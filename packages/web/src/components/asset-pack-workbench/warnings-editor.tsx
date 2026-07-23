import { useEffect, useState } from 'react';
import type { AssetPackAcknowledgement } from '@lpc-toolkit/core';
import type { AssetPackWorkbenchDiagnostic } from '../../lib/asset-pack-worker-protocol';
import { diagnosticTargetId, DiagnosticTarget } from './diagnostic-list';

export interface WarningsEditorProps {
  readonly warnings: readonly AssetPackAcknowledgement[];
  readonly acknowledgementRecords: readonly AssetPackAcknowledgement[];
  readonly diagnostics?: readonly AssetPackWorkbenchDiagnostic[] | undefined;
  readonly revision?: number | undefined;
  readonly versionBlocked: boolean;
  readonly onAcknowledge: (candidate: AssetPackAcknowledgement, reason: string) => void;
}

export function WarningsEditor({ warnings, acknowledgementRecords, diagnostics = [], revision = 0, versionBlocked, onAcknowledge }: WarningsEditorProps) {
  const [reasons, setReasons] = useState<Readonly<Record<string, string>>>({});
  const warningsKey = JSON.stringify(warnings.map((warning) => acknowledgementKey(warning)).sort());
  useEffect(() => {
    setReasons((current) => synchronizeWarningReasons(current, warnings, revision));
  }, [revision, warningsKey]);
  return (
    <section aria-labelledby="asset-pack-warnings-heading">
      <h3 id="asset-pack-warnings-heading" className="text-lg font-semibold text-text">Warnings</h3>
      <p className="mt-1 text-sm text-text-2">Review each current warning and record its reason individually.</p>
      <div className="mt-4 space-y-3">{warnings.map((warning) => {
        const key = warningCandidateKey(warning, revision);
        const imported = acknowledgementRecords.find((record) => acknowledgementKey(record) === acknowledgementKey(warning));
        const reason = reasons[key] ?? imported?.reason ?? '';
        const confirmed = imported !== undefined && imported.reason.trim().length !== 0;
        const warningDiagnostics = diagnostics.filter((entry) => entry.code === warning.code && canonical(entry.subject) === canonical(warning.subject));
        return <article key={key} className="rounded border border-border bg-surface-2 p-3">
          {warningDiagnostics.map((diagnostic) => <DiagnosticTarget key={diagnosticTargetId(diagnostic)} diagnostic={diagnostic}><span className="sr-only">{diagnostic.message}</span></DiagnosticTarget>)}
          <h4 className="font-mono text-sm font-semibold text-text">{warning.code}</h4>
          <dl className="mt-2 space-y-1 text-xs text-text-2">
            <div><dt className="inline font-semibold">Subject: </dt><dd className="inline font-mono">{JSON.stringify(warning.subject)}</dd></div>
            <div><dt className="inline font-semibold">Scope: </dt><dd className="inline">warning</dd></div>
            <div><dt className="inline font-semibold">Content digest: </dt><dd className="inline font-mono">{warning.contentDigest}</dd></div>
          </dl>
          <label className="mt-3 block text-sm text-text">Reason<input name={`reason-${key}`} value={reason} onChange={(event) => setReasons((current) => ({ ...current, [key]: event.currentTarget.value }))} className="mt-1 w-full rounded border border-border bg-surface px-2 py-1" /></label>
          {confirmed && <p className="mt-2 text-xs text-green-700">Confirmed</p>}
          {versionBlocked && <p className="mt-2 text-xs text-red-700">Set the release version first before confirming this warning.</p>}
          <button type="button" disabled={versionBlocked || confirmed || reason.trim().length === 0} className="mt-3 rounded bg-accent px-3 py-2 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50" onClick={() => onAcknowledge(warning, reason)}>Confirm</button>
        </article>;
      })}
      {diagnostics.filter((diagnostic) => !warnings.some((warning) => warning.code === diagnostic.code && canonical(warning.subject) === canonical(diagnostic.subject))).map((diagnostic) => <DiagnosticTarget key={diagnosticTargetId(diagnostic)} diagnostic={diagnostic}><span className="sr-only">{diagnostic.message}</span></DiagnosticTarget>)}
      </div>
    </section>
  );
}

function warningBindingKey(warning: AssetPackAcknowledgement): string {
  return `${warning.code}\u0000${JSON.stringify(warning.subject)}`;
}

export function warningCandidateKey(warning: AssetPackAcknowledgement, revision: number): string {
  return `${revision}\u0000${acknowledgementKey(warning)}`;
}

export function synchronizeWarningReasons(current: Readonly<Record<string, string>>, warnings: readonly AssetPackAcknowledgement[], revision: number): Readonly<Record<string, string>> {
  const currentKeys = new Set(warnings.map((warning) => warningCandidateKey(warning, revision)));
  return Object.fromEntries(Object.entries(current).filter(([key]) => currentKeys.has(key)));
}

function acknowledgementKey(warning: AssetPackAcknowledgement): string {
  return `${warningBindingKey(warning)}\u0000${warning.contentDigest}`;
}

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (typeof value === 'object' && value !== null) return `{${Object.entries(value as Readonly<Record<string, unknown>>).sort(([left], [right]) => left.localeCompare(right)).map(([key, entry]) => `${JSON.stringify(key)}:${canonical(entry)}`).join(',')}}`;
  return JSON.stringify(value);
}
