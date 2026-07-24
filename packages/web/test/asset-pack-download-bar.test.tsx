import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { AssetPackDownloadBar } from '../src/components/asset-pack-workbench/download-bar';
import { createAssetPackWorkbenchState } from '../src/slice/asset-pack-workbench';

const candidate = {
  revision: 0,
  archiveDigest: `sha256:${'a'.repeat(64)}` as `sha256:${string}`,
  filename: 'acme.hair-1.2.4.lpc-assets.zip',
  version: '1.2.4',
  byteIdenticalToUploadedFormal: true,
  uploadMetadata: { originalArchiveDigest: `sha256:${'a'.repeat(64)}` as `sha256:${string}`, baselineReleaseTag: 'test' },
};

function state() {
  return {
    ...createAssetPackWorkbenchState(),
    phase: 'editing' as const,
    revision: 0,
    ready: true,
    workbench: {
      revision: 0,
      manifestText: '{"id":"acme.hair","version":"1.2.4"}',
      uploadMetadata: candidate.uploadMetadata,
      sourceSummaries: [],
      diagnostics: [{ code: 'warning', severity: 'warning' as const, message: 'Review this warning', scope: 'warning' as const }],
      acknowledgementRecords: [],
      formalCandidate: candidate,
      draftSerializable: true,
    },
    diagnostics: [{ code: 'warning', severity: 'warning' as const, message: 'Review this warning', scope: 'warning' as const }],
    formalBlockers: [],
  };
}

describe('AssetPackDownloadBar', () => {
  it('enables draft only when serializable and formal only for a current formal candidate', () => {
    const html = renderToStaticMarkup(<AssetPackDownloadBar state={state()} onDownload={vi.fn()} />);
    expect(html).toContain('Download draft archive');
    expect(html).toContain('Download formal archive');
    expect(html).toContain('Review this warning');
    expect(html).not.toContain('disabled=""');

    const assembling = renderToStaticMarkup(<AssetPackDownloadBar state={{ ...state(), phase: 'assembling' }} onDownload={vi.fn()} />);
    expect(assembling.match(/disabled=""/g)).toHaveLength(2);

    const stale = renderToStaticMarkup(<AssetPackDownloadBar state={{ ...state(), revision: 1 }} onDownload={vi.fn()} />);
    const buttons = stale.match(/<button[^>]*>/g) ?? [];
    expect(buttons[0]).not.toMatch(/\sdisabled(?:=|\s|>)/);
    expect(buttons[1]).toMatch(/\sdisabled(?:=|\s|>)/);
  });

  it('announces download status while the Worker assembles', () => {
    const html = renderToStaticMarkup(<AssetPackDownloadBar state={{ ...state(), phase: 'assembling', progress: { requestId: 2, revision: 0, stage: 'assembling-archive' } }} onDownload={vi.fn()} />);
    expect(html).toContain('aria-live="polite"');
    expect(html).toContain('Assembling archive');
  });

  it('shows current reducer diagnostics when the visible workbench snapshot is stale', () => {
    const current = 'Current Worker error';
    const stale = 'Stale workbench warning';
    const base = state();
    const html = renderToStaticMarkup(<AssetPackDownloadBar state={{
      ...base,
      diagnostics: [{ code: 'current', severity: 'error', message: current, scope: 'release' }],
      workbench: { ...base.workbench!, diagnostics: [{ code: 'stale', severity: 'warning', message: stale, scope: 'warning' }] },
    }} onDownload={vi.fn()} />);

    expect(html).toContain(current);
    expect(html).not.toContain(stale);
  });
});
