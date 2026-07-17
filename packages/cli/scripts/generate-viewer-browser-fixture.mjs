import { createCanvas } from '@napi-rs/canvas';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderViewerHtml } from '../dist/viewer.js';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const fixtureDirectory = path.resolve(scriptDirectory, '../test/fixtures/viewer');
const viewerDataPath = path.resolve(fixtureDirectory, 'viewer-data.json');
const viewerHtmlPath = path.resolve(fixtureDirectory, 'fixture.viewer.html');
const sheetPath = path.resolve(fixtureDirectory, 'fixture.sheet.png');
const model = JSON.parse(readFileSync(viewerDataPath, 'utf8'));
const canvas = createCanvas(192, 320);
const context = canvas.getContext('2d');

for (let row = 0; row < 5; row += 1) {
  for (let column = 0; column < 3; column += 1) {
    const red = 48 + column * 72;
    const green = 48 + row * 36;
    const blue = 176 - column * 28 + row * 12;
    const x = column * 64;
    const y = row * 64;
    context.fillStyle = `rgb(${red} ${green} ${blue})`;
    context.fillRect(x, y, 64, 64);
    context.fillStyle = '#000';
    context.fillRect(x, y, 8, 8);
  }
}

writeFileSync(sheetPath, canvas.toBuffer('image/png'));
writeFileSync(viewerHtmlPath, renderViewerHtml(model));
