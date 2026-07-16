import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export const SUPPORTED_CLI = Object.freeze({
  min: '0.1.4',
  maxExclusive: '0.2.0',
});

const IDENTIFIER = '[0-9A-Za-z-]+';
const VERSION = new RegExp(
  `^(0|[1-9]\\d*)\\.(0|[1-9]\\d*)\\.(0|[1-9]\\d*)`
    + `(?:-(${IDENTIFIER}(?:\\.${IDENTIFIER})*))?`
    + `(?:\\+(${IDENTIFIER}(?:\\.${IDENTIFIER})*))?$`,
  'u',
);
const NUMERIC_IDENTIFIER = /^\d+$/u;
const supportedRange = `>=${SUPPORTED_CLI.min} <${SUPPORTED_CLI.maxExclusive}`;

function parseSemver(input) {
  const match = VERSION.exec(input.trim());
  if (!match) throw new Error(`Invalid semantic version: ${input}`);
  const prerelease = match[4]?.split('.') ?? [];
  if (prerelease.some((identifier) => (
    identifier.length === 0
      || (NUMERIC_IDENTIFIER.test(identifier) && identifier.length > 1 && identifier.startsWith('0'))
  ))) {
    throw new Error(`Invalid semantic version: ${input}`);
  }
  return {
    major: match[1],
    minor: match[2],
    patch: match[3],
    prerelease,
  };
}

function compareNumericIdentifiers(left, right) {
  if (left.length !== right.length) return Math.sign(left.length - right.length);
  if (left === right) return 0;
  return left < right ? -1 : 1;
}

function comparePrerelease(left, right) {
  if (left.length === 0 && right.length === 0) return 0;
  if (left.length === 0) return 1;
  if (right.length === 0) return -1;
  const length = Math.max(left.length, right.length);
  for (let index = 0; index < length; index++) {
    const a = left[index];
    const b = right[index];
    if (a === undefined) return -1;
    if (b === undefined) return 1;
    if (a === b) continue;
    const aIsNumeric = NUMERIC_IDENTIFIER.test(a);
    const bIsNumeric = NUMERIC_IDENTIFIER.test(b);
    if (aIsNumeric && bIsNumeric) return compareNumericIdentifiers(a, b);
    if (aIsNumeric) return -1;
    if (bIsNumeric) return 1;
    return a < b ? -1 : 1;
  }
  return 0;
}

export function compareSemver(leftInput, rightInput) {
  const left = parseSemver(leftInput);
  const right = parseSemver(rightInput);
  for (const key of ['major', 'minor', 'patch']) {
    const precedence = compareNumericIdentifiers(left[key], right[key]);
    if (precedence !== 0) return precedence;
  }
  return comparePrerelease(left.prerelease, right.prerelease);
}

function failure(code, message, installedVersion = null) {
  return {
    ok: false,
    installedVersion,
    supportedRange,
    errors: [{ code, message }],
  };
}

export function evaluateVersion(output) {
  const installedVersion = output.trim();
  try {
    const installed = parseSemver(installedVersion);
    const minimum = parseSemver(SUPPORTED_CLI.min);
    const prereleaseAdmitted = installed.prerelease.length === 0 || (
      installed.major === minimum.major
      && installed.minor === minimum.minor
      && installed.patch === minimum.patch
    );
    const supported = compareSemver(installedVersion, SUPPORTED_CLI.min) >= 0
      && compareSemver(installedVersion, SUPPORTED_CLI.maxExclusive) < 0
      && prereleaseAdmitted;
    return supported
      ? { ok: true, installedVersion, supportedRange, errors: [] }
      : failure('cli_version_unsupported', `Installed lpc-toolkit ${installedVersion} is outside ${supportedRange}.`, installedVersion);
  } catch {
    return failure('cli_version_invalid', `Could not parse lpc-toolkit version output: ${installedVersion || '(empty)'}.`);
  }
}

export function checkCli({
  binary = process.env.LPC_TOOLKIT_BIN ?? 'lpc-toolkit',
  versionArgs = ['--version'],
  spawn = spawnSync,
} = {}) {
  const result = spawn(binary, versionArgs, { encoding: 'utf8', shell: false });
  if (result.error) {
    return failure(
      result.error.code === 'ENOENT' ? 'cli_not_found' : 'cli_check_failed',
      result.error.code === 'ENOENT'
        ? 'lpc-toolkit is not installed or is not on PATH.'
        : `Failed to run lpc-toolkit --version: ${result.error.message}`,
    );
  }
  if (result.status !== 0) {
    return failure('cli_check_failed', `lpc-toolkit --version exited with status ${result.status}.`);
  }
  return evaluateVersion(result.stdout ?? '');
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  const nodeEntry = process.env.LPC_TOOLKIT_NODE_ENTRY;
  const result = nodeEntry
    ? checkCli({
        binary: process.execPath,
        versionArgs: [path.resolve(nodeEntry), '--version'],
      })
    : checkCli();
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  if (!result.ok) process.exitCode = 1;
}
