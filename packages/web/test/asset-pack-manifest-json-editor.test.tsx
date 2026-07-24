import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { AssetPackAdvancedProjection } from '../src/lib/asset-pack-manifest-editor';
import {
  ManifestJsonEditor,
  formatAdvancedProjection,
  rawRepairCanSubmit,
  synchronizeManifestDraft,
} from '../src/components/asset-pack-workbench/manifest-json-editor';
import { renderToStaticMarkup as renderMarkup } from 'react-dom/server';
import { WorkbenchEditor } from '../src/components/asset-pack-workbench/workbench-editor';
import { createAssetPackWorkbenchState } from '../src/slice/asset-pack-workbench';

const projection: AssetPackAdvancedProjection = { assets: [], replaces: [] };

describe('ManifestJsonEditor', () => {
  it('formats only the advanced projection with two spaces and a final newline', () => {
    expect(formatAdvancedProjection(projection)).toBe('{\n  "assets": [],\n  "replaces": []\n}\n');
    const html = renderToStaticMarkup(<ManifestJsonEditor
      mode="advanced"
      projection={projection}
      manifestText="{}"
      onSubmit={vi.fn()}
    />);

    expect(html).toContain('Advanced manifest fields');
    expect(html).not.toContain('acknowledgements');
    expect(html).not.toContain('status');
  });

  it('refuses raw repair text that changes the acknowledgement array', () => {
    const current = '{"acknowledgements":[]}';
    expect(rawRepairCanSubmit(current, '{"acknowledgements":[{"code":"asset_path_inferred"}]}')).toBe(false);
    expect(rawRepairCanSubmit(current, '{"acknowledgements":[]}')).toBe(true);
    expect(rawRepairCanSubmit('{"broken":', '{"schema":"lpc-toolkit.asset-pack.v1","assets":[]}')).toBe(true);
  });

  it('synchronizes a clean draft and protects active typing from a new revision', () => {
    expect(synchronizeManifestDraft('old', 'new', false)).toEqual({ text: 'new', conflict: false });
    expect(synchronizeManifestDraft('typed', 'new', true)).toEqual({ text: 'typed', conflict: true });
  });

  it('keeps raw repair available when the manifest cannot be parsed', () => {
    const state = {
      ...createAssetPackWorkbenchState(),
      activePanel: 'manifest' as const,
      workbench: {
        revision: 4,
        manifestText: '{"broken":',
        uploadMetadata: { originalArchiveDigest: `sha256:${'a'.repeat(64)}` as `sha256:${string}`, baselineReleaseTag: 'test' },
        sourceSummaries: [],
        diagnostics: [{ code: 'asset_pack_manifest_json_invalid', severity: 'error' as const, message: 'Invalid JSON', scope: 'manifest' as const }],
        acknowledgementRecords: [],
        draftSerializable: false,
      },
    };
    const html = renderMarkup(<WorkbenchEditor state={state} />);
    expect(html).toContain('Raw manifest repair');
    expect(html).toContain('Manifest JSON');
  });
});
