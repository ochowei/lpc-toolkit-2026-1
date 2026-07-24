import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { AssetPackSourceSummary } from '../src/lib/asset-pack-worker-protocol';
import { SourceList } from '../src/components/asset-pack-workbench/source-list';

const summaries: readonly AssetPackSourceSummary[] = [
  { path: 'sprites/hero.png', referenced: true, consumerCount: 2, width: 64, height: 64, digest: `sha256:${'a'.repeat(64)}`, state: 'ready' },
  { path: 'sprites/missing.png', referenced: true, consumerCount: 1, state: 'missing' },
  { path: 'sprites/old.png', referenced: false, consumerCount: 0, width: 32, height: 32, state: 'unreferenced' },
];

describe('SourceList', () => {
  it('renders source facts, PNG replacement, and confirmation-gated unreferenced removal', () => {
    const html = renderToStaticMarkup(<SourceList
      summaries={summaries}
      onReplace={vi.fn()}
      onRemove={vi.fn()}
    />);

    expect(html).toContain('sprites/hero.png');
    expect(html).toContain('2 consumers');
    expect(html).toContain('64 × 64');
    expect(html).toContain(`sha256:${'a'.repeat(64)}`);
    expect(html).toContain('Replace');
    expect(html).toContain('Remove');
    expect(html).toContain('accept="image/png"');
    expect(html).toContain('Upload a PNG');
    expect(html).not.toContain('createObjectURL');
  });
});
