import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { builtinModules } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const sourceExtensions = new Set(['.js', '.jsx', '.ts', '.tsx']);
const scriptKinds = new Map([
  ['.js', ts.ScriptKind.JS],
  ['.jsx', ts.ScriptKind.JSX],
  ['.ts', ts.ScriptKind.TS],
  ['.tsx', ts.ScriptKind.TSX],
]);
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

function parseSource(filePath, source) {
  const parsed = ts.createSourceFile(
    filePath,
    source,
    ts.ScriptTarget.Latest,
    true,
    scriptKinds.get(path.extname(filePath)),
  );
  if (parsed.parseDiagnostics.length > 0) {
    const message = ts.flattenDiagnosticMessageText(
      parsed.parseDiagnostics[0].messageText,
      '\n',
    );
    throw new Error(`${filePath}: unable to parse source: ${message}`);
  }
  return parsed;
}

function walk(node, visitor) {
  visitor(node);
  ts.forEachChild(node, (child) => walk(child, visitor));
}

function stringSpecifier(node) {
  return node && ts.isStringLiteralLike(node) ? node.text : null;
}

function importSpecifiers(sourceFile) {
  const specifiers = [];
  walk(sourceFile, (node) => {
    if (ts.isImportDeclaration(node)) {
      const specifier = stringSpecifier(node.moduleSpecifier);
      if (specifier !== null) specifiers.push(specifier);
    } else if (ts.isExportDeclaration(node) && node.moduleSpecifier) {
      const specifier = stringSpecifier(node.moduleSpecifier);
      if (specifier !== null) specifiers.push(specifier);
    } else if (
      ts.isCallExpression(node) &&
      node.expression.kind === ts.SyntaxKind.ImportKeyword
    ) {
      const specifier = stringSpecifier(node.arguments[0]);
      if (specifier !== null) specifiers.push(specifier);
    }
  });
  return specifiers;
}

function isTypePosition(node) {
  for (let current = node.parent; current; current = current.parent) {
    if (ts.isTypeNode(current)) return true;
    if (ts.isStatement(current) || ts.isExpression(current)) return false;
  }
  return false;
}

function isIdentifierReference(node) {
  const parent = node.parent;
  if (isTypePosition(node)) return false;
  if (ts.isShorthandPropertyAssignment(parent)) return true;
  if (ts.isPropertyAccessExpression(parent) && parent.name === node) return false;
  if (ts.isPropertyAssignment(parent) && parent.name === node) return false;
  if (ts.isBindingElement(parent) && parent.propertyName === node) return false;
  if (ts.isImportClause(parent) || ts.isImportSpecifier(parent) ||
      ts.isNamespaceImport(parent) || ts.isExportSpecifier(parent)) return false;
  if ((ts.isLabeledStatement(parent) || ts.isBreakOrContinueStatement(parent)) &&
      parent.label === node) return false;
  if ('name' in parent && parent.name === node) return false;
  return true;
}

function runtimeWords(sourceFile) {
  const words = new Set();
  walk(sourceFile, (node) => {
    if (ts.isIdentifier(node) && isIdentifierReference(node)) words.add(node.text);
  });
  return words;
}

function unwrapExpression(node) {
  let current = node;
  while (ts.isParenthesizedExpression(current) || ts.isAwaitExpression(current)) {
    current = current.expression;
  }
  return current;
}

function isCoreDynamicImport(node) {
  const expression = unwrapExpression(node);
  return ts.isCallExpression(expression) &&
    expression.expression.kind === ts.SyntaxKind.ImportKeyword &&
    stringSpecifier(expression.arguments[0]) === '@lpc-toolkit/core';
}

function bindingContainsCompose(name) {
  return ts.isObjectBindingPattern(name) && name.elements.some((element) => {
    const importedName = element.propertyName ?? element.name;
    return ts.isIdentifier(importedName) && importedName.text === 'composeSelections';
  });
}

function bindingDeclaresName(name, identifier) {
  if (ts.isIdentifier(name)) return name.text === identifier;
  return name.elements.some((element) =>
    !ts.isOmittedExpression(element) && bindingDeclaresName(element.name, identifier));
}

function scopeDeclaresName(node, identifier) {
  if (ts.isFunctionLike(node)) {
    return node.parameters.some((parameter) =>
      bindingDeclaresName(parameter.name, identifier));
  }
  if (!ts.isBlock(node)) return false;
  return node.statements.some((statement) =>
    ts.isVariableStatement(statement) && statement.declarationList.declarations.some(
      (declaration) => bindingDeclaresName(declaration.name, identifier),
    ));
}

function callbackUsesCompose(callback) {
  if (!ts.isArrowFunction(callback) && !ts.isFunctionExpression(callback)) return false;
  const parameter = callback.parameters[0]?.name;
  if (!parameter) return false;
  if (bindingContainsCompose(parameter)) return true;
  if (!ts.isIdentifier(parameter)) return false;
  let usesCompose = false;
  function visit(node) {
    if (node !== callback.body && scopeDeclaresName(node, parameter.text)) return;
    if (ts.isPropertyAccessExpression(node) &&
        ts.isIdentifier(node.expression) &&
        node.expression.text === parameter.text &&
        node.name.text === 'composeSelections') {
      usesCompose = true;
    }
    ts.forEachChild(node, visit);
  }
  visit(callback.body);
  return usesCompose;
}

function importsCoreCompose(sourceFile) {
  let found = false;
  walk(sourceFile, (node) => {
    if (found) return;
    if (ts.isImportDeclaration(node) &&
        stringSpecifier(node.moduleSpecifier) === '@lpc-toolkit/core' &&
        !node.importClause?.isTypeOnly &&
        node.importClause?.namedBindings &&
        ts.isNamedImports(node.importClause.namedBindings)) {
      found = node.importClause.namedBindings.elements.some((element) =>
        !element.isTypeOnly &&
        (element.propertyName ?? element.name).text === 'composeSelections');
      return;
    }
    if (ts.isExportDeclaration(node) &&
        stringSpecifier(node.moduleSpecifier) === '@lpc-toolkit/core' &&
        !node.isTypeOnly &&
        node.exportClause && ts.isNamedExports(node.exportClause)) {
      found = node.exportClause.elements.some((element) =>
        !element.isTypeOnly &&
        (element.propertyName ?? element.name).text === 'composeSelections');
      return;
    }
    if (ts.isVariableDeclaration(node) && node.initializer &&
        bindingContainsCompose(node.name) && isCoreDynamicImport(node.initializer)) {
      found = true;
      return;
    }
    if (ts.isPropertyAccessExpression(node) &&
        node.name.text === 'composeSelections' &&
        isCoreDynamicImport(node.expression)) {
      found = true;
      return;
    }
    if (ts.isCallExpression(node) &&
        ts.isPropertyAccessExpression(node.expression) &&
        node.expression.name.text === 'then' &&
        isCoreDynamicImport(node.expression.expression) &&
        callbackUsesCompose(node.arguments[0])) {
      found = true;
    }
  });
  return found;
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

function isConcreteCanvasImport(specifier) {
  return [...concreteCanvasImports].some((packageName) =>
    isPackageImport(specifier, packageName));
}

function addIssue(issues, root, filePath, message) {
  issues.push(`${relativePath(root, filePath)}: ${message}`);
}

function checkCoreFile({ issues, root, coreSrc, presetsSrc, webSrc, cliSrc, filePath }) {
  const source = readFileSync(filePath, 'utf8');
  const sourceFile = parseSource(filePath, source);

  for (const specifier of importSpecifiers(sourceFile)) {
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
      isConcreteCanvasImport(specifier) ||
      (resolved && (
        isInside(resolved, presetsSrc) ||
        isInside(resolved, webSrc) ||
        isInside(resolved, cliSrc)
      ))
    ) {
      addIssue(issues, root, filePath, `forbidden core import "${specifier}"`);
    }
  }

  const words = runtimeWords(sourceFile);
  for (const name of coreRuntimeGlobals) {
    if (words.has(name)) {
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
  const sourceFile = parseSource(filePath, source);

  for (const specifier of importSpecifiers(sourceFile)) {
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

function extensionless(filePath) {
  const extension = path.extname(filePath);
  return sourceExtensions.has(extension) ? filePath.slice(0, -extension.length) : filePath;
}

function checkWebComponentFile({ issues, root, webSrc, filePath }) {
  const source = readFileSync(filePath, 'utf8');
  const sourceFile = parseSource(filePath, source);
  const forbiddenModules = new Set([
    path.join(webSrc, 'adapter/browser-canvas-adapter'),
    path.join(webSrc, 'lib/character-export'),
    path.join(webSrc, 'lib/spritesheet-export'),
    path.join(webSrc, 'lib/zip-export'),
  ]);

  if (importsCoreCompose(sourceFile)) {
    addIssue(
      issues,
      root,
      filePath,
      'forbidden web component import "composeSelections"',
    );
  }

  for (const specifier of importSpecifiers(sourceFile)) {
    const resolved = resolveImport(filePath, specifier);
    if (resolved && forbiddenModules.has(extensionless(resolved))) {
      addIssue(
        issues,
        root,
        filePath,
        `forbidden web component import "${specifier}"`,
      );
    }
  }
}

function checkPresetsFile({ issues, root, webSrc, cliSrc, filePath }) {
  const source = readFileSync(filePath, 'utf8');
  const sourceFile = parseSource(filePath, source);

  for (const specifier of importSpecifiers(sourceFile)) {
    const resolved = resolveImport(filePath, specifier);
    if (
      isPackageImport(specifier, '@lpc-toolkit/web') ||
      isPackageImport(specifier, '@lpc-toolkit/cli') ||
      reactImports.has(specifier) ||
      specifier.startsWith('react/') ||
      nodeFilesystemImports.has(specifier) ||
      isConcreteCanvasImport(specifier) ||
      (resolved && (
        isInside(resolved, webSrc) ||
        isInside(resolved, cliSrc)
      ))
    ) {
      addIssue(issues, root, filePath, `forbidden presets import "${specifier}"`);
    }
  }

  const words = runtimeWords(sourceFile);
  for (const name of coreRuntimeGlobals) {
    if (words.has(name)) {
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
  const webComponents = path.join(webSrc, 'components');
  const cliSrc = path.join(root, 'packages/cli/src');
  const issues = [];

  for (const filePath of sourceFiles(coreSrc)) {
    checkCoreFile({ issues, root, coreSrc, presetsSrc, webSrc, cliSrc, filePath });
  }

  for (const filePath of sourceFiles(presetsSrc)) {
    checkPresetsFile({ issues, root, webSrc, cliSrc, filePath });
  }

  for (const filePath of sourceFiles(webSrc)) {
    checkWebFile({ issues, root, coreSrc, filePath });
    if (isInside(filePath, webComponents)) {
      checkWebComponentFile({ issues, root, webSrc, filePath });
    }
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
