import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '../../..');
const readRepoFile = (filePath: string) =>
  readFileSync(path.join(repoRoot, filePath), 'utf8');
const readRepoFileIfExists = (filePath: string) => {
  const absolutePath = path.join(repoRoot, filePath);
  return existsSync(absolutePath) ? readFileSync(absolutePath, 'utf8') : '';
};
const rootPackage = JSON.parse(readRepoFile('package.json')) as {
  license: string;
  scripts: Record<string, string>;
};

const readme = readRepoFile('README.md');
const contributing = readRepoFileIfExists('CONTRIBUTING.md');
const cliReadme = readRepoFile('packages/cli/README.md');
const coreReadme = readRepoFile('packages/core/README.md');
const architecture = readRepoFile('docs/ARCHITECTURE.md');
const agents = readRepoFile('AGENTS.md');
const claude = readRepoFile('CLAUDE.md');
const engineering = readRepoFile('docs/ENGINEERING.md');
const onboarding = readRepoFile('docs/ONBOARDING.md');
const releasing = readRepoFileIfExists('docs/RELEASING.md');
const pullRequestTemplate = readRepoFileIfExists(
  '.github/pull_request_template.md',
);

const maintainedDocuments = new Map([
  ['README.md', readme],
  ['CONTRIBUTING.md', contributing],
  ['AGENTS.md', agents],
  ['CLAUDE.md', claude],
  ['docs/ARCHITECTURE.md', architecture],
  ['docs/ENGINEERING.md', engineering],
  ['docs/ONBOARDING.md', onboarding],
  ['docs/RELEASING.md', releasing],
  ['packages/cli/README.md', cliReadme],
  ['packages/core/README.md', coreReadme],
  ['.github/pull_request_template.md', pullRequestTemplate],
]);

function localMarkdownTargets(filePath: string, source: string): string[] {
  return [...source.matchAll(/\[[^\]]*\]\(([^)]+)\)/g)]
    .map((match) => match[1]?.replace(/^<|>$/g, '').split('#')[0] ?? '')
    .filter((target) => target !== '' && !/^[a-z]+:/i.test(target))
    .map((target) => path.resolve(repoRoot, path.dirname(filePath), target));
}

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
  it('routes contributor and maintainer workflows to focused documents', () => {
    expect(readme).toContain('[`CONTRIBUTING.md`](CONTRIBUTING.md)');
    expect(readme).toContain(
      '[`docs/ENGINEERING.md`](docs/ENGINEERING.md)',
    );
    expect(readme).toContain('[`docs/RELEASING.md`](docs/RELEASING.md)');
    expect(contributing).toContain('[Engineering guide](docs/ENGINEERING.md)');
    expect(contributing).toContain('[onboarding guide](docs/ONBOARDING.md)');
    expect(engineering).toContain('`rtk pnpm verify`');
    expect(releasing).toContain('CLI Release Candidate');
    expect(releasing).toContain('npm OIDC');
    expect(readme).not.toContain('Maintainers: RC validation');
    expect(readme).not.toContain('Trusted Publisher');
  });

  it('keeps maintained local Markdown links relative and resolvable', () => {
    for (const [filePath, source] of maintainedDocuments) {
      expect(source).not.toMatch(/file:\/\/|\/Users\/|[A-Z]:\\/);
      for (const target of localMarkdownTargets(filePath, source)) {
        expect(existsSync(target), `${filePath} -> ${target}`).toBe(true);
      }
    }
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

  it('routes the public core API to its package guide', () => {
    expect(readme).toContain(
      '[`packages/core/README.md`](packages/core/README.md)',
    );
    expect(coreReadme).toContain('[`API.md`](../../API.md)');
    for (const category of [
      'Catalog and palettes',
      'Selections and tokens',
      'Composition and animation',
      'Recoloring',
      'Credits and validation',
    ]) {
      expect(coreReadme).toContain(category);
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
    for (const document of [readme, architecture, agents, claude, onboarding]) {
      expect(document).toContain('optional');
      expect(document).toContain('read-only');
    }
    expect(readme).toContain('standard clone does not initialize the submodule');
    expect(readme).not.toContain('git clone --recurse-submodules');
    expect(readme).not.toContain('git submodule update --init');
    expect(architecture).toContain('dormant gitlink');
    expect(architecture).toContain('fixture provenance');
    expect(architecture).toContain('separate isolated checkout');
    expect(agents).toContain(
      'Normal workflows must not require it to be initialized.',
    );
    expect(claude).toContain(
      'Normal workflows must not require it to be initialized.',
    );
    expect(onboarding).toContain(
      'Do not initialize `upstream/` for normal setup.',
    );
    expect(readme).not.toContain('tsc build across all packages');
    expect(readme).not.toContain('three-region grid desktop editor');
  });

  it('uses repository-relative documentation links', () => {
    expect(readme).not.toMatch(/file:\/\/|\/Users\/|[A-Z]:\\/);
    expect(readme).toContain(
      '[Layer Stack reference](reference/v2/LPC-Toolkit-LayerStack.html)',
    );
  });

  it('links the persistent character authoring workflow', () => {
    expect(readme).toContain('Character authoring quick start');
    expect(readme).toContain('lpc-toolkit character create hero --preset farmer');
    expect(readme).toContain('[`packages/cli/README.md`](packages/cli/README.md)');
  });
});

describe('Codex plugin documentation contract', () => {
  it('documents installation, ownership, and verification', () => {
    const cliInstall = "npm install -g '@lpc-toolkit/cli@>=0.1.4 <0.2.0'";
    const marketplaceAdd = 'codex plugin marketplace add ochowei/lpc-toolkit-2026-1';
    const pluginAdd = 'codex plugin add lpc-toolkit@lpc-toolkit';

    for (const document of [readme, cliReadme]) {
      expect(document).toContain('Install or upgrade the CLI');
      expect(document).toContain(cliInstall);
      expect(document).not.toContain('lpc-toolkit-cli-0.1.4-beta-1.tgz');
      expect(document.indexOf(cliInstall)).toBeLessThan(
        document.indexOf(marketplaceAdd),
      );
      expect(document.indexOf(marketplaceAdd)).toBeLessThan(
        document.indexOf(pluginAdd),
      );
    }

    for (const phrase of [
      'codex plugin marketplace add ochowei/lpc-toolkit-2026-1',
      'codex plugin add lpc-toolkit@lpc-toolkit',
    ]) expect(readme).toContain(phrase);

    for (const phrase of [
      '`plugins/lpc-toolkit/`',
      'external `lpc-toolkit` executable',
      'does not duplicate CLI product logic',
    ]) expect(architecture).toContain(phrase);

    for (const phrase of [
      '`rtk pnpm verify:plugin`',
      'Codex plugin structure and skill contracts',
    ]) expect(engineering).toContain(phrase);
  });
});

describe('agent guidance contract', () => {
  it('keeps Codex and Claude guidance identical and current', () => {
    expect(claude).toBe(agents);
    expect(agents).toContain(`**License is ${rootPackage.license}.**`);
    expect(agents).toContain('`packages/presets/`');
    expect(agents).toContain('`packages/cli/`');
    expect(agents).toContain('`rtk pnpm verify`');
    expect(agents).toContain('docs/ENGINEERING.md');
    expect(agents).not.toContain('built later');
    expect(agents).not.toContain('planned CLI');
  });
});

describe('onboarding and engineering ownership contract', () => {
  it('provides a runnable first-day path for all active packages', () => {
    for (const phrase of [
      'Node.js 22',
      '`rtk pnpm install --frozen-lockfile`',
      '`rtk pnpm verify`',
      '`packages/core/`',
      '`packages/presets/`',
      '`packages/web/`',
      '`packages/cli/`',
      'Where Does This Change Belong?',
    ]) {
      expect(onboarding).toContain(phrase);
    }
    expect(onboarding).not.toContain('planned CLI');
  });

  it('keeps command policy in engineering and stable boundaries in architecture', () => {
    expect(architecture).toContain('## Executable Architecture Gate');
    expect(architecture).toContain('[Engineering guide](ENGINEERING.md)');
    expect(architecture).not.toContain(
      '## Testing and Verification Expectations',
    );
    expect(architecture).not.toContain('## Local Extraction Guidance');
    expect(engineering).toContain('## CI Mapping');
    expect(engineering).toContain('CI unit job');
  });

  it('uses RTK-safe explicit run forms for standalone typechecks', () => {
    expect(engineering).toContain('`rtk pnpm run typecheck`');
    for (const packageName of ['core', 'presets', 'web', 'cli']) {
      expect(engineering).toContain(
        `rtk pnpm --filter @lpc-toolkit/${packageName} run typecheck`,
      );
      expect(engineering).not.toContain(
        `rtk pnpm --filter @lpc-toolkit/${packageName} typecheck`,
      );
    }
    expect(engineering).not.toContain('`rtk pnpm typecheck`');
    expect(agents).toContain(
      'Verification: `rtk pnpm run typecheck` PASS',
    );
  });

  it('keeps CLI documentation synchronization requirements explicit', () => {
    for (const phrase of [
      '#### CLI documentation synchronization',
      '`packages/cli/README.md`',
      'the corresponding `--help` or usage text',
      'root `README.md`',
      '`docs/RELEASING.md`',
      '`docs/ARCHITECTURE.md`',
      'human-readable and `--json` output contracts',
      'metadata and TXT/CSV credit artifacts',
      'transactional output behavior',
    ]) {
      expect(engineering).toContain(phrase);
    }
  });

  it('keeps CLI documentation impact enforcement synchronized', () => {
    for (const phrase of [
      'CLI docs impact:',
      'CLI docs surfaces:',
      'CLI docs reason:',
    ]) {
      expect(pullRequestTemplate).toContain(phrase);
      expect(contributing).toContain(phrase);
    }
    expect(pullRequestTemplate).toContain('updated | not-applicable');
    expect(contributing).toContain(
      'CLI docs impact: updated | not-applicable',
    );
    for (const token of [
      'help',
      'cli-readme',
      'root-readme',
      'landing',
      'architecture',
      'engineering',
      'releasing',
      'plugin',
    ]) {
      expect(engineering).toContain(`\`${token}\``);
    }
    expect(agents).toContain('CLI Documentation Impact');
    expect(agents).toContain('`update` or `N/A — <reason>`');
    expect(agents).toContain('before handoff');
    expect(rootPackage.scripts['check:cli-docs-impact']).toBe(
      'node scripts/check-cli-doc-impact.mjs',
    );
    expect(rootPackage.scripts['verify:cli-docs-policy']).toBe(
      'node --test scripts/check-cli-doc-impact.test.mjs',
    );
    expect(rootPackage.scripts.verify).toContain(
      'pnpm verify:cli-docs-policy',
    );
  });
});

describe('CLI README character contract', () => {
  it('documents all character commands and locator/output semantics', () => {
    for (const command of [
      'create',
      'list',
      'show',
      'search',
      'set',
      'remove',
      'validate',
      'preview',
      'render',
    ]) {
      expect(cliReadme).toContain(`\`character ${command}\``);
    }
    for (const phrase of [
      '`--selection <file>`',
      '`characters/previews/<name>/`',
      'strict by default',
      '`--allow-partial`',
    ]) {
      expect(cliReadme).toContain(phrase);
    }
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
    expect(engineering).toContain('CI unit job');
    expect(architecture).toContain('read-only provenance');
    expect(architecture).toContain('separate isolated checkout');
  });

  it('documents CLI character persistence and output ownership', () => {
    for (const phrase of [
      '`character-store.ts`',
      'atomic create and replace',
      'catalog-backed character editing',
      'transactional attributed preview and render publication',
    ]) {
      expect(architecture).toContain(phrase);
    }
  });

  it('documents deterministic CLI discovery and exact credit ownership', () => {
    for (const pattern of [
      /bounded discovery\s+summaries/,
      /deterministic pagination/,
      /exact\s+raw credits/,
      /must not duplicate discovery logic/,
    ]) {
      expect(architecture).toMatch(pattern);
    }
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
