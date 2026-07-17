import { describe, expect, it } from 'vitest';
import { renderViewerHtml, type RenderViewerModel } from '../src/viewer.js';
import viewerData from './fixtures/viewer/viewer-data.json';

const model = viewerData as RenderViewerModel;

describe('renderViewerHtml', () => {
  it('embeds one portable model and no network or absolute paths', () => {
    const html = renderViewerHtml(model);

    expect(html).toContain('<script id="viewer-data" type="application/json">');
    expect(html).toContain('fixture.sheet.png');
    expect(html.match(/<script(?:\s|>)/gu)).toHaveLength(2);
    expect(html.match(/id="viewer-data"/gu)).toHaveLength(1);
    expect(html).not.toContain('fetch(');
    expect(html).not.toContain('<script src=');
    expect(html).not.toContain('<link href="http');
    expect(html).not.toContain('/Users/');
    expect(html).not.toContain('C:\\');
  });

  it('cannot terminate the data script with credit or warning text', () => {
    const html = renderViewerHtml({
      ...model,
      creditsTxt: '</script><script>globalThis.pwned=true</script>&\u2028\u2029',
      warnings: [{ code: 'fixture', message: '<img src=x onerror=alert(1)>' }],
    });

    expect(html).not.toContain('</script><script>globalThis.pwned');
    expect(html).not.toContain('<img src=x onerror=alert(1)>');
    expect(html).toContain('\\u003c/script\\u003e');
    expect(html).toContain('\\u003e');
    expect(html).toContain('\\u0026');
    expect(html).toContain('\\u2028');
    expect(html).toContain('\\u2029');
    expect(html).toContain('textContent');
  });

  it('provides the required accessible controls and collapsed details hooks', () => {
    const html = renderViewerHtml(model);

    expect(html).toContain('data-testid="animation-select"');
    expect(html).toContain('data-testid="playback-toggle"');
    expect(html).toContain('data-testid="previous-frame"');
    expect(html).toContain('data-testid="next-frame"');
    expect(html).toContain('data-testid="frame-scrubber"');
    expect(html).toContain('data-testid="viewer-details"');
    expect(html).not.toMatch(/<details[^>]*data-testid="viewer-details"[^>]*\sopen(?:\s|>)/u);
    expect(html).toContain('data-testid="credits-text"');
    expect(html).toContain('data-testid="viewer-error"');
    expect(html).toContain('prefers-reduced-motion: reduce');
    expect(html).toContain('image-rendering: pixelated');
  });

  it('contains synchronized direction-grid and fixed-step playback behavior', () => {
    const html = renderViewerHtml(model);

    expect(html).toContain("['North', 'West', 'South', 'East']");
    expect(html).toContain("singleDirection: 'Single direction'");
    expect(html).toContain('selected.cycle[frameIndex] || 0');
    expect(html).toContain('selected.sourceX + column * selected.frameSize');
    expect(html).toContain('selected.sourceY + directionIndex * selected.frameSize');
    expect(html).toContain('const frameDuration = 1000 / 8;');
    expect(html).toContain('requestAnimationFrame');
    expect(html).toContain('encodeURI(model.sheet.fileName)');
    expect(html).toContain('Could not load spritesheet: ');
  });

  it('emits browser JavaScript without TypeScript-only syntax', () => {
    const html = renderViewerHtml(model);
    const runtime = html.match(/<script>\s*([\s\S]*?)<\/script>\s*<\/body>/u)?.[1];

    expect(runtime).toBeDefined();
    expect(() => new Function(runtime ?? '')).not.toThrow();
  });
});
