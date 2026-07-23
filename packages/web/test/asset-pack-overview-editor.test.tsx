import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { AssetPackOverviewProjection } from '../src/lib/asset-pack-manifest-editor';
import { OverviewEditor, synchronizeOverviewDraft } from '../src/components/asset-pack-workbench/overview-editor';

const projection: AssetPackOverviewProjection = {
  id: 'acme.demo',
  displayName: 'Demo pack',
  version: '1.2.3',
  compatibility: { minimumCliVersion: '2.0.0', requiredCapabilities: ['sprites', 'recolor'] },
};

describe('OverviewEditor', () => {
  it('synchronizes Worker-approved revisions without overwriting an actively edited field', () => {
    expect(synchronizeOverviewDraft({ id: 'old', displayName: 'old', version: '1.0.0', minimumCliVersion: '', requiredCapabilities: '' }, projection, new Set())).toEqual({
      id: 'acme.demo', displayName: 'Demo pack', version: '1.2.3', minimumCliVersion: '2.0.0', requiredCapabilities: 'sprites, recolor',
    });
    expect(synchronizeOverviewDraft({ id: 'typed', displayName: 'old', version: '1.0.0', minimumCliVersion: '', requiredCapabilities: '' }, projection, new Set(['id']))).toMatchObject({ id: 'typed', displayName: 'Demo pack', version: '1.2.3' });
  });

  it('labels every overview field and renders current diagnostic text', () => {
    const html = renderToStaticMarkup(<OverviewEditor
      projection={projection}
      diagnostics={[{ code: 'asset_pack_id_invalid', severity: 'error', message: 'Use a scoped pack ID.', scope: 'manifest', path: 'id' }]}
      onSubmit={vi.fn()}
    />);

    expect(html).toContain('Pack ID');
    expect(html).toContain('Display name');
    expect(html).toContain('Version');
    expect(html).toContain('Minimum CLI version');
    expect(html).toContain('Required capabilities');
    expect(html).toContain('Use a scoped pack ID.');
    expect(html).toContain('name="id"');
  });
});
