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

function sourceTokens(source) {
  const tokens = [];

  function tokenizeTemplate(start) {
    const markerIndex = tokens.length;
    tokens.push({ kind: 'computed-template', value: '' });
    const contentStart = start;
    let hasSubstitution = false;
    let index = start;
    while (index < source.length) {
      if (source[index] === '\\') {
        index += 2;
      } else if (source[index] === '`') {
        if (!hasSubstitution) {
          tokens[markerIndex] = {
            kind: 'template',
            value: source.slice(contentStart, index),
          };
        }
        return index + 1;
      } else if (source[index] === '$' && source[index + 1] === '{') {
        hasSubstitution = true;
        index = tokenizeCode(index + 2, '}');
      } else {
        index += 1;
      }
    }
    return index;
  }

  function tokenizeCode(start, terminator) {
    let index = start;
    while (index < source.length) {
      const char = source[index];
      const next = source[index + 1];

      if (terminator && char === terminator) {
        tokens.push({ kind: 'punctuation', value: char });
        return index + 1;
      }

      if (/\s/.test(char)) {
        index += 1;
        continue;
      }

      if (char === '/' && next === '/') {
        index = source.indexOf('\n', index + 2);
        if (index === -1) return source.length;
        continue;
      }

      if (char === '/' && next === '*') {
        const end = source.indexOf('*/', index + 2);
        index = end === -1 ? source.length : end + 2;
        continue;
      }

      if (char === '/' && canStartRegex(tokens.at(-1))) {
        index += 1;
        let inCharacterClass = false;
        while (index < source.length) {
          if (source[index] === '\\') {
            index += 2;
          } else if (source[index] === '[') {
            inCharacterClass = true;
            index += 1;
          } else if (source[index] === ']') {
            inCharacterClass = false;
            index += 1;
          } else if (source[index] === '/' && !inCharacterClass) {
            index += 1;
            while (/[A-Za-z]/.test(source[index] ?? '')) index += 1;
            break;
          } else {
            index += 1;
          }
        }
        tokens.push({ kind: 'regex', value: '' });
        continue;
      }

      if (char === '`') {
        index = tokenizeTemplate(index + 1);
        continue;
      }

      if (char === "'" || char === '"') {
        const quote = char;
        const stringStart = index + 1;
        index += 1;
        while (index < source.length && source[index] !== quote) {
          index += source[index] === '\\' ? 2 : 1;
        }
        tokens.push({ kind: 'string', value: source.slice(stringStart, index) });
        index += 1;
        continue;
      }

      if (/[A-Za-z_$]/.test(char)) {
        const wordStart = index;
        index += 1;
        while (index < source.length && /[\w$]/.test(source[index])) index += 1;
        tokens.push({ kind: 'word', value: source.slice(wordStart, index) });
        continue;
      }

      if (/\d/.test(char)) {
        const numberStart = index;
        index += 1;
        while (/[\w.]/.test(source[index] ?? '')) index += 1;
        tokens.push({ kind: 'number', value: source.slice(numberStart, index) });
        continue;
      }

      if (char === '{') {
        tokens.push({ kind: 'punctuation', value: char });
        index = tokenizeCode(index + 1, '}');
        continue;
      }

      tokens.push({ kind: 'punctuation', value: char });
      index += 1;
    }
    return index;
  }

  tokenizeCode(0, null);
  return tokens;
}

function canStartRegex(previousToken) {
  if (!previousToken) return true;
  if (previousToken.kind === 'word') {
    return new Set([
      'await',
      'case',
      'delete',
      'in',
      'instanceof',
      'new',
      'return',
      'throw',
      'typeof',
      'void',
      'yield',
    ]).has(previousToken.value);
  }
  if (['number', 'string', 'template', 'regex'].includes(previousToken.kind)) {
    return false;
  }
  return ![')', ']', '}'].includes(previousToken.value);
}

function matchingPunctuation(tokens, start, open, close) {
  let depth = 0;
  for (let index = start; index < tokens.length; index += 1) {
    if (tokens[index].value === open) depth += 1;
    if (tokens[index].value === close) depth -= 1;
    if (depth === 0) return index;
  }
  return -1;
}

function containsWord(tokens, start, end, word) {
  return tokens
    .slice(start, end)
    .some((token) => token.kind === 'word' && token.value === word);
}

function runtimeWords(source) {
  return new Set(
    sourceTokens(source)
      .filter((token) => token.kind === 'word')
      .map((token) => token.value),
  );
}

function importSpecifiers(source) {
  const tokens = sourceTokens(source);

  const specifiers = [];
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];

    if (token.kind === 'word' && token.value === 'import') {
      const nextToken = tokens[index + 1];
      if (nextToken?.value === '.') continue;
      if (nextToken?.value === '(') {
        if (['string', 'template'].includes(tokens[index + 2]?.kind)) {
          specifiers.push(tokens[index + 2].value);
        }
        continue;
      }

      for (let cursor = index + 1; cursor < tokens.length; cursor += 1) {
        const candidate = tokens[cursor];
        if (candidate.value === ';') break;
        if (candidate.kind === 'string') {
          specifiers.push(candidate.value);
          break;
        }
      }
    }

    if (token.kind === 'word' && token.value === 'export') {
      for (let cursor = index + 1; cursor < tokens.length; cursor += 1) {
        const candidate = tokens[cursor];
        if (candidate.value === ';') break;
        if (
          candidate.kind === 'word' &&
          candidate.value === 'from' &&
          tokens[cursor + 1]?.kind === 'string'
        ) {
          specifiers.push(tokens[cursor + 1].value);
          break;
        }
      }
    }
  }

  return specifiers;
}

function staticImports(source) {
  const tokens = sourceTokens(source);
  const imports = [];

  for (let index = 0; index < tokens.length; index += 1) {
    if (tokens[index].kind !== 'word' || tokens[index].value !== 'import') continue;
    if (tokens[index + 1]?.value === '.' || tokens[index + 1]?.value === '(') continue;

    let openBrace = -1;
    let closeBrace = -1;
    let specifier = null;
    for (let cursor = index + 1; cursor < tokens.length; cursor += 1) {
      const token = tokens[cursor];
      if (token.value === ';') break;
      if (token.value === '{' && openBrace === -1) openBrace = cursor;
      if (token.value === '}' && openBrace !== -1) closeBrace = cursor;
      if (token.kind === 'string') {
        specifier = token.value;
        break;
      }
    }

    if (!specifier) continue;
    const names = [];
    if (openBrace !== -1 && closeBrace > openBrace) {
      for (let cursor = openBrace + 1; cursor < closeBrace; cursor += 1) {
        const token = tokens[cursor];
        if (token.kind !== 'word' || token.value === 'type') continue;
        names.push(token.value);
        while (tokens[cursor + 1]?.kind === 'word' && tokens[cursor + 1].value === 'as') {
          cursor += 2;
        }
      }
    }
    imports.push({ specifier, names });
  }

  return imports;
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

  const words = runtimeWords(source);
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

function extensionless(filePath) {
  const extension = path.extname(filePath);
  return sourceExtensions.has(extension) ? filePath.slice(0, -extension.length) : filePath;
}

function checkWebComponentFile({ issues, root, webSrc, filePath }) {
  const source = readFileSync(filePath, 'utf8');
  const tokens = sourceTokens(source);
  const forbiddenModules = new Set([
    path.join(webSrc, 'adapter/browser-canvas-adapter'),
    path.join(webSrc, 'lib/character-export'),
    path.join(webSrc, 'lib/spritesheet-export'),
    path.join(webSrc, 'lib/zip-export'),
  ]);

  for (const imported of staticImports(source)) {
    const importsComposition =
      imported.specifier === '@lpc-toolkit/core' &&
      imported.names.includes('composeSelections');
    if (importsComposition) {
      addIssue(
        issues,
        root,
        filePath,
        'forbidden web component import "composeSelections"',
      );
    }
  }

  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (token.kind === 'word' && token.value === 'export') {
      let exportsComposition = false;
      let exportsFromCore = false;
      for (let cursor = index + 1; cursor < tokens.length && tokens[cursor].value !== ';'; cursor += 1) {
        if (tokens[cursor].kind === 'word' && tokens[cursor].value === 'composeSelections') {
          exportsComposition = true;
        }
        if (
          tokens[cursor].kind === 'word' &&
          tokens[cursor].value === 'from' &&
          tokens[cursor + 1]?.kind === 'string' &&
          tokens[cursor + 1].value === '@lpc-toolkit/core'
        ) {
          exportsFromCore = true;
        }
      }
      if (exportsComposition && exportsFromCore) {
        addIssue(issues, root, filePath, 'forbidden web component import "composeSelections"');
      }
    }

    if (
      token.kind === 'word' &&
      token.value === 'import' &&
      tokens[index + 1]?.value === '(' &&
      tokens[index + 2]?.kind === 'string' &&
      tokens[index + 2].value === '@lpc-toolkit/core'
    ) {
      const importClose = matchingPunctuation(tokens, index + 1, '(', ')');
      let importsComposition = false;

      if (
        tokens[importClose + 1]?.value === '.' &&
        tokens[importClose + 2]?.kind === 'word' &&
        tokens[importClose + 2].value === 'composeSelections'
      ) {
        importsComposition = true;
      }

      if (
        tokens[importClose + 1]?.value === '.' &&
        tokens[importClose + 2]?.kind === 'word' &&
        tokens[importClose + 2].value === 'then' &&
        tokens[importClose + 3]?.value === '('
      ) {
        const thenClose = matchingPunctuation(tokens, importClose + 3, '(', ')');
        importsComposition = containsWord(
          tokens,
          importClose + 4,
          thenClose,
          'composeSelections',
        );
      }

      let declarationStart = index - 1;
      while (
        declarationStart >= 0 &&
        tokens[declarationStart].value !== ';' &&
        !['const', 'let', 'var'].includes(tokens[declarationStart].value)
      ) {
        declarationStart -= 1;
      }
      if (['const', 'let', 'var'].includes(tokens[declarationStart]?.value)) {
        const assignment = tokens.findIndex(
          (candidate, candidateIndex) =>
            candidateIndex > declarationStart &&
            candidateIndex < index &&
            candidate.value === '=',
        );
        if (assignment !== -1) {
          importsComposition ||= containsWord(
            tokens,
            declarationStart + 1,
            assignment,
            'composeSelections',
          );
        }
      }

      if (importsComposition) {
        addIssue(issues, root, filePath, 'forbidden web component import "composeSelections"');
      }
    }
  }

  for (const specifier of importSpecifiers(source)) {
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

  for (const specifier of importSpecifiers(source)) {
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

  const words = runtimeWords(source);
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
