import { copyFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createCanvas, loadImage } from '@napi-rs/canvas';
import { expect, test, type Page } from '@playwright/test';

const fixtureDirectory = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../../cli/test/fixtures/viewer',
);
const fixtureHtml = join(fixtureDirectory, 'fixture.viewer.html');
const partialFixtureHtml = join(fixtureDirectory, 'partial.viewer.html');

async function openFixture(page: Page, filePath = fixtureHtml): Promise<void> {
  await page.goto(pathToFileURL(filePath).href);
}

async function sampleDirectionPixels(page: Page): Promise<readonly string[]> {
  const canvases = page.getByTestId('direction-stage').locator('canvas');
  const screenshots = await Promise.all(
    Array.from({ length: await canvases.count() }, (_, index) => canvases.nth(index).screenshot()),
  );

  return Promise.all(screenshots.map(async (screenshot) => {
    const image = await loadImage(screenshot);
    const canvas = createCanvas(image.width, image.height);
    const context = canvas.getContext('2d');
    context.drawImage(image, 0, 0);
    return Array.from(
      context.getImageData(Math.floor(image.width / 2), Math.floor(image.height / 2), 1, 1).data,
    ).join(',');
  }));
}

async function canvasDimensions(page: Page): Promise<{
  readonly intrinsicWidth: number;
  readonly intrinsicHeight: number;
  readonly cssWidth: number;
  readonly cssHeight: number;
}> {
  return page.getByTestId('direction-stage').locator('canvas').first().evaluate((canvas) => {
    const bounds = canvas.getBoundingClientRect();
    return {
      intrinsicWidth: (canvas as HTMLCanvasElement).width,
      intrinsicHeight: (canvas as HTMLCanvasElement).height,
      cssWidth: bounds.width,
      cssHeight: bounds.height,
    };
  });
}

test.describe('offline render viewer', () => {
  test('plays the exact CLI fixture directly from file URLs', async ({ page }) => {
    await openFixture(page);

    await expect(page.getByTestId('animation-select')).toHaveValue('walk');
    await expect(page.getByTestId('direction-stage')).toHaveCount(4);
    await expect(page.getByTestId('frame-counter')).toContainText('/ 3 · 8 FPS');
    expect(await canvasDimensions(page)).toEqual({
      intrinsicWidth: 64,
      intrinsicHeight: 64,
      cssWidth: 192,
      cssHeight: 192,
    });

    const desktopStages = await page.getByTestId('direction-stage').evaluateAll((stages) =>
      stages.map((stage) => {
        const bounds = stage.getBoundingClientRect();
        return { x: bounds.x, y: bounds.y };
      }),
    );
    expect(desktopStages[0]?.y).toBe(desktopStages[1]?.y);
    expect(desktopStages[2]?.y).toBe(desktopStages[3]?.y);
    expect(desktopStages[1]?.x).toBeGreaterThan(desktopStages[0]?.x ?? 0);
    expect(desktopStages[2]?.y).toBeGreaterThan(desktopStages[0]?.y ?? 0);

    await expect.poll(async () => page.getByTestId('frame-counter').textContent()).not.toBe(
      'Frame 1 / 3 · 8 FPS',
    );

    await page.getByTestId('playback-toggle').click();
    await expect(page.getByTestId('playback-toggle')).toHaveAccessibleName('Play');
    const pausedFrameText = await page.getByTestId('frame-counter').textContent();
    const pausedFrame = Number(/^Frame (\d) \/ 3 · 8 FPS$/u.exec(pausedFrameText ?? '')?.[1]);
    expect(pausedFrame).toBeGreaterThanOrEqual(1);
    expect(pausedFrame).toBeLessThanOrEqual(3);
    const pausedPixels = await sampleDirectionPixels(page);
    expect(pausedPixels).toHaveLength(4);

    await page.getByTestId('next-frame').click();
    await expect(page.getByTestId('frame-counter')).toHaveText(
      `Frame ${(pausedFrame % 3) + 1} / 3 · 8 FPS`,
    );
    const nextPixels = await sampleDirectionPixels(page);
    for (const [index, pixel] of nextPixels.entries()) {
      expect(pixel).not.toBe(pausedPixels[index]);
    }

    await page.getByTestId('previous-frame').click();
    await expect(page.getByTestId('frame-counter')).toHaveText(
      `Frame ${pausedFrame} / 3 · 8 FPS`,
    );
    await expect.poll(() => sampleDirectionPixels(page)).toEqual(pausedPixels);

    await page.getByTestId('frame-scrubber').fill('2');
    await expect(page.getByTestId('frame-counter')).toHaveText('Frame 3 / 3 · 8 FPS');
    await expect.poll(() => sampleDirectionPixels(page)).toEqual([
      '144,40,112,255',
      '144,84,120,255',
      '144,128,128,255',
      '144,172,136,255',
    ]);

    await page.getByTestId('animation-select').selectOption('oversized_spell');
    await expect(page.getByTestId('animation-select')).toHaveValue('oversized_spell');
    const customDirectionStages = page.getByTestId('direction-stage');
    await expect(customDirectionStages).toHaveCount(4);
    for (const stage of await customDirectionStages.all()) {
      await expect(stage).toBeVisible();
    }
    await expect(page.getByTestId('frame-counter')).toHaveText('Frame 1 / 3 · 8 FPS');
    expect(await canvasDimensions(page)).toEqual({
      intrinsicWidth: 128,
      intrinsicHeight: 128,
      cssWidth: 128,
      cssHeight: 128,
    });
    const customFirstPixels = await sampleDirectionPixels(page);
    expect(customFirstPixels).toEqual([
      '80,48,96,255',
      '80,92,104,255',
      '80,136,112,255',
      '80,180,120,255',
    ]);

    await page.getByTestId('next-frame').click();
    await expect(page.getByTestId('frame-counter')).toHaveText('Frame 2 / 3 · 8 FPS');
    const customNextPixels = await sampleDirectionPixels(page);
    for (const [index, pixel] of customNextPixels.entries()) {
      expect(pixel).not.toBe(customFirstPixels[index]);
    }

    await page.getByTestId('previous-frame').click();
    await expect(page.getByTestId('frame-counter')).toHaveText('Frame 1 / 3 · 8 FPS');
    await expect.poll(() => sampleDirectionPixels(page)).toEqual(customFirstPixels);

    await page.getByTestId('animation-select').selectOption('hurt');
    const singleDirectionStage = page.getByTestId('direction-stage');
    await expect(singleDirectionStage).toHaveCount(1);
    await expect(singleDirectionStage).toBeVisible();
    await expect(singleDirectionStage).toContainText('Single direction');
    expect(await canvasDimensions(page)).toEqual({
      intrinsicWidth: 64,
      intrinsicHeight: 64,
      cssWidth: 192,
      cssHeight: 192,
    });
    await expect.poll(() => sampleDirectionPixels(page)).toEqual(['128,56,128,255']);
    const singleStageCenter = await page.locator('#direction-stages').evaluate((container) => {
      const parent = container.getBoundingClientRect();
      const stage = container.firstElementChild?.getBoundingClientRect();
      return stage ? {
        parentCenter: parent.x + parent.width / 2,
        stageCenter: stage.x + stage.width / 2,
      } : null;
    });
    expect(singleStageCenter).not.toBeNull();
    expect(Math.abs(
      (singleStageCenter?.parentCenter ?? 0) - (singleStageCenter?.stageCenter ?? 0),
    )).toBeLessThan(1);

    const viewerDetails = page.getByTestId('viewer-details');
    expect(await viewerDetails.getAttribute('open')).toBeNull();
    await viewerDetails.locator('summary').click();
    await expect(viewerDetails).toHaveAttribute('open', '');
    await expect(viewerDetails).toContainText('Visible warning');
    await expect(viewerDetails).toContainText('GPL 3.0');
    await expect(viewerDetails).toContainText('384 × 832');
    const customDetails = page.locator('#animation-table-body tr').filter({
      hasText: 'oversized_spell',
    });
    await expect(customDetails).toContainText('128 × 128');
    await expect(customDetails).toContainText('0, 320 · 3 columns × 4 rows');
    await expect(customDetails).toContainText('0 → 1 → 2');
    const creditsText = page.getByTestId('credits-text');
    await expect(creditsText).toBeVisible();
    await expect(creditsText).toHaveText(
      'Credits for Fixture Viewer\nFixture Artist — GPL 3.0\n',
    );
    await expect(page.locator('#sheet-file-link')).toHaveAttribute('href', 'fixture.sheet.png');
    await expect(page.locator('#metadata-link')).toHaveAttribute('href', 'fixture.metadata.json');
    await expect(page.locator('#credits-txt-link')).toHaveAttribute('href', 'fixture.credits.txt');
    await expect(page.locator('#credits-csv-link')).toHaveAttribute('href', 'fixture.credits.csv');

    await page.setViewportSize({ width: 360, height: 900 });
    await page.getByTestId('animation-select').selectOption('walk');
    const narrowStages = await page.getByTestId('direction-stage').evaluateAll((stages) =>
      stages.map((stage) => {
        const bounds = stage.getBoundingClientRect();
        return { x: bounds.x, y: bounds.y };
      }),
    );
    expect(new Set(narrowStages.map(({ x }) => x)).size).toBe(1);
    expect(narrowStages[1]?.y).toBeGreaterThan(narrowStages[0]?.y ?? 0);
    expect(narrowStages[2]?.y).toBeGreaterThan(narrowStages[1]?.y ?? 0);
    expect(narrowStages[3]?.y).toBeGreaterThan(narrowStages[2]?.y ?? 0);
  });

  test('keeps no-animation partial output usable directly from a file URL', async ({ page }) => {
    const pageErrors: string[] = [];
    page.on('pageerror', (error) => pageErrors.push(error.message));
    await openFixture(page, partialFixtureHtml);

    const viewerError = page.getByTestId('viewer-error');
    await expect(viewerError).toBeVisible();
    await expect(viewerError).toHaveText('No playable animations were composed.');
    await expect(page.getByTestId('animation-select')).toBeDisabled();
    await expect(page.getByTestId('playback-toggle')).toBeDisabled();
    await expect(page.getByTestId('previous-frame')).toBeDisabled();
    await expect(page.getByTestId('next-frame')).toBeDisabled();
    await expect(page.getByTestId('frame-scrubber')).toBeDisabled();
    await expect(page.getByTestId('direction-stage')).toHaveCount(0);

    const viewerDetails = page.getByTestId('viewer-details');
    await viewerDetails.locator('summary').click();
    await expect(viewerDetails).toHaveAttribute('open', '');
    await expect(viewerDetails).toContainText('Visible warning');
    await expect(page.getByTestId('partial-output')).toBeVisible();
    await expect(page.getByTestId('partial-output')).toContainText('missing_sprite_path');
    await expect(page.getByTestId('credits-text')).toHaveText(
      'Credits for Fixture Viewer\nFixture Artist — GPL 3.0\n',
    );
    await expect(page.locator('#sheet-file-link')).toHaveAttribute('href', 'fixture.sheet.png');
    await expect(page.locator('#metadata-link')).toHaveAttribute('href', 'fixture.metadata.json');
    expect(pageErrors).toEqual([]);
  });

  test('advances a large elapsed interval with one bounded redraw', async ({ page }) => {
    await page.addInitScript(() => {
      let now = 0;
      const callbacks: FrameRequestCallback[] = [];
      Object.defineProperty(performance, 'now', { value: () => now });
      window.requestAnimationFrame = (callback: FrameRequestCallback): number => {
        callbacks.push(callback);
        return callbacks.length;
      };
      const originalDrawImage = CanvasRenderingContext2D.prototype.drawImage;
      let drawCount = 0;
      CanvasRenderingContext2D.prototype.drawImage = new Proxy(originalDrawImage, {
        apply(target, thisArgument, argumentsList) {
          drawCount += 1;
          return Reflect.apply(target, thisArgument, argumentsList);
        },
      });
      Object.assign(window, {
        runNextAnimationFrame(delta: number) {
          now += delta;
          const callback = callbacks.shift();
          if (!callback) throw new Error('No animation callback was scheduled.');
          callback(now);
        },
        viewerDrawCount() {
          return drawCount;
        },
      });
    });
    await openFixture(page);
    await expect(page.getByTestId('direction-stage')).toHaveCount(4);
    await expect.poll(() => page.evaluate(() => (
      window as typeof window & { viewerDrawCount(): number }
    ).viewerDrawCount())).toBe(4);

    await page.evaluate(() => (
      window as typeof window & { runNextAnimationFrame(delta: number): void }
    ).runNextAnimationFrame(125_000));

    await expect(page.getByTestId('frame-counter')).toHaveText('Frame 2 / 3 · 8 FPS');
    expect(await page.evaluate(() => (
      window as typeof window & { viewerDrawCount(): number }
    ).viewerDrawCount())).toBe(8);
  });

  test('starts paused when reduced motion is preferred', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await openFixture(page);

    await expect(page.getByTestId('playback-toggle')).toHaveAccessibleName('Play');
  });

  test('reports a missing sibling sheet', async ({ page }) => {
    const temporaryDirectory = await mkdtemp(join(tmpdir(), 'lpc-viewer-fixture-'));
    const temporaryHtml = join(temporaryDirectory, 'fixture.viewer.html');
    try {
      await copyFile(fixtureHtml, temporaryHtml);
      await page.goto(pathToFileURL(temporaryHtml).href);
      const viewerError = page.getByTestId('viewer-error');
      await expect(viewerError).toBeVisible();
      await expect(viewerError).toHaveText(
        'Could not load spritesheet: fixture.sheet.png',
      );
    } finally {
      await rm(temporaryDirectory, { recursive: true, force: true });
    }
  });
});
