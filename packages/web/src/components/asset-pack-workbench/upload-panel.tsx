import { useCallback, useMemo, useState, type ChangeEvent, type DragEvent } from 'react';
import { ASSET_PACK_ARCHIVE_LIMITS } from '@lpc-toolkit/asset-pack-format';
import type { AssetPackWorkbenchPhase } from '../../slice/asset-pack-workbench';
import { Button } from '../ui/button';

export const MAX_ASSET_PACK_UPLOAD_BYTES = ASSET_PACK_ARCHIVE_LIMITS.archiveBytes;

export type AssetPackUploadDecision = 'accepted' | 'too-large' | 'already-loaded';

export interface AssetPackUploadPanelProps {
  readonly currentFile: File | undefined;
  readonly phase: AssetPackWorkbenchPhase;
  readonly progressText: string;
  readonly onUpload: (file: File) => void;
  readonly onReset: () => void;
  readonly onBack: () => void;
}

export function createAssetPackUploadHandler(options: {
  readonly currentFile: File | undefined;
  readonly onUpload: (file: File) => void;
}): (file: File) => AssetPackUploadDecision {
  return (file) => {
    if (options.currentFile) return 'already-loaded';
    if (file.size > MAX_ASSET_PACK_UPLOAD_BYTES) return 'too-large';
    options.onUpload(file);
    return 'accepted';
  };
}

function formatLimit(bytes: number): string {
  return `${Math.round(bytes / (1024 * 1024))} MiB`;
}

export function AssetPackUploadPanel({
  currentFile,
  phase,
  progressText,
  onUpload,
  onReset,
  onBack,
}: AssetPackUploadPanelProps) {
  const [notice, setNotice] = useState<string>();
  const handleFile = useMemo(
    () => createAssetPackUploadHandler({
      currentFile,
      onUpload: (file) => {
        setNotice(undefined);
        onUpload(file);
      },
    }),
    [currentFile, onUpload],
  );

  const handleCandidate = useCallback((file: File) => {
    const decision = handleFile(file);
    if (decision === 'too-large') {
      setNotice(`That archive is larger than the ${formatLimit(MAX_ASSET_PACK_UPLOAD_BYTES)} limit.`);
    } else if (decision === 'already-loaded') {
      setNotice('A pack is already open. Reset it before choosing another archive.');
    }
  }, [handleFile]);

  const handleChange = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = '';
    if (file) handleCandidate(file);
  }, [handleCandidate]);

  const handleDrop = useCallback((event: DragEvent<HTMLLabelElement>) => {
    event.preventDefault();
    const file = event.dataTransfer.files[0];
    if (file) handleCandidate(file);
  }, [handleCandidate]);

  return (
    <section aria-labelledby="asset-pack-upload-heading" className="rounded-md border border-border bg-surface p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="asset-pack-upload-heading" className="text-xl font-semibold text-text">
            Upload an asset pack
          </h2>
          <p className="mt-1 text-sm text-text-2">
            Choose a formal or draft archive to inspect and repair in the browser.
          </p>
        </div>
        <span className="rounded-full border border-border px-2 py-1 text-xs text-text-mute">
          {phase === 'empty' ? 'Ready' : 'Pack open'}
        </span>
      </div>

      <label
        htmlFor="asset-pack-file"
        onDragOver={(event) => event.preventDefault()}
        onDrop={handleDrop}
        className="mt-5 block cursor-pointer rounded-md border border-dashed border-border bg-surface-2 p-6 text-center hover:border-[var(--accent)]"
      >
        <span className="block text-sm font-semibold text-text">Drop an asset pack here</span>
        <span className="mt-1 block text-sm text-text-2">or choose a .lpc-assets.zip file</span>
        <input
          id="asset-pack-file"
          className="sr-only"
          type="file"
          accept=".lpc-assets.zip,.draft.lpc-assets.zip"
          onChange={handleChange}
        />
      </label>

      <p className="mt-3 text-xs text-text-mute">
        Archive size limit: {formatLimit(MAX_ASSET_PACK_UPLOAD_BYTES)}. Files are checked before the Worker reads them.
      </p>
      {currentFile && (
        <p className="mt-2 text-sm text-text-2">
          Current pack: <span className="font-medium text-text">{currentFile.name}</span>. Reset before selecting a different pack.
        </p>
      )}
      {notice && <p className="mt-3 text-sm text-text-2">{notice}</p>}

      <div role="status" aria-live="polite" className="mt-5 flex items-center gap-2 text-sm text-text-2">
        <span aria-hidden="true">◌</span>
        <span>{progressText}</span>
      </div>

      <div className="mt-5 flex flex-wrap gap-3">
        <Button type="button" onClick={onReset}>Reset</Button>
        <Button type="button" variant="ghost" onClick={onBack}>Back</Button>
      </div>
    </section>
  );
}
