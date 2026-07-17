import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { renderViewerHtml, type RenderViewerModel } from '../src/viewer.js';
import viewerData from './fixtures/viewer/viewer-data.json';

const model = viewerData as RenderViewerModel;
const partialModel: RenderViewerModel = {
  ...model,
  characterName: 'Partial Fixture Viewer',
  animations: [],
  skippedLayers: [{
    code: 'missing_sprite_path',
    message: 'Composed sheet skipped a missing sprite path.',
    path: 'spritesheets/body/missing.png',
  }],
};

const viewerFileFields = [
  'sheet.fileName',
  'files.metadata',
  'files.creditsTxt',
  'files.creditsCsv',
] as const;

const unsafeFileNames = [
  '/tmp/fixture.sheet.png',
  'C:\\temp\\fixture.sheet.png',
  'https://example.com/fixture.sheet.png',
  'javascript:alert(1)',
  '../fixture.sheet.png',
  './fixture.sheet.png',
  'nested/fixture.sheet.png',
  'nested\\fixture.sheet.png',
  '',
  '.',
  '..',
] as const;

type ViewerFileField = (typeof viewerFileFields)[number];

function withViewerFile(field: ViewerFileField, fileName: string): RenderViewerModel {
  if (field === 'sheet.fileName') {
    return { ...model, sheet: { ...model.sheet, fileName } };
  }
  if (field === 'files.metadata') {
    return { ...model, files: { ...model.files, metadata: fileName } };
  }
  if (field === 'files.creditsTxt') {
    return { ...model, files: { ...model.files, creditsTxt: fileName } };
  }
  return { ...model, files: { ...model.files, creditsCsv: fileName } };
}

const unsafeViewerFiles = viewerFileFields.flatMap((field) =>
  unsafeFileNames.map((fileName) => [field, fileName] as const),
);

describe('renderViewerHtml', () => {
  it('matches the committed browser fixture exactly', () => {
    const fixtureHtml = readFileSync(
      fileURLToPath(new URL('./fixtures/viewer/fixture.viewer.html', import.meta.url)),
      'utf8',
    );

    expect(renderViewerHtml(model)).toBe(fixtureHtml);
  });

  it('matches the committed no-animation partial browser fixture exactly', () => {
    const fixtureHtml = readFileSync(
      fileURLToPath(new URL('./fixtures/viewer/partial.viewer.html', import.meta.url)),
      'utf8',
    );

    expect(renderViewerHtml(partialModel)).toBe(fixtureHtml);
  });

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

  it.each(unsafeViewerFiles)(
    'rejects unsafe portable viewer filename %s=%j before emitting HTML',
    (field, fileName) => {
      expect(() => renderViewerHtml(withViewerFile(field, fileName)))
        .toThrow(/must be a portable relative basename/u);
    },
  );

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
    expect(html).toContain("figure.setAttribute('data-testid', 'direction-stage')");
    expect(html).toContain('data-testid="viewer-details"');
    expect(html).not.toMatch(/<details[^>]*data-testid="viewer-details"[^>]*\sopen(?:\s|>)/u);
    expect(html).toContain('data-testid="credits-text"');
    expect(html).toContain('data-testid="viewer-error"');
    expect(html).toContain('prefers-reduced-motion: reduce');
    expect(html).toContain('image-rendering: pixelated');
    expect(html).toContain('data-testid="partial-output"');
  });

  it('contains explicit responsive direction layouts and integer canvas scaling', () => {
    const html = renderViewerHtml(model);

    expect(html).toContain("['North', 'West', 'South', 'East']");
    expect(html).toContain("singleDirection: 'Single direction'");
    expect(html).toContain('grid-template-columns: repeat(2, minmax(0, 1fr))');
    expect(html).toContain('.direction-stages.single-direction');
    expect(html).toContain('grid-template-columns: 1fr;');
    expect(html).toContain('Math.floor(192 / selected.frameSize)');
    expect(html).toContain("canvas.style.width = String(displaySize) + 'px'");
    expect(html).toContain("canvas.style.height = String(displaySize) + 'px'");
  });

  it('contains synchronized modulo playback with one update for elapsed catch-up', () => {
    const html = renderViewerHtml(model);

    expect(html).toContain('selected.cycle[frameIndex] || 0');
    expect(html).toContain('selected.sourceX + column * selected.frameSize');
    expect(html).toContain('selected.sourceY + directionIndex * selected.frameSize');
    expect(html).toContain('const frameDuration = 1000 / 8;');
    expect(html).toContain('const elapsedSteps = Math.floor(accumulator / frameDuration);');
    expect(html).toContain('frameIndex = (frameIndex + elapsedSteps) % selected.cycle.length;');
    expect(html).not.toContain('while (accumulator >= frameDuration)');
    expect(html).toContain("' · 8 FPS'");
    expect(html).toContain('requestAnimationFrame');
    expect(html).toContain('encodeURI(model.sheet.fileName)');
    expect(html).toContain('Could not load spritesheet: ');
  });

  it('renders complete animation layout details and dedicated partial-output data', () => {
    const html = renderViewerHtml(partialModel);

    expect(html).toContain("frameSize: 'Frame size'");
    expect(html).toContain("sourceLayout: 'Source origin / layout'");
    expect(html).toContain("cycle: 'Cycle'");
    expect(html).toContain("partialOutput: 'Partial output'");
    expect(html).toContain('model.skippedLayers');
    expect(html).toContain('spritesheets/body/missing.png');
  });

  it('emits an explicit disabled no-animation state without dereferencing a selection', () => {
    const html = renderViewerHtml(partialModel);

    expect(html).toContain("noPlayableAnimations: 'No playable animations were composed.'");
    expect(html).toContain('const hasPlayableAnimations = model.animations.length > 0;');
    expect(html).toContain('animationSelect.disabled = true;');
    expect(html).toContain('playbackToggle.disabled = true;');
    expect(html).toContain('previousFrame.disabled = true;');
    expect(html).toContain('nextFrame.disabled = true;');
    expect(html).toContain('scrubber.disabled = true;');
  });

  it('emits browser JavaScript without TypeScript-only syntax', () => {
    const html = renderViewerHtml(model);
    const runtime = html.match(/<script>\s*([\s\S]*?)<\/script>\s*<\/body>/u)?.[1];

    expect(runtime).toBeDefined();
    expect(() => new Function(runtime ?? '')).not.toThrow();
  });

  it('keeps generated document title copy in COPY and assigns model text via textContent', () => {
    const html = renderViewerHtml(model);

    expect(html).toContain('<title id="viewer-document-title">LPC Toolkit</title>');
    expect(html).toContain("viewerTitle: 'Animation viewer'");
    expect(html).toContain("document.getElementById('viewer-document-title').textContent =");
    expect(html).toContain("model.characterName + ' — ' + COPY.viewerTitle");
    expect(html).not.toContain('document.title = model.characterName');
  });
});
