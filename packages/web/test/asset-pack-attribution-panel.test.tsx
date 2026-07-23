import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { CreditsManifest } from '@lpc-toolkit/core';
import { AttributionPanel } from '../src/components/asset-pack-workbench/attribution-panel';

const credits: CreditsManifest = {
  entries: [{
    file: 'packages/acme.demo/hair/walk.png',
    authors: ['Pack Artist'],
    licenses: ['CC-BY 4.0'],
    urls: ['https://example.com/pack-artist'],
    notes: 'Pack contribution.',
  }],
  resolvedPaths: ['packages/acme.demo/hair/walk.png'],
  licenses: ['CC-BY 4.0'],
};

describe('asset-pack attribution panel', () => {
  it('renders matched credits, resolved paths, effective license, and official release tag', () => {
    const html = renderToStaticMarkup(<AttributionPanel
      credits={credits}
      effectiveLicense="CC-BY 4.0"
      releaseTag="assets-v2026.06.05-initial"
    />);

    expect(html).toContain('Pack Artist');
    expect(html).toContain('CC-BY 4.0');
    expect(html).toContain('https://example.com/pack-artist');
    expect(html).toContain('Pack contribution.');
    expect(html).toContain('packages/acme.demo/hair/walk.png');
    expect(html).toContain('assets-v2026.06.05-initial');
  });

  it('renders an attribution error without exposing an export action', () => {
    const html = renderToStaticMarkup(<AttributionPanel
      credits={null}
      effectiveLicense={null}
      releaseTag="assets-v2026.06.05-initial"
      error="Missing credit data"
    />);

    expect(html).toContain('Missing credit data');
    expect(html).not.toContain('Export');
  });
});
