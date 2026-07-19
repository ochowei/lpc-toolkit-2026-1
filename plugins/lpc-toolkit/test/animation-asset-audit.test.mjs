import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  AUDIT_CATEGORIES,
  projectAuditReport,
  runAuditReportReader,
} from '../skills/animation-asset-audit/scripts/read-audit-report.mjs';

const fixtureUrl = new URL('./fixtures/audit-report.json', import.meta.url);
const report = JSON.parse(readFileSync(fixtureUrl, 'utf8'));

function reportWithData(patch) {
  const candidate = structuredClone(report);
  Object.assign(candidate.data, patch);
  return candidate;
}

function run(argv, readFile = () => JSON.stringify(report)) {
  let output = '';
  const exitCode = runAuditReportReader(argv, {
    readFile,
    stdout: (text) => {
      output += text;
    },
  });
  return { exitCode, output, result: JSON.parse(output) };
}

test('returns the CLI summary unchanged', () => {
  const result = projectAuditReport(report, { view: 'summary' });
  assert.equal(result.ok, true);
  assert.deepEqual(result.data, {
    targets: ['walk', 'run'],
    scope: { typeName: 'weapon', bodyType: 'male' },
    summary: report.data.summary,
  });
  assert.equal(result.page, null);
});

test('pages categories without flattening nested evidence', () => {
  const result = projectAuditReport(report, {
    view: 'findings', category: 'unsupported', limit: 1, offset: 0,
  });
  assert.deepEqual(AUDIT_CATEGORIES, [
    'unsupported', 'missingFiles', 'blankFrames', 'errors',
  ]);
  assert.equal(result.page.total, 1);
  assert.equal(result.data[0].requirements[0].recolors[0], 'lpcr.brown');
});

test('uses fixed category order and exact item filtering for worklists', () => {
  const all = projectAuditReport(report, { view: 'worklist', limit: 20 });
  assert.deepEqual(all.data.map(({ category }) => category), [
    'unsupported', 'missingFiles', 'blankFrames', 'errors',
  ]);
  const sword = projectAuditReport(report, {
    view: 'worklist', itemId: 'weapon_sword', limit: 20,
  });
  assert.deepEqual(sword.data.map(({ category }) => category), ['missingFiles']);
  assert.equal(sword.data[0].finding.consumers[0].itemId, 'weapon_sword');
});

test('groups only proven-incomplete items by type', () => {
  const result = projectAuditReport(report, { view: 'types' });
  assert.deepEqual(result.data, [{ typeName: 'weapon', count: 3 }]);
});

test('returns stable failures for invalid reports and options', () => {
  assert.equal(
    projectAuditReport({ ok: false }, { view: 'summary' }).errors[0].code,
    'report_shape_invalid',
  );
  assert.equal(
    projectAuditReport(report, { view: 'findings', category: 'other' })
      .errors[0].code,
    'category_invalid',
  );
  assert.equal(
    projectAuditReport(report, { view: 'worklist', limit: 101 })
      .errors[0].code,
    'pagination_invalid',
  );
});

test('rejects malformed nested findings without throwing in any consuming view', () => {
  const malformedFindings = [
    ['unsupported', [{}]],
    ['unsupported', [{ ...report.data.unsupported[0], requirements: [{}] }]],
    ['missingFiles', [{}]],
    ['missingFiles', [{ ...report.data.missingFiles[0], consumers: [{}] }]],
    ['blankFrames', [{}]],
    ['blankFrames', [{ ...report.data.blankFrames[0], frames: [{}] }]],
    ['errors', [{}]],
    ['errors', [{ ...report.data.errors[0], consumers: [{}] }]],
  ];

  for (const [category, findings] of malformedFindings) {
    const candidate = reportWithData({ [category]: findings });
    const views = [
      { view: 'types' },
      { view: 'findings', category },
      { view: 'worklist' },
    ];
    for (const options of views) {
      let result;
      assert.doesNotThrow(() => {
        result = projectAuditReport(candidate, options);
      }, `${category} ${options.view}`);
      assert.equal(result.ok, false, `${category} ${options.view}`);
      assert.equal(result.errors.at(0)?.code, 'report_shape_invalid');
    }
  }
});

test('rejects options that are unsupported by the selected projection view', () => {
  for (const options of [
    { view: 'summary', category: 'missingFiles' },
    { view: 'summary', itemId: 'weapon_sword' },
    { view: 'summary', limit: 1 },
    { view: 'summary', offset: 1 },
    { view: 'types', category: 'missingFiles' },
    { view: 'types', itemId: 'weapon_sword' },
    { view: 'types', limit: 1 },
    { view: 'types', offset: 1 },
    { view: 'worklist', category: 'missingFiles' },
    { view: 'summary', unknown: true },
  ]) {
    const result = projectAuditReport(report, options);
    assert.equal(result.ok, false, JSON.stringify(options));
    assert.equal(result.errors.at(0)?.code, 'helper_usage_invalid');
  }
});

test('rejects view-specific CLI options before reading the report', () => {
  for (const argv of [
    ['audit-report.json', 'summary', '--category', 'missingFiles'],
    ['audit-report.json', 'summary', '--item', 'weapon_sword'],
    ['audit-report.json', 'summary', '--limit', '1'],
    ['audit-report.json', 'summary', '--offset', '1'],
    ['audit-report.json', 'types', '--category', 'missingFiles'],
    ['audit-report.json', 'types', '--item', 'weapon_sword'],
    ['audit-report.json', 'types', '--limit', '1'],
    ['audit-report.json', 'types', '--offset', '1'],
    ['audit-report.json', 'worklist', '--category', 'missingFiles'],
  ]) {
    let reads = 0;
    const execution = run(argv, () => {
      reads += 1;
      return JSON.stringify(report);
    });
    assert.equal(execution.exitCode, 1);
    assert.equal(execution.result.errors[0].code, 'helper_usage_invalid');
    assert.equal(reads, 0);
  }
});

test('bounds more than 100 findings with deterministic continuation pages', () => {
  const missingFiles = Array.from({ length: 105 }, (_, index) => ({
    ...structuredClone(report.data.missingFiles[0]),
    path: `spritesheets/weapon/sword/run/steel-${index}.png`,
    consumers: [{
      ...structuredClone(report.data.missingFiles[0].consumers[0]),
      itemId: `weapon_sword_${index}`,
      recolors: ['lpcr.red', 'lpcr.blue'],
    }],
  }));
  const largeReport = reportWithData({
    unsupported: [],
    missingFiles,
    blankFrames: [],
    errors: [],
  });

  const first = projectAuditReport(largeReport, { view: 'worklist' });
  assert.deepEqual(first.page, {
    limit: 20,
    offset: 0,
    returned: 20,
    total: 105,
    hasMore: true,
    nextOffset: 20,
  });
  assert.equal(first.data.length, 20);
  assert.equal(first.data[0].finding.consumers[0].recolors[1], 'lpcr.blue');

  const continuation = projectAuditReport(largeReport, {
    view: 'worklist', offset: first.page.nextOffset,
  });
  assert.equal(continuation.data[0].finding.path, missingFiles[20].path);
  assert.equal(continuation.page.nextOffset, 40);

  const finalPage = projectAuditReport(largeReport, {
    view: 'worklist', offset: 100,
  });
  assert.deepEqual(finalPage.page, {
    limit: 20,
    offset: 100,
    returned: 5,
    total: 105,
    hasMore: false,
    nextOffset: null,
  });
  assert.deepEqual(
    projectAuditReport(largeReport, { view: 'worklist' }),
    first,
  );
  assert.equal(largeReport.data.missingFiles.length, 105);
});

test('preserves manual review, shared consumers, recolors, and blank source cells', () => {
  const manualRequirement = {
    ...structuredClone(report.data.unsupported[0].requirements[0]),
    pathConfidence: 'manual-review',
    manualReviewReason: 'Choose a standard layout before drawing.',
  };
  delete manualRequirement.expectedPath;
  const sharedConsumers = [
    structuredClone(report.data.missingFiles[0].consumers[0]),
    {
      ...structuredClone(report.data.missingFiles[0].consumers[0]),
      itemId: 'weapon_sword_alt',
      recolors: ['lpcr.gold'],
    },
  ];
  const blankFrames = [{ sourceColumn: 0, logicalFrameIndices: [0, 2] }, {
    sourceColumn: 5,
    logicalFrameIndices: [1, 3, 4],
  }];
  const evidenceReport = reportWithData({
    unsupported: [{
      ...structuredClone(report.data.unsupported[0]),
      requirements: [manualRequirement],
    }],
    missingFiles: [{
      ...structuredClone(report.data.missingFiles[0]),
      consumers: sharedConsumers,
    }],
    blankFrames: [{
      ...structuredClone(report.data.blankFrames[0]),
      sourceRow: 0,
      frames: blankFrames,
    }],
  });

  const worklist = projectAuditReport(evidenceReport, {
    view: 'worklist', limit: 20,
  });
  assert.deepEqual(worklist.data[0].finding.requirements[0], manualRequirement);
  assert.deepEqual(worklist.data[1].finding.consumers, sharedConsumers);
  assert.equal(worklist.data[1].finding.consumers[1].recolors[0], 'lpcr.gold');
  assert.equal(worklist.data[2].finding.sourceRow, 0);
  assert.deepEqual(worklist.data[2].finding.frames, blankFrames);
});

test('reads a summary and writes exactly one newline-terminated JSON result', () => {
  const execution = run(['audit-report.json', 'summary']);
  assert.equal(execution.exitCode, 0);
  assert.equal(execution.result.ok, true);
  assert.equal(execution.result.view, 'summary');
  assert.match(execution.output, /\n$/u);
  assert.equal(execution.output.endsWith('\n\n'), false);
});

test('reports malformed JSON and unreadable report files', () => {
  const malformed = run(['audit-report.json', 'summary'], () => '{');
  assert.equal(malformed.exitCode, 1);
  assert.equal(malformed.result.errors[0].code, 'report_json_invalid');

  const unreadable = run(['audit-report.json', 'summary'], () => {
    throw new Error('permission denied');
  });
  assert.equal(unreadable.exitCode, 1);
  assert.equal(unreadable.result.errors[0].code, 'report_read_failed');
  assert.equal(unreadable.result.errors[0].path, 'audit-report.json');
});

test('reports invalid reader views and required findings categories', () => {
  const unknownView = run(['audit-report.json', 'overview']);
  assert.equal(unknownView.exitCode, 1);
  assert.equal(unknownView.result.errors[0].code, 'helper_usage_invalid');

  const missingCategory = run(['audit-report.json', 'findings']);
  assert.equal(missingCategory.exitCode, 1);
  assert.equal(missingCategory.result.errors[0].code, 'category_invalid');
});

test('reports repeated and unknown reader options', () => {
  const repeated = run([
    'audit-report.json', 'summary', '--limit', '1', '--limit', '2',
  ]);
  assert.equal(repeated.exitCode, 1);
  assert.equal(repeated.result.errors[0].code, 'helper_usage_invalid');

  const unknown = run(['audit-report.json', 'summary', '--unknown', 'value']);
  assert.equal(unknown.exitCode, 1);
  assert.equal(unknown.result.errors[0].code, 'helper_usage_invalid');
});

test('reports non-integer reader pagination options', () => {
  const limit = run(['audit-report.json', 'worklist', '--limit', '1.5']);
  assert.equal(limit.exitCode, 1);
  assert.equal(limit.result.errors[0].code, 'pagination_invalid');

  const offset = run(['audit-report.json', 'worklist', '--offset', '-1']);
  assert.equal(offset.exitCode, 1);
  assert.equal(offset.result.errors[0].code, 'pagination_invalid');
});

test('routes audit requests to a focused non-mutating skill', () => {
  const skill = readFileSync(new URL(
    '../skills/animation-asset-audit/SKILL.md', import.meta.url,
  ), 'utf8').replace(/\s+/gu, ' ');
  assert.match(skill, /name: lpc-animation-asset-audit/u);
  assert.match(skill, /incomplete animation support/u);
  assert.match(skill, /missing animation PNGs/u);
  assert.match(skill, /transparent animation frames/u);
  assert.match(skill, /drawing worklist/u);
  assert.match(skill, /Do not add, edit, generate, or repair sprite assets/u);
});

test('validates both skill frontmatter and OpenAI agent metadata contracts', () => {
  const expectedSkills = [{
    directory: 'animation-asset-audit',
    name: 'lpc-animation-asset-audit',
    description: 'Use when identifying LPC assets with incomplete animation support, missing animation PNGs, transparent animation frames, or when producing or verifying a bounded animation drawing worklist through the installed lpc-toolkit CLI. Do not use for character outfit authoring, non-LPC sprites, unrelated raster editing, or source-asset mutation.',
    displayName: 'LPC Animation Asset Audit',
    shortDescription: 'Find incomplete LPC animation assets',
    defaultPrompt: 'Audit selected LPC animations and produce a bounded drawing worklist from the structured findings.',
  }, {
    directory: 'character-authoring',
    name: 'lpc-character-authoring',
    description: 'Use when creating, editing, validating, previewing, or rendering LPC characters through the installed lpc-toolkit CLI. Do not use for unrelated image editing or non-LPC sprites. Use lpc-animation-asset-audit for source-asset animation audits and drawing worklists.',
    displayName: 'LPC Character Authoring',
    shortDescription: 'Create and render attributed LPC characters',
    defaultPrompt: 'Create an LPC character, preview it, and render the requested attributed artifacts.',
  }];

  for (const expected of expectedSkills) {
    const root = new URL(`../skills/${expected.directory}/`, import.meta.url);
    const skill = readFileSync(new URL('SKILL.md', root), 'utf8');
    const frontmatter = skill.match(/^---\n(?<body>[\s\S]*?)\n---/u)?.groups?.body;
    assert.equal(frontmatter?.match(/^name: (?<value>.+)$/mu)?.groups?.value, expected.name);
    assert.equal(
      frontmatter?.match(/^description: (?<value>.+)$/mu)?.groups?.value,
      expected.description,
    );

    const agent = readFileSync(new URL('agents/openai.yaml', root), 'utf8');
    const yamlValue = (key) => agent.match(
      new RegExp(`^\\s*${key}: "(?<value>[^"]+)"$`, 'mu'),
    )?.groups?.value;
    assert.equal(yamlValue('display_name'), expected.displayName);
    assert.equal(yamlValue('short_description'), expected.shortDescription);
    assert.equal(yamlValue('default_prompt'), expected.defaultPrompt);
    assert.match(agent, /^policy:\n  allow_implicit_invocation: true$/mu);
  }
});

test('keeps compatibility ranges identical and checkers self-contained', async () => {
  const audit = await import('../skills/animation-asset-audit/scripts/check-cli.mjs');
  const character = await import('../skills/character-authoring/scripts/check-cli.mjs');
  assert.deepEqual(audit.SUPPORTED_CLI, character.SUPPORTED_CLI);
  assert.notEqual(
    new URL('../skills/animation-asset-audit/scripts/check-cli.mjs', import.meta.url).href,
    new URL('../skills/character-authoring/scripts/check-cli.mjs', import.meta.url).href,
  );
});

test('documents safe report preservation and finding interpretation', () => {
  const workflow = readFileSync(new URL(
    '../skills/animation-asset-audit/references/audit-workflow.md', import.meta.url,
  ), 'utf8').replace(/\s+/gu, ' ');
  for (const required of [
    '--json', 'unsupported', 'missingFiles', 'blankFrames', 'errors',
    'pathConfidence', 'manual-review', 'recolors', 'same target and scope',
    'Exit code zero', 'upstream/', 'user-supplied report path',
    'task-specific temporary directory', 'report that path while it remains available',
  ]) assert.equal(workflow.includes(required), true, `missing ${required}`);
});
