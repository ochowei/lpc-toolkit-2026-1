import { createCanvas } from '@napi-rs/canvas';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderViewerHtml } from '../dist/viewer.js';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const fixtureDirectory = path.resolve(scriptDirectory, '../test/fixtures/viewer');
const viewerDataPath = path.resolve(fixtureDirectory, 'viewer-data.json');
const viewerHtmlPath = path.resolve(fixtureDirectory, 'fixture.viewer.html');
const partialViewerHtmlPath = path.resolve(fixtureDirectory, 'partial.viewer.html');
const sheetPath = path.resolve(fixtureDirectory, 'fixture.sheet.png');
const model = JSON.parse(readFileSync(viewerDataPath, 'utf8'));
const partialModel = {
  ...model,
  characterName: 'Partial Fixture Viewer',
  animations: [],
  skippedLayers: [{
    code: 'missing_sprite_path',
    message: 'Composed sheet skipped a missing sprite path.',
    path: 'spritesheets/body/missing.png',
  }],
};
const canvas = createCanvas(model.sheet.width, model.sheet.height);
const context = canvas.getContext('2d');

for (const [descriptorIndex, descriptor] of model.animations.entries()) {
  for (let directionIndex = 0; directionIndex < descriptor.directions; directionIndex += 1) {
    for (const column of new Set(descriptor.cycle)) {
      const red = 32 + descriptorIndex * 48 + column * 56;
      const green = 40 + directionIndex * 44 + descriptorIndex * 8;
      const blue = 64 + descriptorIndex * 32 + column * 24 + directionIndex * 8;
      const x = descriptor.sourceX + column * descriptor.frameSize;
      const y = descriptor.sourceY + directionIndex * descriptor.frameSize;
      context.fillStyle = `rgb(${red} ${green} ${blue})`;
      context.fillRect(x, y, descriptor.frameSize, descriptor.frameSize);
      context.fillStyle = '#000';
      context.fillRect(x, y, 8, 8);
    }
  }
}

writeFileSync(sheetPath, canvas.toBuffer('image/png'));
writeFileSync(viewerHtmlPath, renderViewerHtml(model));
writeFileSync(partialViewerHtmlPath, renderViewerHtml(partialModel));
