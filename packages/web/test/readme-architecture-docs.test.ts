import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '../../..');
const readRepoFile = (filePath: string) =>
  readFileSync(path.join(repoRoot, filePath), 'utf8');

const readme = readRepoFile('README.md');
const cliPackage = JSON.parse(readRepoFile('packages/cli/package.json')) as {
  version: string;
};

describe('README architecture contract', () => {
  it('documents the current CLI version and tagged release gates', () => {
    expect(cliPackage.version).toBe('0.1.0');
    expect(readme).toContain('`@lpc-toolkit/cli` version `0.1.0`');
    expect(readme).toContain('`v<version>-rc.<number>`');
    expect(readme).toContain('`v<version>`');
    expect(readme).toContain('npm OIDC');
  });

  it('documents the current routes and responsive editor regions', () => {
    expect(readme).toContain('`/`, `/compose`, and the not-found route');
    for (const phrase of [
      'sidebar splitter',
      'preview canvas',
      'top-bar popovers',
      'responsive layout',
    ]) {
      expect(readme).toContain(phrase);
    }
  });

  it('categorizes the public core API and links its signature source', () => {
    expect(readme).toContain('[`API.md`](API.md)');
    for (const category of [
      'Catalog and palettes',
      'Selections and tokens',
      'Composition and animation',
      'Recoloring',
      'Credits and validation',
    ]) {
      expect(readme).toContain(category);
    }
  });

  it('documents sheet dimensions, asset lifecycle, and workspace builds', () => {
    for (const phrase of [
      'standard animation atlas',
      'custom-animation source sheets',
      'first-time asset preparation',
      'pinned release download',
      'verified cache reuse',
      'offline cache',
      'core, presets, web, and CLI',
      'isolated parity checkout',
    ]) {
      expect(readme).toContain(phrase);
    }
  });

  it('uses repository-relative documentation links', () => {
    expect(readme).not.toMatch(/file:\/\/|\/Users\/|[A-Z]:\\/);
    expect(readme).toContain(
      '[Layer Stack reference](reference/v2/LPC-Toolkit-LayerStack.html)',
    );
  });
});
