import { useState } from 'react';
import { parseAssetPackSource, type AssetPackSource } from '@lpc-toolkit/core';
import {
  acknowledgeCurrentWarning,
  applyAssetPackAdvancedProjection,
  projectAssetPackAdvanced,
  projectAssetPackCredits,
  projectAssetPackOverview,
  serializeAssetPackManifest,
} from '../../lib/asset-pack-manifest-editor';
import { type AssetPackWorkbenchDiagnostic, type AssetPackWorkbenchRevision } from '../../lib/asset-pack-worker-protocol';
import type { AssetPackWorkbenchPanel, AssetPackWorkbenchState } from '../../slice/asset-pack-workbench';
import { assetPackDiagnosticPanel, diagnosticPanelTargetId, diagnosticTargetId, DiagnosticList, DiagnosticTarget } from './diagnostic-list';
import { CreditsEditor } from './credits-editor';
import { ManifestJsonEditor } from './manifest-json-editor';
import { OverviewEditor } from './overview-editor';
import { SourceList } from './source-list';
import { WarningsEditor } from './warnings-editor';
import { ASSET_PACK_PANEL_LABELS } from './workbench-nav';

export interface WorkbenchEditorProps {
  readonly state: AssetPackWorkbenchState;
  readonly onReplaceManifest?: ((manifestText: string, origin: 'overview-form' | 'credits-form' | 'advanced-json' | 'raw-repair' | 'acknowledgement') => void) | undefined;
  readonly onReplaceSource?: ((path: string, file: File) => void) | undefined;
  readonly onRemoveSource?: ((path: string) => void) | undefined;
  readonly onNavigate?: ((panel: AssetPackWorkbenchPanel) => void) | undefined;
}

export function workbenchEditorErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'The editor could not prepare this change.';
}

export function WorkbenchEditor({ state, onReplaceManifest, onReplaceSource, onRemoveSource, onNavigate }: WorkbenchEditorProps) {
  const [manifestMode, setManifestMode] = useState<'advanced' | 'raw-repair'>('advanced');
  const [editError, setEditError] = useState<string | undefined>();
  const workbench = state.workbench;
  const diagnostics = workbench?.diagnostics ?? state.diagnostics;
  const source = workbench ? parseSource(workbench) : undefined;
  const sourceCount = workbench?.sourceSummaries.length ?? 0;
  const warningCount = diagnostics.filter(({ severity }) => severity === 'warning').length;
  const errorCount = diagnostics.filter(({ severity }) => severity === 'error').length;

  const submitManifest = (manifestText: string, origin: Parameters<NonNullable<WorkbenchEditorProps['onReplaceManifest']>>[1]) => {
    try {
      onReplaceManifest?.(manifestText, origin);
      setEditError(undefined);
    } catch (error) {
      setEditError(workbenchEditorErrorMessage(error));
    }
  };
  const submitSource = (nextSource: AssetPackSource, origin: Parameters<NonNullable<WorkbenchEditorProps['onReplaceManifest']>>[1]) => {
    try {
      submitManifest(serializeAssetPackManifest(nextSource), origin);
    } catch (error) {
      setEditError(workbenchEditorErrorMessage(error));
    }
  };
  const warningCandidates = workbench?.acknowledgementRecords.filter((candidate) => diagnostics.some((diagnostic) => diagnostic.severity === 'warning' && diagnostic.code === candidate.code && canonical(diagnostic.subject) === canonical(candidate.subject))) ?? [];
  const versionBlocked = state.formalBlockers.some(({ code }) => code === 'invalid-version' || code === 'version-increase-required');

  const selectDiagnostic = (diagnostic: AssetPackWorkbenchDiagnostic) => {
    const panel = assetPackDiagnosticPanel(diagnostic);
    onNavigate?.(panel);
    if (typeof document !== 'undefined') {
      const focusTarget = () => {
        const target = document.getElementById(diagnosticPanelTargetId(diagnostic));
        if (target) target.focus();
        else document.getElementById(diagnosticTargetId(diagnostic))?.focus();
      };
      queueMicrotask(() => {
        focusTarget();
        if (!document.getElementById(diagnosticPanelTargetId(diagnostic)) && typeof window !== 'undefined') window.requestAnimationFrame(focusTarget);
      });
    }
  };

  return <aside aria-label="Asset pack editor" className="border-t border-border bg-surface p-5 lg:border-l lg:border-t-0">
    <h2 className="text-xl font-semibold text-text">Asset pack editor</h2>
    <p className="mt-2 text-sm text-text-2">{ASSET_PACK_PANEL_LABELS[state.activePanel]} is selected. Changes are checked by the Worker before they become a new revision.</p>
    <dl className="mt-5 grid grid-cols-3 gap-3 text-center text-sm">
      <div className="rounded-md border border-border bg-surface-2 p-3"><dt className="text-text-mute">Sources</dt><dd className="mt-1 font-semibold text-text">{sourceCount}</dd></div>
      <div className="rounded-md border border-border bg-surface-2 p-3"><dt className="text-text-mute">Warnings</dt><dd className="mt-1 font-semibold text-text">{warningCount}</dd></div>
      <div className="rounded-md border border-border bg-surface-2 p-3"><dt className="text-text-mute">Errors</dt><dd className="mt-1 font-semibold text-text">{errorCount}</dd></div>
    </dl>
    {workbench && <div className="mt-6 space-y-6">
      {state.activePanel === 'overview' && (source ? <OverviewEditor revision={workbench.revision} projection={projectAssetPackOverview(source)} diagnostics={diagnostics} onSubmit={(projection) => {
        const { compatibility: _oldCompatibility, ...withoutCompatibility } = source;
        const { compatibility, ...overviewFields } = projection;
        submitSource(compatibility ? { ...withoutCompatibility, ...overviewFields, compatibility } : { ...withoutCompatibility, ...overviewFields }, 'overview-form');
      }} /> : <DiagnosticTargets diagnostics={diagnostics.filter((diagnostic) => diagnostic.scope === 'archive' || diagnostic.scope === 'release')} />)}
      {state.activePanel === 'manifest' && <div className="space-y-3"><div className="flex gap-2">{source && <button type="button" className="rounded border border-border px-2 py-1 text-xs text-text" aria-pressed={manifestMode === 'advanced'} onClick={() => setManifestMode('advanced')}>Advanced</button>}<button type="button" className="rounded border border-border px-2 py-1 text-xs text-text" aria-pressed={!source || manifestMode === 'raw-repair'} onClick={() => setManifestMode('raw-repair')}>Raw repair</button></div><ManifestJsonEditor revision={workbench.revision} mode={source ? manifestMode : 'raw-repair'} projection={source ? projectAssetPackAdvanced(source) : undefined} manifestText={workbench.manifestText} diagnostics={diagnostics.filter((diagnostic) => diagnostic.scope === 'manifest')} onSubmit={(text, origin) => {
        if (origin === 'raw-repair') submitManifest(text, origin);
        else {
          if (!source) {
            setEditError('Advanced fields require a valid manifest. Use raw repair for this revision.');
            return;
          }
          try {
            const value: unknown = JSON.parse(text);
            if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new Error('Advanced JSON must be an object.');
            submitSource(applyAssetPackAdvancedProjection(source, value as Readonly<Record<string, unknown>>), origin);
          } catch (error) {
            setEditError(workbenchEditorErrorMessage(error));
          }
        }
      }} /></div>}
      {state.activePanel === 'sources' && <SourceList summaries={workbench.sourceSummaries} diagnostics={diagnostics.filter((diagnostic) => diagnostic.scope === 'source')} onReplace={(path, file) => onReplaceSource?.(path, file)} onRemove={(path) => onRemoveSource?.(path)} />}
      {state.activePanel === 'warnings' && (source ? <WarningsEditor revision={workbench.revision} warnings={warningCandidates} acknowledgementRecords={workbench.acknowledgementRecords} diagnostics={diagnostics.filter((diagnostic) => diagnostic.scope === 'warning')} versionBlocked={versionBlocked} onAcknowledge={(candidate, reason) => {
        try {
          submitSource(acknowledgeCurrentWarning(source, candidate, reason), 'acknowledgement');
        } catch (error) {
          setEditError(workbenchEditorErrorMessage(error));
        }
      }} /> : <DiagnosticTargets diagnostics={diagnostics.filter((diagnostic) => diagnostic.scope === 'warning')} />)}
      {state.activePanel === 'credits' && (source ? <CreditsEditor revision={workbench.revision} credits={projectAssetPackCredits(source)} diagnostics={diagnostics.filter((diagnostic) => diagnostic.scope === 'credit')} onSubmit={(credits) => submitSource({ ...source, credits }, 'credits-form')} onNavigateOverrides={() => onNavigate?.('manifest')} /> : <DiagnosticTargets diagnostics={diagnostics.filter((diagnostic) => diagnostic.scope === 'credit')} />)}
    </div>}
    <DiagnosticList diagnostics={diagnostics} error={editError} onSelect={selectDiagnostic} />
  </aside>;
}

function DiagnosticTargets({ diagnostics }: { readonly diagnostics: readonly AssetPackWorkbenchDiagnostic[] }) {
  return <div aria-label="Diagnostic corrective targets">{diagnostics.map((diagnostic) => <DiagnosticTarget key={diagnosticTargetId(diagnostic)} diagnostic={diagnostic}><span className="sr-only">{diagnostic.message}</span></DiagnosticTarget>)}</div>;
}

function parseSource(workbench: AssetPackWorkbenchRevision): AssetPackSource | undefined {
  try {
    const value: unknown = JSON.parse(workbench.manifestText);
    const parsed = parseAssetPackSource(value);
    return parsed.ok ? parsed.source : undefined;
  } catch {
    return undefined;
  }
}

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (typeof value === 'object' && value !== null) return `{${Object.entries(value as Readonly<Record<string, unknown>>).sort(([left], [right]) => left.localeCompare(right)).map(([key, entry]) => `${JSON.stringify(key)}:${canonical(entry)}`).join(',')}}`;
  return JSON.stringify(value);
}
