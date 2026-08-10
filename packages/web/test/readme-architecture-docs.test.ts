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
const productDirection = readRepoFile('docs/PRODUCT-DIRECTION.md');
const productDirectionZhTw = readRepoFile(
  'docs/PRODUCT-DIRECTION.zh-TW.md',
);
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
  ['docs/PRODUCT-DIRECTION.md', productDirection],
  ['docs/PRODUCT-DIRECTION.zh-TW.md', productDirectionZhTw],
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

function markdownSection(source: string, heading: string): string {
  const start = source.indexOf(heading);
  if (start < 0) return '';

  const headingLevel = heading.match(/^#+/)?.[0].length ?? 6;
  const lines = source.slice(start).split('\n');
  const end = lines.findIndex((line, index) => {
    if (index === 0) return false;
    const nextLevel = line.match(/^(#+)\s/)?.[1]?.length;
    return nextLevel !== undefined && nextLevel <= headingLevel;
  });

  return (end < 0 ? lines : lines.slice(0, end)).join('\n');
}

function expectOrderedTokens(source: string, tokens: readonly string[]): void {
  const positions = tokens.map((token) => {
    expect(source).toContain(token);
    return source.indexOf(token);
  });
  expect(positions).toEqual(
    [...positions].sort((left, right) => left - right),
  );
}

const semanticText = (source: string) => source.replace(/\s+/g, ' ');

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
  it('documents the shared character JSON interchange contract', () => {
    expect(readme).toContain('lpc-toolkit.selection.v2');
    expect(readme).toContain('selection v1 and v2');
    expect(readme).toContain('upstream version 1 and version 2 JSON');
    expect(architecture).toContain('canonical character document');
    expect(architecture).toContain('upstream compatibility adapter');
    expect(architecture).toContain('active asset source');
  });

  it('routes contributor and maintainer workflows to focused documents', () => {
    expect(readme).toContain(
      '[product direction](docs/PRODUCT-DIRECTION.md)',
    );
    expect(agents).toContain(
      '[Product direction](docs/PRODUCT-DIRECTION.md)',
    );
    expect(agents).toContain(
      '[Traditional Chinese product-direction translation](docs/PRODUCT-DIRECTION.zh-TW.md)',
    );
    expect(readme).toContain('[`CONTRIBUTING.md`](CONTRIBUTING.md)');
    expect(readme).toContain(
      '[`docs/ENGINEERING.md`](docs/ENGINEERING.md)',
    );
    expect(readme).toContain('[`docs/RELEASING.md`](docs/RELEASING.md)');
    expect(contributing).toContain('[Engineering guide](docs/ENGINEERING.md)');
    expect(contributing).toContain('[onboarding guide](docs/ONBOARDING.md)');
    expect(engineering).toContain('`pnpm verify`');
    expect(releasing).toContain('CLI Release Candidate');
    expect(releasing).toContain('npm OIDC');
    expect(readme).not.toContain('Maintainers: RC validation');
    expect(readme).not.toContain('Trusted Publisher');
  });

  it('keeps product direction distinct, discoverable, and domain-aligned', () => {
    for (const phrase of [
      'Agent integration',
      'CLI',
      'Web Composer',
      'Sprite composition',
      'Animation remediation journey',
      'New asset authoring journey',
      'local-first',
      'user-controlled',
      '## Current non-goals',
      'implementation-status dashboard',
    ]) {
      expect(productDirection).toContain(phrase);
    }
  });

  it('keeps the product-direction translation split and synchronized by policy', () => {
    expect(productDirection).toContain(
      '[繁體中文翻譯](PRODUCT-DIRECTION.zh-TW.md)',
    );
    expect(productDirection).toContain(
      'canonical normative living statement',
    );
    expect(productDirection).toContain(
      'Update the maintained Traditional Chinese translation in the same change',
    );
    expect(productDirection).not.toContain('# 產品方向');

    expect(productDirectionZhTw).toContain(
      '[英文規範原文](PRODUCT-DIRECTION.md)',
    );
    expect(productDirectionZhTw).toContain('英文版是唯一規範來源');
    expect(productDirectionZhTw).toContain(
      '必須在同一項變更中更新維護中的繁體中文翻譯',
    );
    expect(productDirectionZhTw).not.toContain('# Product Direction');
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
    expect(readme).toContain('editor at `/compose`');
    expect(readme).toContain('CLI guide at `/cli`');
    expect(readme).toContain('agent integration guidance at `/agents`');
    expect(readme).toContain('entry `/` currently redirects to `/cli`');
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
    const cliInstall = "npm install -g '@lpc-toolkit/cli@>=0.2.0 <0.3.0'";
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
      '`pnpm verify:plugin`',
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
      '`pnpm install --frozen-lockfile`',
      '`pnpm verify`',
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

  it('uses explicit run forms for standalone typechecks', () => {
    expect(engineering).toContain('`pnpm run typecheck`');
    for (const packageName of ['core', 'presets', 'web', 'cli']) {
      expect(engineering).toContain(
        `pnpm --filter @lpc-toolkit/${packageName} run typecheck`,
      );
      expect(engineering).not.toContain(
        `pnpm --filter @lpc-toolkit/${packageName} typecheck`,
      );
    }
    expect(engineering).not.toContain('`pnpm typecheck`');
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

describe('animation remediation documentation contract', () => {
  const strictCommands = [
    'catalog audit-animations --animation climb --json',
    'asset authoring start --plan plan.json',
    'asset authoring contract --session <session-id>',
    'asset authoring import --session <session-id>',
    'asset authoring validate --session <session-id>',
    'asset authoring preview --session <session-id>',
  ] as const;

  it('keeps the root README remediation entry point strict and bounded', () => {
    const strictHeading = '#### Strict animation-remediation session';
    const phaseOneHeading = '#### Limited Phase 1 scaffold alternative';
    expect(readme).toContain(strictHeading);
    expect(readme).toContain(phaseOneHeading);

    const strictJourney = markdownSection(readme, strictHeading);
    expectOrderedTokens(strictJourney, strictCommands);
    for (const phrase of [
      'plan.json is explicit input',
      'selected finding',
      'draft credits',
      'not generated by the CLI',
      'attributed review-ready preview',
      '[CLI asset lifecycle guide](packages/cli/README.md#strict-asset-authoring-sessions)',
    ]) expect(semanticText(strictJourney)).toContain(phrase);

    const phaseOne = semanticText(markdownSection(readme, phaseOneHeading));
    for (const phrase of [
      'asset init --from-audit',
      'mutating direct CLI authoring action',
      'review one selected finding',
      'explicitly consent',
      'read-only audit Skill never runs it',
      'blankFrames',
      'does not create a strict authoring session or its receipts',
    ]) expect(phaseOne).toContain(phrase);
  });

  it('keeps the CLI README remediation reference complete and ordered', () => {
    const strictHeading = '#### Strict animation-remediation journey';
    const phaseOneHeading = '#### Limited Phase 1 scaffold alternative';
    expect(cliReadme).toContain(strictHeading);
    expect(cliReadme).toContain(phaseOneHeading);

    const strictJourney = markdownSection(cliReadme, strictHeading);
    expectOrderedTokens(strictJourney, strictCommands);
    for (const phrase of [
      'save the complete report',
      'lpc-toolkit.asset-authoring-plan.v1',
      'human-selected finding',
      'draft credits',
      'returned session ID',
      'external artist or provider-neutral tool',
      'contract digest',
      'attributed review-ready preview',
      'metadata, TXT, and CSV credits',
      'status` and `resume',
      'receipts and recovery',
      'separately confirmed formal lifecycle',
      'successful exact installation',
      'same bounded audit scope',
      'Exit code zero only means the audit ran',
    ]) expect(semanticText(strictJourney)).toContain(phrase);

    const phaseOne = semanticText(markdownSection(cliReadme, phaseOneHeading));
    for (const phrase of [
      'asset init --from-audit',
      'mutating direct CLI authoring action',
      'review one selected finding',
      'explicitly consent',
      'read-only audit Skill never runs it',
      'blankFrames',
      'audit errors never become drawing tasks',
      'does not create a strict authoring session or its receipts',
    ]) expect(phaseOne).toContain(phrase);
  });
});

describe('provider-neutral D2 documentation contract', () => {
  it('keeps the public handoff boundary synchronized across owned documents', () => {
    for (const document of [readme, cliReadme, architecture, engineering, releasing]) {
      expect(document).toContain('provider-neutral');
      expect(document).toContain('provider');
      expect(document).toContain('upstream/');
    }

    for (const phrase of [
      'asset authoring provider discover',
      'asset authoring provider preflight',
      'asset authoring provider handoff',
      'asset authoring provider result',
      'asset authoring import',
      'external-author fallback',
    ]) {
      expect(readme).toContain(phrase);
      expect(cliReadme).toContain(phrase);
    }

    expect(architecture).toContain('receipts.providerInvocation');
    expect(architecture).toContain('D1 `provider-output` provenance');
    expect(engineering).toContain('deterministic fake adapter');
    expect(engineering).toContain('protected-path sentinels');
    expect(releasing).toContain('D2 provider-neutral release gate');
    expect(releasing).toContain('No real');
    expect(releasing).toContain('provider result coverage uses only a deterministic local fixture');
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
    expect(architecture).toContain('`pnpm check:boundaries`');
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
