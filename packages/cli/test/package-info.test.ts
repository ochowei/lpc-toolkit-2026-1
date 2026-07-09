import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { describe, expect, it } from 'vitest';
import { readCliPackageVersion } from '../src/package-info.js';

describe('readCliPackageVersion', () => {
  it('reads the package adjacent to source or built runtime directories', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'lpc-package-info-'));
    writeFileSync(path.join(root, 'package.json'), '{"version":"0.1.0"}\n');
    const moduleUrl = pathToFileURL(path.join(root, 'dist/package-info.js')).href;

    expect(readCliPackageVersion(moduleUrl)).toBe('0.1.0');
  });

  it('rejects missing version metadata', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'lpc-package-info-'));
    writeFileSync(path.join(root, 'package.json'), '{}\n');
    const moduleUrl = pathToFileURL(path.join(root, 'src/package-info.ts')).href;

    expect(() => readCliPackageVersion(moduleUrl)).toThrow(/version/);
  });
});
