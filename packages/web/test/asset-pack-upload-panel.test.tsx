import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import {
  AssetPackUploadPanel,
  createAssetPackUploadHandler,
  MAX_ASSET_PACK_UPLOAD_BYTES,
  type AssetPackUploadPanelProps,
} from '../src/components/asset-pack-workbench/upload-panel';

const baseProps: AssetPackUploadPanelProps = {
  currentFile: undefined,
  phase: 'empty',
  progressText: 'Waiting for an asset pack.',
  onUpload: vi.fn(),
  onReset: vi.fn(),
  onBack: vi.fn(),
};

describe('AssetPackUploadPanel', () => {
  it('renders one constrained archive input, labeled drop zone, help, progress, and actions', () => {
    const html = renderToStaticMarkup(<AssetPackUploadPanel {...baseProps} />);

    expect(html.match(/type="file"/g)).toHaveLength(1);
    expect(html).toContain('accept=".lpc-assets.zip,.draft.lpc-assets.zip"');
    expect(html).toContain('Drop an asset pack here');
    expect(html).toContain('Archive size limit');
    expect(html).toContain('role="status"');
    expect(html).toContain('aria-live="polite"');
    expect(html).toContain('Reset');
    expect(html).toContain('Back');
    expect(html).toContain('Waiting for an asset pack.');
  });

  it('accepts one File only after the declared size gate', () => {
    const onUpload = vi.fn();
    const handleFile = createAssetPackUploadHandler({
      currentFile: undefined,
      onUpload,
    });
    const file = new File(['valid'], 'pack.lpc-assets.zip');

    handleFile(file);

    expect(onUpload).toHaveBeenCalledTimes(1);
    expect(onUpload).toHaveBeenCalledWith(file);
    expect(MAX_ASSET_PACK_UPLOAD_BYTES).toBeGreaterThan(file.size);
  });

  it('rejects oversized files and does not read or send them', () => {
    const onUpload = vi.fn();
    const handleFile = createAssetPackUploadHandler({
      currentFile: undefined,
      onUpload,
    });
    const oversized = { name: 'too-large.lpc-assets.zip', size: MAX_ASSET_PACK_UPLOAD_BYTES + 1 } as File;

    expect(handleFile(oversized)).toBe('too-large');
    expect(onUpload).not.toHaveBeenCalled();
  });

  it('does not silently replace an active pack after a second drop', () => {
    const onUpload = vi.fn();
    const currentFile = new File(['first'], 'first.lpc-assets.zip');
    const handleFile = createAssetPackUploadHandler({ currentFile, onUpload });

    expect(handleFile(new File(['second'], 'second.lpc-assets.zip'))).toBe('already-loaded');
    expect(onUpload).not.toHaveBeenCalled();
  });
});
