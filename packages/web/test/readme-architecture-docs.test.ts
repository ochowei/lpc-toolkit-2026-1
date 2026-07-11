import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '../../..');
const readRepoFile = (filePath: string) =>
  readFileSync(path.join(repoRoot, filePath), 'utf8');

const readme = readRepoFile('README.md');
const architecture = readRepoFile('docs/ARCHITECTURE.md');
const cliPackage = JSON.parse(readRepoFile('packages/cli/package.json')) as {
  version: string;
};

type ClosureTableRow = readonly [string, string, string, string, string];

function parseClosureTableRow(line: string): ClosureTableRow {
  const cells = line.split('|').slice(1, -1).map((cell) => cell.trim());
  const [finding, disposition, commits, verification, result, extra] = cells;
  if (
    finding === undefined ||
    disposition === undefined ||
    commits === undefined ||
    verification === undefined ||
    result === undefined ||
    extra !== undefined
  ) {
    throw new Error(`Closure row must contain exactly five cells: ${line}`);
  }
  return [finding, disposition, commits, verification, result];
}

describe('README architecture contract', () => {
  it('documents the current CLI version and tagged release gates', () => {
    expect(readme).toContain(
      `\`@lpc-toolkit/cli\` version \`${cliPackage.version}\``,
    );
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
    expect(readme).not.toContain('tsc build across all packages');
    expect(readme).not.toContain('three-region grid desktop editor');
  });

  it('uses repository-relative documentation links', () => {
    expect(readme).not.toMatch(/file:\/\/|\/Users\/|[A-Z]:\\/);
    expect(readme).toContain(
      '[Layer Stack reference](reference/v2/LPC-Toolkit-LayerStack.html)',
    );
  });
});

describe('architecture ownership contract', () => {
  it('documents CLI asset lifecycle and AssetStore ownership', () => {
    for (const phrase of [
      'pinned manifest',
      'checksum verification',
      'platform cache',
      'working-directory `assets/`',
      '`assets_custom/`',
      '`createDirectoryAssetStore`',
      '`createZipAssetStore`',
    ]) {
      expect(architecture).toContain(phrase);
    }
  });

  it('documents web catalog and attribution ownership', () => {
    for (const phrase of [
      '`packages/web/src/catalog/`',
      '`ComposedSheet.credits`',
      'PNG/TXT/CSV',
      'thumbnail attribution exception',
    ]) {
      expect(architecture).toContain(phrase);
    }
  });

  it('documents boundary CI and isolated parity ownership', () => {
    expect(architecture).toContain('`rtk pnpm check:boundaries`');
    expect(architecture).toContain('CI unit job');
    expect(architecture).toContain('read-only provenance');
    expect(architecture).toContain('separate isolated checkout');
  });
});

describe('audit closure contract', () => {
  it('records complete evidence for findings 1 through 15', () => {
    const closurePath = path.join(
      repoRoot,
      'docs/README-ARCHITECTURE-AUDIT-CLOSURE.md',
    );
    expect(existsSync(closurePath)).toBe(true);

    const closure = readFileSync(closurePath, 'utf8');
    const rows = closure
      .split('\n')
      .filter((line) => /^\|\s*\d+\s*\|/.test(line))
      .map(parseClosureTableRow);

    expect(rows.map(([finding]) => Number(finding))).toEqual(
      Array.from({ length: 15 }, (_, index) => index + 1),
    );
    expect(new Set(rows.map(([finding]) => finding)).size).toBe(15);

    for (const [finding, disposition, commits, verification, result] of rows) {
      expect(Number(finding)).toBeGreaterThanOrEqual(1);
      expect(['fixed', 'documented approved exception']).toContain(disposition);
      expect(commits).toMatch(/`[0-9a-f]{9,40}`/);
      expect(verification).toMatch(/`rtk [^`]+`/);
      expect(result).toBe('PASS');

      const packageName = verification.match(
        /--filter @lpc-toolkit\/(core|web|cli)/,
      )?.[1];
      for (const testFile of verification.match(/[\w-]+\.test\.ts/g) ?? []) {
        expect(packageName, `${testFile} must name its workspace package`).toBeDefined();
        expect(
          existsSync(path.join(repoRoot, `packages/${packageName}/test`, testFile)),
          `${testFile} referenced by finding ${finding} must exist`,
        ).toBe(true);
      }
    }

    expect(rows[14]?.[1]).toBe('documented approved exception');
    expect(rows.slice(0, 14).every((row) => row[1] === 'fixed')).toBe(true);
    expect(closure).not.toMatch(/\b(?:TBD|TODO|pending)\b/i);
    expect(closure).not.toContain('docs/README-ARCHITECTURE-AUDIT.tmp.md');
  });
});
