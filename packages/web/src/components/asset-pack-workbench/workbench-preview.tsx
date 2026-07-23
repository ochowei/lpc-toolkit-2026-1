import { useEffect, useRef, useState } from 'react';
import type { ChangeEvent } from 'react';
import type { Direction } from '@lpc-toolkit/core';
import type { BrowserAssetPackBaseline } from '../../lib/asset-pack-baseline';
import { useAnimationPlayer } from '../../hooks/use-animation-player';
import { useAssetPackPreview } from '../../hooks/use-asset-pack-preview';
import type { AssetPackWorkbenchState } from '../../slice/asset-pack-workbench';
import { AttributionPanel } from './attribution-panel';
import { AssetPackUploadPanel } from './upload-panel';
import { AssetPackDownloadBar } from './download-bar';
import type { AssetPackDownloadKind } from '../../lib/asset-pack-download';

const progressLabels: Readonly<Record<NonNullable<AssetPackWorkbenchState['progress']>['stage'], string>> = {
  'reading-archive': 'Reading archive',
  'inspecting-archive': 'Inspecting archive',
  'verifying-checksums': 'Verifying checksums',
  'inspecting-sources': 'Inspecting source files',
  'compiling-preview': 'Compiling preview',
  'assembling-archive': 'Assembling archive',
};

export function workerProgressText(state: AssetPackWorkbenchState): string {
  return state.progress
    ? progressLabels[state.progress.stage]
    : state.phase === 'empty'
      ? 'Waiting for an asset pack.'
      : state.phase === 'failed'
        ? state.error ?? 'Worker could not finish the current request.'
        : 'The Worker is ready for the next action.';
}

function statusIcon(state: AssetPackWorkbenchState): string {
  if (state.phase === 'failed' || state.phase === 'unsafe') return '⚠';
  if (state.phase === 'editing') return '✓';
  return '◌';
}

export function WorkbenchPreview({
  baseline,
  state,
  onUpload,
  onReset,
  onBack,
  onDownload,
  downloadError,
}: {
  readonly baseline?: BrowserAssetPackBaseline;
  readonly state: AssetPackWorkbenchState;
  readonly onUpload: (file: File) => void;
  readonly onReset: () => void;
  readonly onBack: () => void;
  readonly onDownload: (kind: AssetPackDownloadKind) => void;
  readonly downloadError?: string;
}) {
  const sourceCount = state.workbench?.sourceSummaries.length ?? 0;
  const diagnosticCount = state.workbench?.diagnostics.length ?? state.diagnostics.length;

  return (
    <main aria-label="Asset pack preview" className="min-w-0 bg-app p-4 sm:p-6">
      <div className="mx-auto max-w-3xl">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-text-mute">LPC Toolkit</p>
            <h1 className="mt-2 text-3xl font-semibold text-text">Asset Pack Workbench</h1>
            <p className="mt-2 text-sm text-text-2">Repair a pack locally, preserve its attribution, and assemble a new archive when it is ready.</p>
          </div>
          <div className="flex items-center gap-2 rounded-full border border-border bg-surface px-3 py-2 text-sm text-text-2">
            <span aria-hidden="true">{statusIcon(state)}</span>
            <span>{sourceCount} sources · {diagnosticCount} diagnostics</span>
          </div>
        </div>
        <div className="mt-6">
          <AssetPackUploadPanel
            currentFile={state.originalFile}
            phase={state.phase}
            progressText={workerProgressText(state)}
            onUpload={onUpload}
            onReset={onReset}
            onBack={onBack}
          />
        </div>
        <AssetPackDownloadBar state={state} onDownload={onDownload} {...(downloadError ? { downloadError } : {})} />
        {baseline ? <PackPreviewContent baseline={baseline} state={state} /> : null}
      </div>
    </main>
  );
}

function PackPreviewContent({
  baseline,
  state,
}: {
  readonly baseline: BrowserAssetPackBaseline;
  readonly state: AssetPackWorkbenchState;
}) {
  const payload = state.workbench?.preview;
  const [focusedAssetId, setFocusedAssetId] = useState<string | undefined>();
  const [bodyType, setBodyType] = useState('male');
  const [animation, setAnimation] = useState('walk');
  const [direction, setDirection] = useState<Direction>('down');
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    setFocusedAssetId(payload?.compilePlan.definitions[0]?.assetId);
  }, [payload?.revision]);

  const focusedAssetIsCurrent = payload?.compilePlan.definitions.some((definition) => definition.assetId === focusedAssetId) ?? false;
  const activeFocusedAssetId = focusedAssetIsCurrent
    ? focusedAssetId
    : payload?.compilePlan.definitions[0]?.assetId;

  const preview = useAssetPackPreview({
    baseline,
    ...(payload ? { payload } : {}),
    ...(activeFocusedAssetId ? { focusedAssetId: activeFocusedAssetId } : {}),
    bodyType,
    animation,
  });
  const player = useAnimationPlayer(canvasRef, preview.result.animation, direction, true, 4);

  if (!payload) return null;

  const onImport = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.currentTarget.files?.[0];
    if (file) void preview.importCharacter(file);
  };

  return (
    <section aria-label="Current revision preview" className="mt-6 rounded-xl border border-border bg-surface p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-lg font-semibold text-text">Current revision preview</h2>
        <span className="text-xs text-text-mute">Revision {payload.revision}</span>
      </div>
      <div className="mt-4 grid gap-4 sm:grid-cols-3">
        <label className="text-xs text-text-2">Asset
          <select className="mt-1 block w-full rounded border border-border bg-app p-2 text-sm" value={activeFocusedAssetId ?? ''} onChange={(event) => setFocusedAssetId(event.currentTarget.value || undefined)}>
            {payload.compilePlan.definitions.map((definition) => (
              <option key={definition.assetId} value={definition.assetId}>{definition.definition.display_name ?? definition.definition.name}</option>
            ))}
          </select>
        </label>
        <label className="text-xs text-text-2">Body type
          <select className="mt-1 block w-full rounded border border-border bg-app p-2 text-sm" value={bodyType} onChange={(event) => setBodyType(event.currentTarget.value)}>
            {preview.bodyTypeOptions.map((option) => <option key={option}>{option}</option>)}
          </select>
        </label>
        <label className="text-xs text-text-2">Animation
          <select className="mt-1 block w-full rounded border border-border bg-app p-2 text-sm" value={animation} onChange={(event) => setAnimation(event.currentTarget.value)}>
            {preview.animationOptions.map((option) => <option key={option}>{option}</option>)}
          </select>
        </label>
        <label className="text-xs text-text-2">Direction
          <select className="mt-1 block w-full rounded border border-border bg-app p-2 text-sm" value={direction} onChange={(event) => setDirection(event.currentTarget.value as Direction)}>
            {preview.directionOptions.map((option) => <option key={option}>{option}</option>)}
          </select>
        </label>
        <label className="text-xs text-text-2 sm:col-span-2">Import canonical character JSON
          <input className="mt-1 block w-full text-sm" type="file" accept="application/json,.json" onChange={onImport} />
        </label>
      </div>
      <div className="mt-5 flex min-h-64 items-center justify-center rounded-lg bg-app p-4">
        {preview.result.status === 'ready' ? <canvas ref={canvasRef} aria-label="Composed asset pack animation" /> : null}
        {preview.result.status === 'pending' ? <p role="status">Composing current revision…</p> : null}
        {preview.result.status === 'error' ? <p role="alert">{preview.result.error}</p> : null}
      </div>
      <p className="mt-2 text-xs text-text-mute">Frame {player.currentFrame + 1} of {player.totalFrames || 0} at {player.fps} FPS</p>
      <AttributionPanel
        credits={preview.result.credits}
        effectiveLicense={preview.result.effectiveLicense}
        releaseTag={baseline.releaseTag}
        error={preview.result.status === 'error' ? preview.result.error : null}
      />
    </section>
  );
}
