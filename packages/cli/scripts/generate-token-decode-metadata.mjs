import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createCatalog, createPaletteCatalog } from '../../core/dist/index.js';

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = path.resolve(packageRoot, '../..');

function walkJsonFiles(root) {
  const files = [];
  for (const entry of readdirSync(root).sort()) {
    const fullPath = path.join(root, entry);
    if (statSync(fullPath).isDirectory()) {
      files.push(...walkJsonFiles(fullPath));
    } else if (entry.endsWith('.json')) {
      files.push(fullPath);
    }
  }
  return files;
}

function loadJsonRecords(root) {
  return Object.fromEntries(
    walkJsonFiles(root).map((file) => [
      path.relative(root, file).split(path.sep).join('/'),
      JSON.parse(readFileSync(file, 'utf8')),
    ]),
  );
}

function compactRecolorConfig(config) {
  if (
    typeof config?.material !== 'string' ||
    !Array.isArray(config.palettes) ||
    !config.palettes.every((palette) => typeof palette === 'string')
  ) {
    throw new Error('catalog recolor metadata is missing material or palettes');
  }
  return {
    material: config.material,
    palettes: config.palettes,
    ...(typeof config.type_name === 'string' ? { type_name: config.type_name } : {}),
    ...(typeof config.base === 'string' ? { base: config.base } : {}),
    ...(Array.isArray(config.source) &&
    config.source.every((color) => typeof color === 'string')
      ? { source: config.source }
      : {}),
    ...(typeof config.label === 'string' ? { label: config.label } : {}),
  };
}

function compactRecolors(recolors) {
  if (recolors === undefined) return undefined;
  if (typeof recolors?.material === 'string') return compactRecolorConfig(recolors);

  const compact = {};
  for (const [key, config] of Object.entries(recolors)) {
    if (/^color_\d+$/u.test(key)) compact[key] = compactRecolorConfig(config);
  }
  return Object.keys(compact).length > 0 ? compact : undefined;
}

const catalogResult = createCatalog(
  loadJsonRecords(path.join(repoRoot, 'assets', 'sheet_definitions')),
);
const paletteResult = createPaletteCatalog(
  loadJsonRecords(path.join(repoRoot, 'assets', 'palette_definitions')),
);

const items = {};
for (const item of catalogResult.catalog.byItemId.values()) {
  if (item.sourcePath === undefined) {
    throw new Error(`catalog item ${item.name} is missing its source path`);
  }
  const recolors = compactRecolors(item.recolors);
  items[item.sourcePath] = {
    name: item.name,
    type_name: item.type_name,
    ...(item.variants !== undefined ? { variants: item.variants } : {}),
    ...(recolors !== undefined ? { recolors } : {}),
    ...(item.aliases !== undefined ? { aliases: item.aliases } : {}),
  };
}

const materials = {};
for (const [materialName, material] of Object.entries(
  paletteResult.palettes.materials,
)) {
  const palettes = {};
  for (const [version, colors] of Object.entries(material.palettes)) {
    palettes[version] = Object.keys(colors);
  }
  materials[materialName] = {
    palettes,
    ...(material.default !== undefined ? { default: material.default } : {}),
    ...(material.base !== undefined ? { base: material.base } : {}),
  };
}

writeFileSync(
  path.join(packageRoot, 'dist', 'token-decode-metadata.json'),
  `${JSON.stringify({ schemaVersion: 1, items, materials })}\n`,
);
