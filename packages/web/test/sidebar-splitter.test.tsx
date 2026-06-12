import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { SidebarSplitter } from '../src/components/layer-stack/sidebar-splitter';

describe('SidebarSplitter', () => {
  it('renders an accessible vertical separator', () => {
    const html = renderToStaticMarkup(
      <SidebarSplitter
        value={400}
        min={320}
        max={640}
        onChange={() => {}}
        onCommit={() => {}}
        onReset={() => {}}
      />,
    );

    expect(html).toContain('role="separator"');
    expect(html).toContain('aria-orientation="vertical"');
    expect(html).toContain('aria-valuemin="320"');
    expect(html).toContain('aria-valuemax="640"');
    expect(html).toContain('aria-valuenow="400"');
    expect(html).toContain('aria-label="Resize sidebar"');
    expect(html).toContain('tabindex="0"');
    expect(html).toContain('cursor-ew-resize');
  });
});
