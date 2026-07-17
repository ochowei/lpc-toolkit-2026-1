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

async function openFixture(page: Page): Promise<void> {
  await page.goto(pathToFileURL(fixtureHtml).href);
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

test.describe('offline render viewer', () => {
  test('plays the exact CLI fixture directly from file URLs', async ({ page }) => {
    await openFixture(page);

    await expect(page.getByTestId('animation-select')).toHaveValue('walk');
    await expect(page.getByTestId('direction-stage')).toHaveCount(4);
    await expect(page.getByTestId('frame-counter')).toContainText('/ 3 · 8 FPS');

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
      '192,48,120,255',
      '192,84,132,255',
      '192,120,144,255',
      '192,156,156,255',
    ]);

    await page.getByTestId('animation-select').selectOption('hurt');
    const singleDirectionStage = page.getByTestId('direction-stage');
    await expect(singleDirectionStage).toHaveCount(1);
    await expect(singleDirectionStage).toBeVisible();
    await expect(singleDirectionStage).toContainText('Single direction');

    await page.getByTestId('viewer-details').locator('summary').click();
    await expect(page.getByTestId('viewer-details')).toContainText('Fixture Artist — GPL 3.0');
    await expect(page.getByTestId('viewer-details')).toContainText('Visible warning');
    await expect(page.getByTestId('viewer-details')).toContainText('GPL 3.0');
    await expect(page.getByTestId('viewer-details')).toContainText('192 × 320');
    await expect(page.locator('#sheet-file-link')).toHaveAttribute('href', 'fixture.sheet.png');
    await expect(page.locator('#metadata-link')).toHaveAttribute('href', 'fixture.metadata.json');
    await expect(page.locator('#credits-txt-link')).toHaveAttribute('href', 'fixture.credits.txt');
    await expect(page.locator('#credits-csv-link')).toHaveAttribute('href', 'fixture.credits.csv');
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
