import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { AssetPackWorkbenchDiagnostic } from '../src/lib/asset-pack-worker-protocol';
import {
  DiagnosticList,
  assetPackDiagnosticPanel,
  diagnosticTargetId,
} from '../src/components/asset-pack-workbench/diagnostic-list';

const diagnostic: AssetPackWorkbenchDiagnostic = {
  code: 'asset_source_missing',
  severity: 'error',
  message: 'Upload the missing PNG.',
  scope: 'source',
  path: 'sprites/hero.png',
};

describe('DiagnosticList', () => {
  it('renders explicit diagnostic facts and maps source scope to a stable target', () => {
    const html = renderToStaticMarkup(<DiagnosticList diagnostics={[diagnostic]} onSelect={vi.fn()} />);

    expect(html).toContain('error');
    expect(html).toContain('asset_source_missing');
    expect(html).toContain('Upload the missing PNG.');
    expect(html).toContain('sprites/hero.png');
    expect(html).toContain('Sources');
    expect(assetPackDiagnosticPanel(diagnostic)).toBe('sources');
    expect(diagnosticTargetId(diagnostic)).not.toContain(diagnostic.path);
  });
});
