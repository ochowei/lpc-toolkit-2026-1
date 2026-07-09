import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export function readCliPackageVersion(moduleUrl: string = import.meta.url): string {
  const packageUrl = new URL('../package.json', moduleUrl);
  const parsed = JSON.parse(readFileSync(fileURLToPath(packageUrl), 'utf8')) as unknown;
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error('CLI package metadata must be an object.');
  }
  const version = (parsed as Readonly<Record<string, unknown>>).version;
  if (typeof version !== 'string' || version.length === 0) {
    throw new Error('CLI package metadata is missing version.');
  }
  return version;
}

export const CLI_VERSION = readCliPackageVersion();
