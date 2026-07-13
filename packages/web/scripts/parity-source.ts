import { existsSync, realpathSync } from 'node:fs';
import path from 'node:path';

export const PARITY_DIR_ENV = 'LPC_UPSTREAM_PARITY_DIR';

function canonicalizeIfExistingPath(pathValue: string): string {
  const resolved = path.resolve(pathValue);
  return existsSync(resolved) ? realpathSync(resolved) : resolved;
}

export function requireIsolatedParityDir(
  repoRoot: string,
  value = process.env[PARITY_DIR_ENV],
): string {
  if (!value?.trim()) {
    throw new Error(`${PARITY_DIR_ENV} is required for upstream parity.`);
  }
  if (!path.isAbsolute(value)) {
    throw new Error(`${PARITY_DIR_ENV} must be an absolute path.`);
  }

  const resolved = canonicalizeIfExistingPath(value);
  const trackedUpstream = canonicalizeIfExistingPath(
    path.resolve(repoRoot, 'upstream'),
  );
  if (
    resolved === trackedUpstream ||
    resolved.startsWith(`${trackedUpstream}${path.sep}`)
  ) {
    throw new Error(
      `${PARITY_DIR_ENV} must be outside the tracked upstream/ submodule.`,
    );
  }
  return resolved;
}
