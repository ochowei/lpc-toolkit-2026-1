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
