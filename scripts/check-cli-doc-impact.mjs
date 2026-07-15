#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const TRIGGER_PREFIXES = [
  'packages/cli/src/',
  'packages/cli/scripts/',
  'plugins/lpc-toolkit/',
];

const TRIGGER_FILES = new Set([
  'packages/cli/package.json',
  'asset-release.json',
  '.github/workflows/cli-release-candidate.yml',
  '.github/workflows/publish.yml',
]);

const SURFACE_MATCHERS = Object.freeze({
  help: (filePath) => filePath === 'packages/cli/src/command-spec.ts',
  'cli-readme': (filePath) => filePath === 'packages/cli/README.md',
  'root-readme': (filePath) => filePath === 'README.md',
  landing: (filePath) =>
    filePath === 'packages/web/src/components/landing-page.tsx',
  architecture: (filePath) => filePath === 'docs/ARCHITECTURE.md',
  engineering: (filePath) => filePath === 'docs/ENGINEERING.md',
  releasing: (filePath) => filePath === 'docs/RELEASING.md',
  plugin: (filePath) => filePath.startsWith('plugins/lpc-toolkit/skills/'),
});

export const CLI_DOC_SURFACES = Object.freeze(Object.keys(SURFACE_MATCHERS));

function normalizedPath(filePath) {
  return filePath.replaceAll('\\', '/').replace(/^\.\//u, '');
}

export function isCliDocsSensitivePath(filePath) {
  const normalized = normalizedPath(filePath);
  return TRIGGER_FILES.has(normalized)
    || TRIGGER_PREFIXES.some((prefix) => normalized.startsWith(prefix));
}

function declarationFieldLines(pullRequestBody) {
  const fields = new Map([
    ['impact', []],
    ['surfaces', []],
    ['reason', []],
  ]);
  const patterns = new Map([
    ['impact', /^CLI docs impact:\s*(.*)$/u],
    ['surfaces', /^CLI docs surfaces:\s*(.*)$/u],
    ['reason', /^CLI docs reason:\s*(.*)$/u],
  ]);

  for (const line of pullRequestBody.split(/\r?\n/u)) {
    for (const [field, pattern] of patterns) {
      const match = line.match(pattern);
      if (match) fields.get(field).push((match[1] ?? '').trim());
    }
  }
  return fields;
}

export function parseCliDocsDeclaration(pullRequestBody) {
  const fields = declarationFieldLines(pullRequestBody);
  const errors = [];
  for (const [field, values] of fields) {
    if (values.length === 0) {
      errors.push(`Missing CLI docs ${field} field.`);
    } else if (values.length > 1) {
      errors.push(`Duplicate CLI docs ${field} field.`);
    }
  }

  const impact = fields.get('impact')[0] ?? '';
  const surfaceValue = fields.get('surfaces')[0] ?? '';
  const reason = fields.get('reason')[0] ?? '';
  const surfaces = [...new Set(
    surfaceValue.split(',').map((surface) => surface.trim()).filter(Boolean),
  )];

  return { impact, surfaces, reason, errors };
}

function declarationErrors(declaration, changedFiles) {
  const errors = [...declaration.errors];
  const { impact, surfaces, reason } = declaration;
  if (impact !== 'updated' && impact !== 'not-applicable') {
    errors.push('CLI docs impact must be exactly updated or not-applicable.');
  }

  const unknown = surfaces.filter(
    (surface) => surface !== 'none' && !(surface in SURFACE_MATCHERS),
  );
  if (unknown.length > 0) {
    errors.push(`Unknown CLI docs surface token(s): ${unknown.join(', ')}.`);
  }
  if (surfaces.includes('none') && surfaces.length > 1) {
    errors.push('CLI docs surface none cannot be combined with another surface.');
  }

  if (impact === 'updated') {
    if (surfaces.length === 0 || surfaces.includes('none')) {
      errors.push('CLI docs impact updated requires at least one documentation surface.');
    }
    for (const surface of surfaces) {
      const matcher = SURFACE_MATCHERS[surface];
      if (matcher && !changedFiles.some((filePath) => matcher(filePath))) {
        errors.push(`Declared CLI docs surface ${surface} is not present in the diff.`);
      }
    }
  }

  if (impact === 'not-applicable') {
    if (surfaces.length !== 1 || surfaces[0] !== 'none') {
      errors.push('CLI docs impact not-applicable requires surfaces to be exactly none.');
    }
    if (reason.length < 20 || reason.includes('<!--')) {
      errors.push('CLI docs reason must contain at least 20 concrete characters.');
    }
  }
  return errors;
}

export function evaluateCliDocsImpact({ changedFiles, pullRequestBody }) {
  const normalizedFiles = changedFiles.map(normalizedPath).filter(Boolean);
  const sensitiveFiles = normalizedFiles.filter(isCliDocsSensitivePath);
  if (sensitiveFiles.length === 0) {
    return { ok: true, required: false, sensitiveFiles: [], errors: [] };
  }

  const declaration = parseCliDocsDeclaration(pullRequestBody);
  const errors = declarationErrors(declaration, normalizedFiles);
  if (pullRequestBody.trim() === '') {
    errors.unshift('CLI documentation impact declaration is required.');
  }
  return {
    ok: errors.length === 0,
    required: true,
    sensitiveFiles,
    errors,
  };
}

class InvocationError extends Error {}

function readOption(argv, index, option) {
  const value = argv[index + 1];
  if (!value || value.startsWith('--')) {
    throw new InvocationError(`${option} requires a value.`);
  }
  return value;
}

export function parseCliDocsInvocation(argvInput) {
  const argv = argvInput[0] === '--' ? argvInput.slice(1) : argvInput;
  if (argv.length === 0) return undefined;
  const options = {};
  for (let index = 0; index < argv.length; index += 2) {
    const option = argv[index];
    if (!['--base', '--head', '--body-file'].includes(option)) {
      throw new InvocationError(`Unknown option: ${option ?? ''}`);
    }
    const value = readOption(argv, index, option);
    if (option === '--base') options.base = value;
    if (option === '--head') options.head = value;
    if (option === '--body-file') options.bodyFile = value;
  }
  if (!options.base || !options.head || !options.bodyFile) {
    throw new InvocationError(
      'Reproduction mode requires --base, --head, and --body-file.',
    );
  }
  return options;
}

function eventInput(eventPath) {
  if (!eventPath) {
    throw new InvocationError('GITHUB_EVENT_PATH is required in CI mode.');
  }
  const event = JSON.parse(readFileSync(eventPath, 'utf8'));
  const pullRequest = event.pull_request;
  const base = pullRequest?.base?.sha;
  const head = pullRequest?.head?.sha;
  if (typeof base !== 'string' || typeof head !== 'string') {
    throw new InvocationError('GitHub event does not contain pull request base/head SHAs.');
  }
  return {
    base,
    head,
    pullRequestBody: typeof pullRequest.body === 'string' ? pullRequest.body : '',
  };
}

function changedFiles(base, head) {
  return execFileSync('git', ['diff', '--name-only', `${base}...${head}`], {
    encoding: 'utf8',
  }).split(/\r?\n/u).map((filePath) => filePath.trim()).filter(Boolean);
}

function failureText(result) {
  return [
    ...result.errors.map((error) => `- ${error}`),
    '',
    'Sensitive files:',
    ...result.sensitiveFiles.map((filePath) => `- ${filePath}`),
    '',
    'Add these fields to the pull request body:',
    'CLI docs impact: updated | not-applicable',
    `CLI docs surfaces: ${CLI_DOC_SURFACES.join(', ')} | none`,
    'CLI docs reason: required for not-applicable',
  ].join('\n');
}

export function runCliDocsImpactCheck(argv = process.argv.slice(2), env = process.env) {
  const invocation = parseCliDocsInvocation(argv);
  const input = invocation
    ? {
        base: invocation.base,
        head: invocation.head,
        pullRequestBody: readFileSync(invocation.bodyFile, 'utf8'),
      }
    : eventInput(env.GITHUB_EVENT_PATH);
  const result = evaluateCliDocsImpact({
    changedFiles: changedFiles(input.base, input.head),
    pullRequestBody: input.pullRequestBody,
  });
  if (!result.ok) {
    process.stderr.write(`${failureText(result)}\n`);
    return 1;
  }
  process.stdout.write(result.required
    ? 'CLI documentation impact declaration is valid.\n'
    : 'No CLI-sensitive documentation impact declaration is required.\n');
  return 0;
}

function main() {
  try {
    process.exitCode = runCliDocsImpactCheck();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`CLI documentation impact checker could not run: ${message}\n`);
    process.exitCode = 2;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
