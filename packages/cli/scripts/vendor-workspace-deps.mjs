import { cpSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const packageRoot = path.resolve(scriptDir, '..');
const distRoot = path.join(packageRoot, 'dist');
const vendorRoot = path.join(distRoot, 'vendor', '@lpc-toolkit');

const workspacePackages = [
  {
    name: '@lpc-toolkit/asset-pack-format',
    sourceRoot: path.resolve(packageRoot, '..', 'asset-pack-format'),
    vendorName: 'asset-pack-format',
  },
  {
    name: '@lpc-toolkit/core',
    sourceRoot: path.resolve(packageRoot, '..', 'core'),
    vendorName: 'core',
  },
  {
    name: '@lpc-toolkit/presets',
    sourceRoot: path.resolve(packageRoot, '..', 'presets'),
    vendorName: 'presets',
  },
];

function vendorPackage({ name, sourceRoot, vendorName }) {
  const sourceDist = path.join(sourceRoot, 'dist');
  const vendorPackageRoot = path.join(vendorRoot, vendorName);

  rmSync(vendorPackageRoot, { recursive: true, force: true });
  mkdirSync(vendorPackageRoot, { recursive: true });
  cpSync(sourceDist, path.join(vendorPackageRoot, 'dist'), { recursive: true });
  writeFileSync(
    path.join(vendorPackageRoot, 'package.json'),
    `${JSON.stringify(
      {
        name,
        version: '0.0.0',
        type: 'module',
        exports: {
          '.': './dist/index.js',
        },
      },
      null,
      2,
    )}\n`,
  );
}

function rewriteRuntimeImports(filePath) {
  const original = readFileSync(filePath, 'utf8');
  const relativeVendorRoot = path
    .relative(path.dirname(filePath), vendorRoot)
    .split(path.sep)
    .join('/');
  const vendorPrefix = relativeVendorRoot.startsWith('.') ? relativeVendorRoot : `./${relativeVendorRoot}`;
  const next = original
    .replaceAll("from '@lpc-toolkit/asset-pack-format'", `from '${vendorPrefix}/asset-pack-format/dist/index.js'`)
    .replaceAll("from '@lpc-toolkit/core'", `from '${vendorPrefix}/core/dist/index.js'`)
    .replaceAll("from '@lpc-toolkit/presets'", `from '${vendorPrefix}/presets/dist/index.js'`);

  if (next !== original) {
    writeFileSync(filePath, next);
  }
}

function walkJsFiles(root) {
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const entryPath = path.join(root, entry.name);
    if (entry.isDirectory()) {
      walkJsFiles(entryPath);
    } else if (entry.isFile() && entry.name.endsWith('.js')) {
      rewriteRuntimeImports(entryPath);
    }
  }
}

for (const workspacePackage of workspacePackages) {
  vendorPackage(workspacePackage);
}

walkJsFiles(distRoot);
