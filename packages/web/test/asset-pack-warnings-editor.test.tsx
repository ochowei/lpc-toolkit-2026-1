import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { AssetPackAcknowledgement } from '@lpc-toolkit/core';
import { WarningsEditor, synchronizeWarningReasons, warningCandidateKey } from '../src/components/asset-pack-workbench/warnings-editor';

const warning: AssetPackAcknowledgement = {
  code: 'asset_path_inferred',
  subject: { path: 'sprites/hero.png' },
  contentDigest: `sha256:${'b'.repeat(64)}`,
  reason: '',
};

describe('WarningsEditor', () => {
  it('does not carry a reason from an older warning candidate into a newer digest or revision', () => {
    const olderKey = warningCandidateKey(warning, 4);
    const newerWarning = { ...warning, contentDigest: `sha256:${'c'.repeat(64)}` };

    expect(synchronizeWarningReasons({ [olderKey]: 'Only true for the older candidate' }, [newerWarning], 4)).toEqual({});
    expect(warningCandidateKey(warning, 4)).not.toBe(warningCandidateKey(newerWarning, 5));
    expect(synchronizeWarningReasons({ [olderKey]: 'Only true for the older candidate' }, [newerWarning], 5)).toEqual({});
  });

  it('shows one governed confirmation per warning and no acknowledge-all control', () => {
    const html = renderToStaticMarkup(<WarningsEditor
      warnings={[warning]}
      acknowledgementRecords={[]}
      versionBlocked={false}
      onAcknowledge={vi.fn()}
    />);

    expect(html).toContain('asset_path_inferred');
    expect(html).toContain('&quot;path&quot;:&quot;sprites/hero.png&quot;');
    expect(html).toContain(`sha256:${'b'.repeat(64)}`);
    expect(html).toContain('Reason');
    expect(html).toContain('Confirm');
    expect(html).not.toContain('Acknowledge all');
  });

  it('explains the version blocker and keeps confirmation disabled', () => {
    const html = renderToStaticMarkup(<WarningsEditor
      warnings={[warning]}
      acknowledgementRecords={[]}
      versionBlocked
      onAcknowledge={vi.fn()}
    />);

    expect(html).toContain('Set the release version first');
    expect(html).toContain('disabled');
  });
});
