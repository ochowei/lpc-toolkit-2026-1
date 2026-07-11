import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { builtinModules } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const sourceExtensions = new Set(['.js', '.jsx', '.ts', '.tsx']);
const coreRuntimeGlobals = [
  'window',
  'document',
  'fetch',
  'localStorage',
  'createImageBitmap',
];
const concreteCanvasImports = new Set([
  '@napi-rs/canvas',
  'canvas',
  'node-canvas',
]);
const reactImports = new Set(['react', 'react-dom', 'react/jsx-runtime']);
const nodeFilesystemImports = new Set([
  'fs',
  'fs/promises',
  'node:fs',
  'node:fs/promises',
]);
const nodeBuiltins = new Set([
  ...builtinModules,
  ...builtinModules.map((name) => name.replace(/^node:/, '')),
]);

function toPosix(filePath) {
  return filePath.split(path.sep).join('/');
}

function relativePath(root, filePath) {
  return toPosix(path.relative(root, filePath));
}

function sourceFiles(dir) {
  if (!existsSync(dir)) return [];

  const out = [];
  for (const entry of readdirSync(dir)) {
    const fullPath = path.join(dir, entry);
    const stat = statSync(fullPath);
    if (stat.isDirectory()) {
      out.push(...sourceFiles(fullPath));
      continue;
    }

    if (stat.isFile() && sourceExtensions.has(path.extname(entry))) {
      out.push(fullPath);
    }
  }
  return out;
}

function stripCommentsAndStrings(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/[^\n\r]*/g, '')
    .replace(/(['"`])(?:\\[\s\S]|(?!\1)[\s\S])*?\1/g, '');
}

function importSpecifiers(source) {
  const specifiers = [];
  const patterns = [
    /\bimport\s+(?:[\s\S]*?\s+from\s*)?['"]([^'"]+)['"]/g,
    /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
    /\bexport\s+(?:[\s\S]*?\s+from\s*)['"]([^'"]+)['"]/g,
  ];

  for (const pattern of patterns) {
    for (const match of source.matchAll(pattern)) {
      specifiers.push(match[1]);
    }
  }

  return specifiers;
}

function resolveImport(filePath, specifier) {
  if (!specifier.startsWith('.')) return null;
  return path.resolve(path.dirname(filePath), specifier);
}

function isInside(candidate, parent) {
  const relative = path.relative(parent, candidate);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

function isPackageImport(specifier, packageName) {
  return specifier === packageName || specifier.startsWith(`${packageName}/`);
}

function addIssue(issues, root, filePath, message) {
  issues.push(`${relativePath(root, filePath)}: ${message}`);
}

function checkCoreFile({ issues, root, coreSrc, presetsSrc, webSrc, cliSrc, filePath }) {
  const source = readFileSync(filePath, 'utf8');

  for (const specifier of importSpecifiers(source)) {
    const resolved = resolveImport(filePath, specifier);
    const bareSpecifier = specifier.replace(/^node:/, '');
    if (
      isPackageImport(specifier, '@lpc-toolkit/presets') ||
      isPackageImport(specifier, '@lpc-toolkit/web') ||
      isPackageImport(specifier, '@lpc-toolkit/cli') ||
      reactImports.has(specifier) ||
      specifier.startsWith('react/') ||
      specifier.startsWith('node:') ||
      nodeBuiltins.has(bareSpecifier) ||
      concreteCanvasImports.has(specifier) ||
      (resolved && (
        isInside(resolved, presetsSrc) ||
        isInside(resolved, webSrc) ||
        isInside(resolved, cliSrc)
      ))
    ) {
      addIssue(issues, root, filePath, `forbidden core import "${specifier}"`);
    }
  }

  const runtimeSource = stripCommentsAndStrings(source);
  for (const name of coreRuntimeGlobals) {
    const pattern = new RegExp(`\\b${name}\\b`);
    if (pattern.test(runtimeSource)) {
      addIssue(
        issues,
        root,
        filePath,
        `forbidden core runtime global "${name}"`,
      );
    }
  }
}

function checkWebFile({ issues, root, coreSrc, filePath }) {
  const source = readFileSync(filePath, 'utf8');

  for (const specifier of importSpecifiers(source)) {
    const resolved = resolveImport(filePath, specifier);
    if (
      specifier.startsWith('@lpc-toolkit/core/') ||
      specifier.includes('packages/core/src') ||
      (resolved && isInside(resolved, coreSrc))
    ) {
      addIssue(
        issues,
        root,
        filePath,
        `web must import core through @lpc-toolkit/core, not "${specifier}"`,
      );
    }
  }
}

function checkPresetsFile({ issues, root, presetsSrc, webSrc, cliSrc, filePath }) {
  const source = readFileSync(filePath, 'utf8');

  for (const specifier of importSpecifiers(source)) {
    const resolved = resolveImport(filePath, specifier);
    if (
      isPackageImport(specifier, '@lpc-toolkit/web') ||
      isPackageImport(specifier, '@lpc-toolkit/cli') ||
      reactImports.has(specifier) ||
      specifier.startsWith('react/') ||
      nodeFilesystemImports.has(specifier) ||
      concreteCanvasImports.has(specifier) ||
      (resolved && (
        isInside(resolved, webSrc) ||
        isInside(resolved, cliSrc)
      ))
    ) {
      addIssue(issues, root, filePath, `forbidden presets import "${specifier}"`);
    }
  }

  const runtimeSource = stripCommentsAndStrings(source);
  for (const name of coreRuntimeGlobals) {
    const pattern = new RegExp(`\\b${name}\\b`);
    if (pattern.test(runtimeSource)) {
      addIssue(
        issues,
        root,
        filePath,
        `forbidden presets runtime global "${name}"`,
      );
    }
  }
}

function checkBoundaries(root) {
  const coreSrc = path.join(root, 'packages/core/src');
  const presetsSrc = path.join(root, 'packages/presets/src');
  const webSrc = path.join(root, 'packages/web/src');
  const cliSrc = path.join(root, 'packages/cli/src');
  const issues = [];

  for (const filePath of sourceFiles(coreSrc)) {
    checkCoreFile({ issues, root, coreSrc, presetsSrc, webSrc, cliSrc, filePath });
  }

  for (const filePath of sourceFiles(presetsSrc)) {
    checkPresetsFile({ issues, root, presetsSrc, webSrc, cliSrc, filePath });
  }

  for (const filePath of sourceFiles(webSrc)) {
    checkWebFile({ issues, root, coreSrc, filePath });
  }

  return issues;
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : '';
const thisFile = fileURLToPath(import.meta.url);

if (invokedPath === thisFile) {
  const root = path.resolve(process.argv[2] ?? process.cwd());
  const issues = checkBoundaries(root);

  if (issues.length > 0) {
    console.error('Architecture boundary check failed:');
    for (const issue of issues) console.error(`- ${issue}`);
    process.exitCode = 1;
  } else {
    console.log('Architecture boundary check passed.');
  }
}

export { checkBoundaries };
