import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import {
  AssetPackWorkbenchShell,
  type AssetPackWorkbenchShellProps,
} from '../src/components/asset-pack-workbench/harness';
import { createAssetPackWorkbenchState } from '../src/slice/asset-pack-workbench';

describe('AssetPackWorkbenchShell', () => {
  it('renders stable desktop navigation, preview, and editor landmarks', () => {
    const props: AssetPackWorkbenchShellProps = {
      state: createAssetPackWorkbenchState(),
      onUpload: vi.fn(),
      onReset: vi.fn(),
      onBack: vi.fn(),
      onNavigate: vi.fn(),
    };

    const html = renderToStaticMarkup(<AssetPackWorkbenchShell {...props} />);

    expect(html).toContain('<nav');
    expect(html).toContain('<main');
    expect(html).toContain('<aside');
    expect(html).toContain('aria-label="Asset pack preview"');
    expect(html).toContain('aria-label="Asset pack editor"');
    for (const label of ['Overview', 'Manifest', 'Sources', 'Warnings', 'Credits']) {
      expect(html).toContain(label);
    }
  });

  it('renders narrow-screen tabs for the same stable panel labels', () => {
    const props: AssetPackWorkbenchShellProps = {
      state: { ...createAssetPackWorkbenchState(), activePanel: 'sources' },
      onUpload: vi.fn(),
      onReset: vi.fn(),
      onBack: vi.fn(),
      onNavigate: vi.fn(),
    };

    const html = renderToStaticMarkup(<AssetPackWorkbenchShell {...props} />);

    expect(html).toContain('role="tablist"');
    expect(html).toContain('aria-label="Asset pack panels"');
    expect(html).toContain('role="tab"');
    expect(html).toContain('aria-selected="true"');
  });

  it('exposes status counts as text and icon and announces worker progress', () => {
    const state = {
      ...createAssetPackWorkbenchState(),
      phase: 'validating' as const,
      progress: { requestId: 1, revision: 0, stage: 'inspecting-sources' as const },
    };
    const props: AssetPackWorkbenchShellProps = {
      state,
      onUpload: vi.fn(),
      onReset: vi.fn(),
      onBack: vi.fn(),
      onNavigate: vi.fn(),
    };

    const html = renderToStaticMarkup(<AssetPackWorkbenchShell {...props} />);

    expect(html).toContain('0 sources');
    expect(html).toContain('aria-hidden="true"');
    expect(html).toContain('Inspecting source files');
    expect(html).toContain('role="status"');
    expect(html).toContain('aria-live="polite"');
  });
});
