import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { AssetPackCreditsProjection } from '../src/lib/asset-pack-manifest-editor';
import { CreditsEditor } from '../src/components/asset-pack-workbench/credits-editor';

const credits: AssetPackCreditsProjection = {
  authors: ['Artist One'],
  licenses: ['CC-BY-SA 4.0'],
  urls: ['https://example.test/artist'],
  notes: 'Please retain this credit.',
};

describe('CreditsEditor', () => {
  it('renders repeatable credit fields, notes, and credit override navigation', () => {
    const html = renderToStaticMarkup(<CreditsEditor
      credits={credits}
      onSubmit={vi.fn()}
      onNavigateOverrides={vi.fn()}
    />);

    expect(html).toContain('Authors');
    expect(html).toContain('Licenses');
    expect(html).toContain('URLs');
    expect(html).toContain('Please retain this credit.');
    expect(html).toContain('Credit overrides');
    expect(html).toContain('Artist One');
  });
});
