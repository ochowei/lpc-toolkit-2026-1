import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { AssetPackAdvancedProjection } from '../src/lib/asset-pack-manifest-editor';
import {
  ManifestJsonEditor,
  formatAdvancedProjection,
  rawRepairCanSubmit,
} from '../src/components/asset-pack-workbench/manifest-json-editor';

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
  });
});
