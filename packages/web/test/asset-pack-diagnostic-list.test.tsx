import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { AssetPackWorkbenchDiagnostic } from '../src/lib/asset-pack-worker-protocol';
import {
  DiagnosticList,
  DiagnosticTarget,
  assetPackDiagnosticPanel,
  diagnosticPanelTargetId,
  diagnosticTargetId,
} from '../src/components/asset-pack-workbench/diagnostic-list';
import { workbenchEditorErrorMessage } from '../src/components/asset-pack-workbench/workbench-editor';

const diagnostic: AssetPackWorkbenchDiagnostic = {
  code: 'asset_source_missing',
  severity: 'error',
  message: 'Upload the missing PNG.',
  scope: 'source',
  path: 'sprites/hero.png',
};
const secondDiagnostic: AssetPackWorkbenchDiagnostic = { ...diagnostic, subject: { path: 'sprites/other.png' } };

describe('DiagnosticList', () => {
  it('renders explicit diagnostic facts and maps source scope to a stable target', () => {
    const html = renderToStaticMarkup(<><DiagnosticList diagnostics={[diagnostic, secondDiagnostic]} onSelect={vi.fn()} error="A helper failed." /><DiagnosticTarget diagnostic={diagnostic} /><DiagnosticTarget diagnostic={secondDiagnostic} /></>);

    expect(html).toContain('error');
    expect(html).toContain('asset_source_missing');
    expect(html).toContain('Upload the missing PNG.');
    expect(html).toContain('sprites/hero.png');
    expect(html).toContain('Sources');
    expect(assetPackDiagnosticPanel(diagnostic)).toBe('sources');
    expect(diagnosticTargetId(diagnostic)).not.toContain(diagnostic.path);
    expect(diagnosticTargetId(diagnostic)).not.toBe(diagnosticTargetId(secondDiagnostic));
    expect(html).toContain(`id="${diagnosticTargetId(diagnostic)}"`);
    expect(html).toContain(`id="${diagnosticTargetId(secondDiagnostic)}"`);
    expect(html).toContain(`id="${diagnosticPanelTargetId(diagnostic)}"`);
    expect(html).toContain(`id="${diagnosticPanelTargetId(secondDiagnostic)}"`);
    expect(html).toContain('A helper failed.');
    expect(workbenchEditorErrorMessage(new Error('projection failed'))).toBe('projection failed');
    expect(workbenchEditorErrorMessage('projection failed')).toContain('editor could not prepare');
  });
});
