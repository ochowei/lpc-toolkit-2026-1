import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import {
  evaluateCliDocsImpact,
  parseCliDocsDeclaration,
  parseCliDocsInvocation,
} from './check-cli-doc-impact.mjs';

function body({
  impact = 'updated',
  surfaces = 'help',
  reason = '',
} = {}) {
  return [
    '## CLI documentation impact',
    `CLI docs impact: ${impact}`,
    `CLI docs surfaces: ${surfaces}`,
    `CLI docs reason: ${reason}`,
  ].join('\n');
}

function evaluate(changedFiles, pullRequestBody = '') {
  return evaluateCliDocsImpact({ changedFiles, pullRequestBody });
}

describe('parseCliDocsDeclaration', () => {
  it('parses and deduplicates a valid updated declaration', () => {
    assert.deepEqual(
      parseCliDocsDeclaration(body({
        surfaces: 'help, cli-readme, help',
      })),
      {
        impact: 'updated',
        surfaces: ['help', 'cli-readme'],
        reason: '',
        errors: [],
      },
    );
  });

  it('rejects duplicate fields instead of choosing one silently', () => {
    const declaration = parseCliDocsDeclaration([
      body(),
      'CLI docs impact: not-applicable',
    ].join('\n'));

    assert.match(declaration.errors.join('\n'), /duplicate.*CLI docs impact/iu);
  });
});

describe('parseCliDocsInvocation', () => {
  it('accepts the argument separator passed through by pnpm', () => {
    assert.deepEqual(
      parseCliDocsInvocation([
        '--',
        '--base',
        'base-sha',
        '--head',
        'head-sha',
        '--body-file',
        'body.md',
      ]),
      { base: 'base-sha', head: 'head-sha', bodyFile: 'body.md' },
    );
  });
});

describe('evaluateCliDocsImpact', () => {
  it('passes unrelated diffs without a declaration', () => {
    assert.deepEqual(evaluate(['packages/web/src/App.tsx']), {
      ok: true,
      required: false,
      sensitiveFiles: [],
      errors: [],
    });
  });

  it('does not activate for CLI tests, plans, specs, or fixtures alone', () => {
    const result = evaluate([
      'packages/cli/test/args.test.ts',
      'docs/superpowers/plans/example.md',
      'docs/superpowers/specs/example.md',
      'packages/cli/test/fixtures/character.json',
    ]);

    assert.equal(result.ok, true);
    assert.equal(result.required, false);
  });

  it('requires a declaration for sensitive CLI changes', () => {
    const result = evaluate(['packages/cli/src/response.ts']);

    assert.equal(result.ok, false);
    assert.equal(result.required, true);
    assert.deepEqual(result.sensitiveFiles, ['packages/cli/src/response.ts']);
    assert.match(result.errors.join('\n'), /declaration is required/iu);
  });

  it('passes an updated declaration with a matching surface', () => {
    const result = evaluate(
      ['packages/cli/src/command-spec.ts'],
      body({ surfaces: 'help' }),
    );

    assert.equal(result.ok, true);
    assert.equal(result.required, true);
    assert.deepEqual(result.errors, []);
  });

  it('passes several updated surfaces when every path is present', () => {
    const result = evaluate(
      [
        'packages/cli/src/args.ts',
        'packages/cli/src/command-spec.ts',
        'packages/cli/README.md',
        'README.md',
        'packages/web/src/components/landing-page.tsx',
      ],
      body({ surfaces: 'help, cli-readme, root-readme, landing' }),
    );

    assert.equal(result.ok, true);
    assert.deepEqual(result.errors, []);
  });

  it('rejects a declared surface that is absent from the diff', () => {
    const result = evaluate(
      ['packages/cli/src/response.ts', 'README.md'],
      body({ surfaces: 'root-readme, landing' }),
    );

    assert.equal(result.ok, false);
    assert.match(result.errors.join('\n'), /landing.*not present/iu);
  });

  it('rejects unknown surface tokens', () => {
    const result = evaluate(
      ['packages/cli/src/response.ts'],
      body({ surfaces: 'manual' }),
    );

    assert.equal(result.ok, false);
    assert.match(result.errors.join('\n'), /unknown.*manual/iu);
  });

  it('rejects none combined with another surface', () => {
    const result = evaluate(
      ['packages/cli/src/response.ts'],
      body({ surfaces: 'none, help' }),
    );

    assert.equal(result.ok, false);
    assert.match(result.errors.join('\n'), /none.*combined/iu);
  });

  it('passes not-applicable with none and a concrete reason', () => {
    const result = evaluate(
      ['packages/cli/src/asset-store.ts'],
      body({
        impact: 'not-applicable',
        surfaces: 'none',
        reason: 'Internal cache refactor with no user-visible CLI contract change.',
      }),
    );

    assert.equal(result.ok, true);
    assert.deepEqual(result.errors, []);
  });

  it('rejects a missing, placeholder, or short not-applicable reason', () => {
    for (const reason of [
      '',
      '<!-- required for not-applicable -->',
      'Internal only.',
    ]) {
      const result = evaluate(
        ['packages/cli/src/asset-store.ts'],
        body({ impact: 'not-applicable', surfaces: 'none', reason }),
      );

      assert.equal(result.ok, false);
      assert.match(result.errors.join('\n'), /reason.*20/iu);
    }
  });

  it('rejects not-applicable with a documentation surface', () => {
    const result = evaluate(
      ['packages/cli/src/asset-store.ts', 'packages/cli/README.md'],
      body({
        impact: 'not-applicable',
        surfaces: 'cli-readme',
        reason: 'Internal cache refactor with no user-visible CLI contract change.',
      }),
    );

    assert.equal(result.ok, false);
    assert.match(result.errors.join('\n'), /not-applicable.*none/iu);
  });

  it('rejects an unchanged template placeholder', () => {
    const result = evaluate(
      ['packages/cli/src/response.ts'],
      body({
        impact: '<!-- updated | not-applicable -->',
        surfaces: '<!-- comma-separated tokens | none -->',
        reason: '<!-- required for not-applicable -->',
      }),
    );

    assert.equal(result.ok, false);
    assert.match(result.errors.join('\n'), /impact.*updated.*not-applicable/iu);
  });

  it('requires a declaration when excluded and trigger paths are mixed', () => {
    const result = evaluate([
      'packages/cli/test/args.test.ts',
      'packages/cli/src/args.ts',
    ]);

    assert.equal(result.ok, false);
    assert.equal(result.required, true);
    assert.deepEqual(result.sensitiveFiles, ['packages/cli/src/args.ts']);
  });

  it('activates for every production and distribution trigger family', () => {
    for (const filePath of [
      'packages/cli/src/main.ts',
      'packages/cli/package.json',
      'packages/cli/scripts/smoke-packed-cli.mjs',
      'plugins/lpc-toolkit/.codex-plugin/plugin.json',
      'asset-release.json',
      '.github/workflows/cli-release-candidate.yml',
      '.github/workflows/publish.yml',
    ]) {
      const result = evaluate([filePath]);
      assert.equal(result.required, true, filePath);
      assert.equal(result.ok, false, filePath);
    }
  });

  it('maps every supported surface to its owned path', () => {
    const changedFiles = [
      'packages/cli/src/response.ts',
      'packages/cli/src/command-spec.ts',
      'packages/cli/README.md',
      'README.md',
      'packages/web/src/components/landing-page.tsx',
      'docs/ARCHITECTURE.md',
      'docs/ENGINEERING.md',
      'docs/RELEASING.md',
      'plugins/lpc-toolkit/skills/character-authoring/SKILL.md',
    ];
    const result = evaluate(
      changedFiles,
      body({
        surfaces: [
          'help',
          'cli-readme',
          'root-readme',
          'landing',
          'architecture',
          'engineering',
          'releasing',
          'plugin',
        ].join(', '),
      }),
    );

    assert.equal(result.ok, true);
    assert.deepEqual(result.errors, []);
  });
});

describe('repository integration', () => {
  it('runs the live checker as a stable pull-request CI job', () => {
    const workflow = readFileSync(
      new URL('../.github/workflows/ci.yml', import.meta.url),
      'utf8',
    );

    assert.match(workflow, /^  cli-docs-impact:$/mu);
    assert.match(workflow, /^    name: CLI documentation impact$/mu);
    assert.match(workflow, /^    if: github\.event_name == 'pull_request'$/mu);
    assert.match(workflow, /^          fetch-depth: 0$/mu);
    assert.match(workflow, /^      - run: node scripts\/check-cli-doc-impact\.mjs$/mu);
  });
});
