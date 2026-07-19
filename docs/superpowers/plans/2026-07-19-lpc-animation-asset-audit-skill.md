# LPC Animation Asset Audit Skill Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a focused `lpc-animation-asset-audit` plugin skill that turns the existing CLI animation audit JSON into bounded, actionable drawing worklists while keeping character authoring separate.

**Architecture:** Keep all audit truth in `lpc-toolkit catalog audit-animations --json`. Add a self-contained skill with its own CLI compatibility preflight and contract, plus a Node-only report reader that validates and pages a preserved CLI report without changing finding semantics. Extend the lightweight plugin verifier and presentation to support exactly the two intended skills.

**Tech Stack:** Markdown/YAML/JSON Codex skill files, Node.js 22+ ESM with built-in modules only, Node test runner, existing TypeScript/Vitest CLI contract tests, pnpm 9.

**Design:** `docs/superpowers/specs/2026-07-19-lpc-animation-asset-audit-skill-design.md`

**Implementation Base:** `09d38c3251ea660d7dc13780a98592632f83fd76`

## Global Constraints

- Add no dependency and no `any` type.
- Support `@lpc-toolkit/cli >=0.2.0 <0.3.0`; do not silently install or upgrade it.
- Keep `lpc-toolkit` as the only source of catalog, capability, path, geometry, runtime-asset, and inspection behavior.
- Require at least one explicit standard animation; do not invent an implicit all-animations mode.
- Preserve the complete JSON response before deriving bounded views.
- Keep `unsupported`, `missingFiles`, `blankFrames`, and `errors` semantically distinct.
- Do not add, edit, generate, repair, copy, or delete sprite assets or catalog definitions.
- Do not modify or initialize `upstream/`, bypass cache integrity, or weaken attribution requirements.
- Keep `lpc-character-authoring` focused on character composition and rendering.
- Plugin version becomes `0.2.1`; the compatible CLI range remains unchanged.
- Prefix every repository command with `rtk`.
- After each task's product commit, update this checked-in plan: check completed steps, add a concise implementation note, record the full product commit hash, and record every exact verification command with PASS/FAIL. Commit that record separately with `docs(plan): record ...`.

## File Structure

- `plugins/lpc-toolkit/skills/animation-asset-audit/SKILL.md` — focused trigger, preflight, audit sequence, report preservation, and safety gates.
- `plugins/lpc-toolkit/skills/animation-asset-audit/agents/openai.yaml` — UI metadata and implicit invocation policy.
- `plugins/lpc-toolkit/skills/animation-asset-audit/references/compatibility.md` — plugin/CLI range and recovery instructions.
- `plugins/lpc-toolkit/skills/animation-asset-audit/references/cli-contract.json` — tested audit command inventory.
- `plugins/lpc-toolkit/skills/animation-asset-audit/references/audit-workflow.md` — scope, finding interpretation, worklist, and re-audit procedure.
- `plugins/lpc-toolkit/skills/animation-asset-audit/scripts/check-cli.mjs` — skill-local copy of the existing compatibility checker.
- `plugins/lpc-toolkit/skills/animation-asset-audit/scripts/read-audit-report.mjs` — validate and page one preserved audit report.
- `plugins/lpc-toolkit/test/fixtures/audit-report.json` — representative successful report covering all four categories.
- `plugins/lpc-toolkit/test/animation-asset-audit.test.mjs` — helper, compatibility parity, workflow, trigger, and metadata tests.
- `plugins/lpc-toolkit/skills/character-authoring/SKILL.md` — explicitly route source-asset audits to the new skill.
- `plugins/lpc-toolkit/.codex-plugin/plugin.json` — version `0.2.1` and two-workflow presentation.
- `plugins/lpc-toolkit/test/check-cli.test.mjs` — update documented plugin version expectation.
- `scripts/verify-codex-plugin.mjs` — require version `0.2.1` and exactly the two intended skills.
- `scripts/verify-codex-plugin.test.mjs` — two-skill fixtures and missing/unexpected-skill rejection.
- `packages/cli/test/plugin-contract.test.ts` — validate both skill CLI inventories against generated CLI options/help.
- `package.json` — include the new plugin test file in `verify:plugin`.
- `README.md` — document plugin `0.2.1` and the audit capability.

## Stable Interfaces

The report reader must export these exact names:

```js
export const AUDIT_CATEGORIES = Object.freeze([
  'unsupported',
  'missingFiles',
  'blankFrames',
  'errors',
]);

export function projectAuditReport(report, options = {});
export function runAuditReportReader(argv, io = {});
```

`projectAuditReport` accepts:

```js
{
  view: 'summary' | 'types' | 'findings' | 'worklist',
  category?: 'unsupported' | 'missingFiles' | 'blankFrames' | 'errors',
  itemId?: string,
  limit?: number,   // default 20, range 1..100 for paged views
  offset?: number,  // default 0
}
```

Successful output uses:

```js
{
  ok: true,
  view,
  report: { targets, scope, summary },
  page: null | { limit, offset, returned, total, hasMore, nextOffset },
  data,
  errors: [],
}
```

Failed output uses:

```js
{
  ok: false,
  view: view ?? null,
  report: null,
  page: null,
  data: null,
  errors: [{ code, message, path? }],
}
```

Stable helper error codes are `report_read_failed`, `report_json_invalid`,
`report_shape_invalid`, `helper_usage_invalid`, `category_invalid`, and
`pagination_invalid`.

## CLI Documentation Impact

```text
help: N/A — no CLI command or help behavior changes
cli-readme: N/A — existing audit command documentation remains accurate
root-readme: update — align the documented plugin version and capability summary
landing: N/A — no product landing workflow change
architecture: N/A — no package boundary or runtime architecture change
engineering: N/A — no repository verification command changes
releasing: N/A — no CLI publication workflow change
plugin: update — add the audit skill contract, workflow, metadata, and tests
```

The implementation pull request must declare:

```text
CLI docs impact: updated
CLI docs surfaces: root-readme, plugin
```

Reassess this matrix in Task 4 before handoff. If the implementation changes an additional owned contract, update that surface and declaration rather than preserving an inaccurate `N/A`.

---

### Task 1: Build the bounded audit report reader

**Files:**
- Create: `plugins/lpc-toolkit/skills/animation-asset-audit/scripts/read-audit-report.mjs`
- Create: `plugins/lpc-toolkit/test/fixtures/audit-report.json`
- Create: `plugins/lpc-toolkit/test/animation-asset-audit.test.mjs`
- Modify: `package.json`

**Interfaces:**
- Consumes: the existing `catalog audit-animations --json` success envelope and four finding arrays.
- Produces: `AUDIT_CATEGORIES`, `projectAuditReport`, and `runAuditReportReader` exactly as defined under Stable Interfaces.
- Preserves: every returned finding, nested requirement, consumer, recolor, and blank-frame coordinate without mutation.

- [x] **Step 1: Add a representative audit report fixture**

  - Implementation: Added the representative successful audit envelope with concrete evidence for all four finding categories.

Create `plugins/lpc-toolkit/test/fixtures/audit-report.json` with this shape and concrete records for every category:

```json
{
  "ok": true,
  "command": "catalog audit-animations",
  "data": {
    "targets": ["walk", "run"],
    "scope": { "typeName": "weapon", "bodyType": "male" },
    "summary": {
      "itemsScanned": 3,
      "incompleteItems": 3,
      "unsupported": 1,
      "missingFiles": 1,
      "blankFrames": 1,
      "errors": 1
    },
    "unsupported": [{
      "itemId": "weapon_bow",
      "typeName": "weapon",
      "animation": "run",
      "nativeAnimations": ["walk"],
      "compatibleAnimations": [],
      "requirements": [{
        "expectedPath": "spritesheets/weapon/bow/run/wood.png",
        "pathConfidence": "inferred",
        "itemId": "weapon_bow",
        "typeName": "weapon",
        "layer": "layer_1",
        "bodyTypes": ["male"],
        "variant": "wood",
        "recolors": ["lpcr.brown"]
      }]
    }],
    "missingFiles": [{
      "path": "spritesheets/weapon/sword/run/steel.png",
      "animation": "run",
      "sourceAnimation": "run",
      "consumers": [{
        "itemId": "weapon_sword",
        "typeName": "weapon",
        "layer": "layer_1",
        "bodyTypes": ["male"],
        "variant": "steel",
        "recolors": []
      }]
    }],
    "blankFrames": [{
      "path": "spritesheets/weapon/axe/walk/iron.png",
      "animation": "walk",
      "sourceAnimation": "walk",
      "sourceRow": 2,
      "direction": "down",
      "frames": [{ "sourceColumn": 3, "logicalFrameIndices": [2] }],
      "consumers": [{
        "itemId": "weapon_axe",
        "typeName": "weapon",
        "layer": "layer_1",
        "bodyTypes": ["male"],
        "variant": "iron",
        "recolors": []
      }]
    }],
    "errors": [{
      "kind": "image_decode_failed",
      "message": "PNG decode failed",
      "path": "spritesheets/weapon/mace/run/iron.png",
      "consumers": [{
        "itemId": "weapon_mace",
        "typeName": "weapon",
        "layer": "layer_1",
        "bodyTypes": ["male"],
        "variant": "iron",
        "recolors": []
      }]
    }]
  },
  "warnings": [],
  "errors": []
}
```

- [x] **Step 2: Write failing projection and validation tests**

  - Implementation: Added projection, validation, pagination, injected-I/O, malformed-file, and output-newline coverage.

Create `plugins/lpc-toolkit/test/animation-asset-audit.test.mjs`. Read the fixture once and add tests that assert:

```js
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
```

Also test `runAuditReportReader` with injected `stdout` and `readFile` functions
for valid `summary`, malformed JSON, unreadable file, unknown view, missing
category, repeated/unknown options, non-integer limit/offset, and JSON output
ending in one newline.

- [x] **Step 3: Run the focused test to verify it fails**

  - Verification: `rtk node --test plugins/lpc-toolkit/test/animation-asset-audit.test.mjs` FAIL — expected `ERR_MODULE_NOT_FOUND` for `read-audit-report.mjs` before implementation.

Run:

```sh
rtk node --test plugins/lpc-toolkit/test/animation-asset-audit.test.mjs
```

Expected: FAIL because `read-audit-report.mjs` does not exist.

- [x] **Step 4: Implement the report reader**

  - Implementation: Added bounded projection, shape validation, stable failures, CLI argument parsing, injected I/O, and newline-terminated JSON output without mutating findings.

Create `read-audit-report.mjs` with small focused helpers:

```js
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export const AUDIT_CATEGORIES = Object.freeze([
  'unsupported', 'missingFiles', 'blankFrames', 'errors',
]);
const VIEWS = new Set(['summary', 'types', 'findings', 'worklist']);
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

const isRecord = (value) => value !== null && typeof value === 'object'
  && !Array.isArray(value);

function failure(code, message, view = null, issuePath) {
  return {
    ok: false,
    view,
    report: null,
    page: null,
    data: null,
    errors: [{ code, message, ...(issuePath ? { path: issuePath } : {}) }],
  };
}

function validateReport(report, view) {
  if (!isRecord(report) || report.ok !== true
    || report.command !== 'catalog audit-animations'
    || !isRecord(report.data) || !isRecord(report.data.summary)
    || !Array.isArray(report.data.targets)
    || !isRecord(report.data.scope)
    || !AUDIT_CATEGORIES.every((category) => Array.isArray(report.data[category]))
    || !Array.isArray(report.errors) || report.errors.length !== 0) {
    return failure(
      'report_shape_invalid',
      'Expected a successful catalog audit-animations JSON response.',
      view,
    );
  }
  return undefined;
}

function itemIds(finding, category) {
  if (category === 'unsupported') return [finding.itemId];
  return Array.isArray(finding.consumers)
    ? finding.consumers.map(({ itemId }) => itemId)
    : [];
}

function page(entries, limit, offset) {
  const data = entries.slice(offset, offset + limit);
  const nextOffset = offset + data.length;
  return {
    data,
    page: {
      limit,
      offset,
      returned: data.length,
      total: entries.length,
      hasMore: nextOffset < entries.length,
      nextOffset: nextOffset < entries.length ? nextOffset : null,
    },
  };
}

function reportHeader(data) {
  return { targets: data.targets, scope: data.scope, summary: data.summary };
}

export function projectAuditReport(report, options = {}) {
  const view = options.view ?? null;
  if (!VIEWS.has(view)) {
    return failure('helper_usage_invalid', `Unknown report view: ${view ?? '(missing)'}.`, view);
  }
  const invalid = validateReport(report, view);
  if (invalid) return invalid;
  const header = reportHeader(report.data);
  if (view === 'summary') {
    return { ok: true, view, report: header, page: null, data: header, errors: [] };
  }
  if (view === 'types') {
    const incomplete = new Map();
    for (const category of AUDIT_CATEGORIES.slice(0, 3)) {
      for (const finding of report.data[category]) {
        const consumers = category === 'unsupported'
          ? [{ itemId: finding.itemId, typeName: finding.typeName }]
          : finding.consumers;
        for (const consumer of consumers) {
          if (!incomplete.has(consumer.itemId)) {
            incomplete.set(consumer.itemId, consumer.typeName);
          }
        }
      }
    }
    const counts = new Map();
    for (const typeName of incomplete.values()) {
      counts.set(typeName, (counts.get(typeName) ?? 0) + 1);
    }
    const data = [...counts].map(([typeName, count]) => ({ typeName, count }));
    return { ok: true, view, report: header, page: null, data, errors: [] };
  }
  if (view === 'findings' && !AUDIT_CATEGORIES.includes(options.category)) {
    return failure('category_invalid', `Unknown finding category: ${options.category ?? '(missing)'}.`, view);
  }
  const limit = options.limit ?? DEFAULT_LIMIT;
  const offset = options.offset ?? 0;
  if (!Number.isInteger(limit) || limit < 1 || limit > MAX_LIMIT
    || !Number.isInteger(offset) || offset < 0) {
    return failure('pagination_invalid', 'Limit must be 1-100 and offset must be a non-negative integer.', view);
  }
  const categoryEntries = view === 'findings'
    ? report.data[options.category].map((finding) => ({
        category: options.category, finding,
      }))
    : AUDIT_CATEGORIES.flatMap((category) => report.data[category].map((finding) => ({
        category, finding,
      })));
  const filtered = options.itemId === undefined
    ? categoryEntries
    : categoryEntries.filter(({ category, finding }) => (
        itemIds(finding, category).includes(options.itemId)
      ));
  const projected = page(filtered, limit, offset);
  const data = view === 'findings'
    ? projected.data.map(({ finding }) => finding)
    : projected.data;
  return { ok: true, view, report: header, page: projected.page, data, errors: [] };
}
```

Implement `runAuditReportReader` below those helpers with this exact parsing and
output behavior:

```js
function parseReaderArgs(argv) {
  const [reportPath, view, ...flags] = argv;
  if (!reportPath || !view || flags.length % 2 !== 0) {
    return failure(
      'helper_usage_invalid',
      'Usage: read-audit-report.mjs <report.json> <summary|types|findings|worklist> [options].',
      view ?? null,
    );
  }
  const options = { view };
  const seen = new Set();
  for (let index = 0; index < flags.length; index += 2) {
    const flag = flags[index];
    const value = flags[index + 1];
    if (!['--category', '--item', '--limit', '--offset'].includes(flag)
      || value === undefined || seen.has(flag)) {
      return failure('helper_usage_invalid', `Invalid or repeated option: ${flag}.`, view);
    }
    seen.add(flag);
    if (flag === '--category') options.category = value;
    if (flag === '--item') options.itemId = value;
    if (flag === '--limit' || flag === '--offset') {
      if (!/^\d+$/u.test(value)) {
        return failure('pagination_invalid', `${flag} must be an integer.`, view);
      }
      options[flag === '--limit' ? 'limit' : 'offset'] = Number(value);
    }
  }
  return { reportPath, options };
}

export function runAuditReportReader(argv, {
  readFile = readFileSync,
  stdout = (text) => process.stdout.write(text),
} = {}) {
  const parsed = parseReaderArgs(argv);
  let result;
  if (!parsed.reportPath) {
    result = parsed;
  } else {
    let source;
    try {
      source = readFile(parsed.reportPath, 'utf8');
    } catch (error) {
      result = failure(
        'report_read_failed',
        error instanceof Error ? error.message : String(error),
        parsed.options.view,
        parsed.reportPath,
      );
    }
    if (!result) {
      let report;
      try {
        report = JSON.parse(source);
      } catch (error) {
        result = failure(
          'report_json_invalid',
          error instanceof Error ? error.message : String(error),
          parsed.options.view,
          parsed.reportPath,
        );
      }
      if (!result) result = projectAuditReport(report, parsed.options);
    }
  }
  stdout(`${JSON.stringify(result, null, 2)}\n`);
  return result.ok ? 0 : 1;
}

if (process.argv[1]
  && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  process.exitCode = runAuditReportReader(process.argv.slice(2));
}
```

The helper writes exactly one JSON object plus newline to stdout and no prose.

- [x] **Step 5: Run focused tests and verify they pass**

  - Verification: `rtk node --test plugins/lpc-toolkit/test/animation-asset-audit.test.mjs` PASS — 10 tests passed, 0 failed.

Run:

```sh
rtk node --test plugins/lpc-toolkit/test/animation-asset-audit.test.mjs
```

Expected: PASS for all helper projection, pagination, shape, file, JSON, and option tests.

- [x] **Step 6: Register the test in the repository plugin gate**

  - Implementation: Registered `animation-asset-audit.test.mjs` explicitly in `verify:plugin`.
  - Verification: `rtk pnpm verify:plugin` PASS — 27 tests passed, 0 failed; plugin structure valid with one discoverable skill at this boundary.

Change `package.json` so `verify:plugin` runs the new test explicitly:

```json
"verify:plugin": "node --test plugins/lpc-toolkit/test/check-cli.test.mjs plugins/lpc-toolkit/test/animation-asset-audit.test.mjs scripts/verify-codex-plugin.test.mjs && node scripts/verify-codex-plugin.mjs"
```

Run:

```sh
rtk pnpm verify:plugin
```

Expected: PASS; the plugin still contains one discoverable skill at this task boundary, while the report helper tests are now part of the standard gate.

- [x] **Step 7: Commit the report reader**

  - Commit: de309c83e50c5b71f6c18cbbe6cbf4ade017d537
  - Implementation: Committed the bounded reader, fixture, focused tests, and plugin-gate registration as `feat(plugin): add bounded animation audit reader`.

```sh
rtk git add package.json plugins/lpc-toolkit/skills/animation-asset-audit/scripts/read-audit-report.mjs plugins/lpc-toolkit/test/animation-asset-audit.test.mjs plugins/lpc-toolkit/test/fixtures/audit-report.json
rtk git commit -m "feat(plugin): add bounded animation audit reader"
```

After the product commit, update this task's checkboxes and add the required full hash, implementation note, and verification results; commit that update separately.

---

### Task 2: Add and contract the animation audit skill

**Files:**
- Create: `plugins/lpc-toolkit/skills/animation-asset-audit/SKILL.md`
- Create: `plugins/lpc-toolkit/skills/animation-asset-audit/agents/openai.yaml`
- Create: `plugins/lpc-toolkit/skills/animation-asset-audit/references/compatibility.md`
- Create: `plugins/lpc-toolkit/skills/animation-asset-audit/references/cli-contract.json`
- Create: `plugins/lpc-toolkit/skills/animation-asset-audit/references/audit-workflow.md`
- Create: `plugins/lpc-toolkit/skills/animation-asset-audit/scripts/check-cli.mjs`
- Modify: `plugins/lpc-toolkit/skills/character-authoring/SKILL.md`
- Modify: `plugins/lpc-toolkit/test/animation-asset-audit.test.mjs`
- Modify: `scripts/verify-codex-plugin.mjs`
- Modify: `scripts/verify-codex-plugin.test.mjs`
- Modify: `packages/cli/test/plugin-contract.test.ts`

**Interfaces:**
- Consumes: Task 1's report reader and the existing character skill compatibility checker.
- Produces: a discoverable `lpc-animation-asset-audit` skill and tested CLI contract.
- Preserves: the existing character contract command inventory and all lightweight-plugin prohibitions.

- [x] **Step 1: Write failing trigger, workflow, compatibility, and two-skill tests**

  - Implementation: Added audit trigger/workflow/checker-parity assertions,
    exact two-skill verifier fixtures, and shared character/audit CLI contract
    coverage before creating the new skill files.

Extend `animation-asset-audit.test.mjs` to read the new skill files and assert these exact requirements:

```js
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
  ), 'utf8');
  for (const required of [
    '--json', 'unsupported', 'missingFiles', 'blankFrames', 'errors',
    'pathConfidence', 'manual-review', 'recolors', 'same target and scope',
    'Exit code zero', 'upstream/',
  ]) assert.equal(workflow.includes(required), true, `missing ${required}`);
});
```

Extend `scripts/verify-codex-plugin.test.mjs` so `validFixture()` creates both
`skills/animation-asset-audit/SKILL.md` and
`skills/character-authoring/SKILL.md`. Add tests that remove either intended
skill or add `skills/unexpected/SKILL.md` and assert a stable exact-skill-set
error.

Extend `packages/cli/test/plugin-contract.test.ts` with an audit contract path,
an expected ID list, and the same `parseArgs` / `validateCommandOptions` /
`helpForCommand` checks used by the character contract.

- [x] **Step 2: Run focused tests to verify they fail**

  - Verification: `rtk node --test plugins/lpc-toolkit/test/animation-asset-audit.test.mjs scripts/verify-codex-plugin.test.mjs` FAIL — 12 tests passed and 10 failed for the absent audit skill/checker/workflow and the verifier's old one-skill contract.
  - Verification: `rtk pnpm --filter @lpc-toolkit/cli test -- plugin-contract.test.ts` FAIL — 1 suite failed before collection because the audit CLI contract did not exist.

Run:

```sh
rtk node --test plugins/lpc-toolkit/test/animation-asset-audit.test.mjs scripts/verify-codex-plugin.test.mjs
rtk pnpm --filter @lpc-toolkit/cli test -- plugin-contract.test.ts
```

Expected: FAIL because the skill files and audit contract do not exist and the verifier still requires exactly one skill.

- [x] **Step 3: Create the skill-local compatibility contract**

  - Implementation: Added the audit compatibility reference at plugin version
    `0.2.0` and a byte-for-byte self-contained checker copy; both checker files
    have SHA-256 `65c89b434ee703d84b7742f766980aaa57a18bbe1c1568e23e3330bc27f9646b`.

Create `scripts/check-cli.mjs` as a byte-for-byte copy of the existing
`plugins/lpc-toolkit/skills/character-authoring/scripts/check-cli.mjs`. Do not
replace it with a sibling import. Create `references/compatibility.md` with the
same installation and error-code guidance, retaining the current intermediate
plugin version `0.2.0` and changing “character operation” wording to “animation
audit operation”. Task 3 updates both skills to the final `0.2.1` version in one
synchronized commit.

The required preflight remains:

```sh
node "$SKILL_DIR/scripts/check-cli.mjs"
```

- [x] **Step 4: Create the tested audit CLI contract**

  - Implementation: Added the versioned five-command audit inventory ending in
    the scoped, machine-readable `catalog audit-animations` command.

Create `references/cli-contract.json` exactly as:

```json
{
  "schema": "lpc-toolkit.codex-plugin.cli-contract.v1",
  "commands": [
    { "id": "version", "argv": ["--version"], "machineReadable": false },
    { "id": "catalog-types", "argv": ["catalog", "types", "--json"], "machineReadable": true },
    { "id": "catalog-items", "argv": ["catalog", "items", "--type", "hair", "--limit", "20", "--json"], "machineReadable": true },
    { "id": "catalog-item", "argv": ["catalog", "item", "hair_braid", "--json"], "machineReadable": true },
    { "id": "catalog-audit-animations", "argv": ["catalog", "audit-animations", "--animation", "walk", "--animation", "run", "--type", "weapon", "--body-type", "male", "--json"], "machineReadable": true }
  ]
}
```

- [x] **Step 5: Create the audit workflow and top-level skill**

  - Implementation: Added discoverable skill metadata, bounded non-mutating
    audit sequencing, structured finding semantics, worklist verification, and
    OpenAI interface metadata.

Create `references/audit-workflow.md` with these imperative sections and exact
semantics:

```markdown
# Animation Asset Audit Workflow

## Define The Scope

Require at least one registered standard animation. Use `catalog types --json`
or a bounded `catalog items --type <type> --limit 20 --json` only when scope
discovery is needed. Prefer `--type` and `--body-type` when they match the
request. Never assume every item must support every registered animation.

## Preserve One Structured Audit

Run `catalog audit-animations` once with `--json`. Preserve complete stdout in
a task-owned report outside `upstream/` and the managed asset cache; keep stderr
separate. Require `ok: true`, the expected command name, all four finding
arrays, and no top-level errors. Exit code zero means the audit ran, not that
the scope is complete.

Use `node "$SKILL_DIR/scripts/read-audit-report.mjs" <report> <view>` for bounded
agent reads. Continue an unchanged local page with its returned `nextOffset`.
Do not rerun an expensive audit merely because terminal output was truncated.

## Interpret Findings

- `unsupported`: retain every nested requirement. Treat an inferred path as
  guidance; stop for human review when `pathConfidence` is `manual-review`.
- `missingFiles`: treat `path` as the exact expected active-source relative
  path and retain every consumer.
- `blankFrames`: retain path, animation, source animation, direction, source
  row, every source column, logical frame indices, and consumers.
- `errors`: report the inspection failure; do not convert it into speculative
  drawing work.

Runtime `recolors` are dependent outputs, not additional PNGs to draw. A shared
physical path is one task with multiple consumers.

## Produce And Verify The Worklist

Include category, item, type, animation, path evidence, confidence, layer, body
types, variant, recolors, coordinates, and consumers. Do not add, edit,
generate, or repair sprite assets. After authorized external work, rerun the
same target and scope and confirm the intended findings disappear without a
relevant inspection error.
```

Create `SKILL.md` with concise sequencing and routing:

```markdown
---
name: lpc-animation-asset-audit
description: Use when identifying LPC assets with incomplete animation support, missing animation PNGs, transparent animation frames, or when producing or verifying a bounded animation drawing worklist through the installed lpc-toolkit CLI. Do not use for character outfit authoring, non-LPC sprites, unrelated raster editing, or source-asset mutation.
---

# LPC Animation Asset Audit

Use `lpc-toolkit` as the only source of catalog, animation capability, expected
path, source geometry, runtime asset, and inspection behavior.

1. Read `references/compatibility.md`, resolve this skill directory to an
   absolute `SKILL_DIR`, and run `node "$SKILL_DIR/scripts/check-cli.mjs"`.
   Continue only when its JSON result has `ok: true`.
2. Read `references/audit-workflow.md` and treat
   `references/cli-contract.json` as the tested command inventory.
3. Require at least one explicit target animation and choose the narrowest safe
   optional type and body-type scope.
4. Run one `catalog audit-animations --json` command and preserve its complete
   stdout before reading findings.
5. Use `scripts/read-audit-report.mjs` for bounded summary, type, finding, and
   worklist views.
6. Keep unsupported, missing-file, blank-frame, and inspection-error semantics
   distinct. Preserve nested requirements and all physical-file consumers.
7. After external asset work, rerun the same target and scope and verify the
   intended findings, not merely the process exit code.

Do not add, edit, generate, or repair sprite assets. Do not initialize or
modify `upstream/`, bypass cache integrity, suppress attribution, infer an
exact path from `manual-review`, or treat runtime recolors as separate PNGs.
```

Create `agents/openai.yaml` exactly as:

```yaml
interface:
  display_name: "LPC Animation Asset Audit"
  short_description: "Find incomplete LPC animation assets"
  default_prompt: "Audit selected LPC animations and produce a bounded drawing worklist from the structured findings."
policy:
  allow_implicit_invocation: true
```

- [x] **Step 6: Tighten the character-authoring boundary**

  - Implementation: Routed source-asset animation audits and drawing worklists
    to `lpc-animation-asset-audit` from the character skill description and
    opening workflow without expanding the character CLI inventory.

Append this sentence to the existing character skill description and add the
same routing rule after its opening paragraph:

```text
Use lpc-animation-asset-audit for source-asset animation audits and drawing worklists.
```

Do not add `catalog audit-animations` to the character contract or workflow.

- [x] **Step 7: Generalize the lightweight plugin verifier to the exact two-skill set**

  - Implementation: Replaced the one-skill count with a sorted exact-name
    comparison for `animation-asset-audit` and `character-authoring` while
    retaining manifest version `0.2.0` and all lightweight prohibitions.

Replace the one-skill count check in `scripts/verify-codex-plugin.mjs` with a
sorted name comparison:

```js
const skillNames = existsSync(skillRoot)
  ? readdirSync(skillRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .filter((entry) => existsSync(path.join(skillRoot, entry.name, 'SKILL.md')))
    .map((entry) => entry.name)
    .sort()
  : [];
const expectedSkills = ['animation-asset-audit', 'character-authoring'];
if (JSON.stringify(skillNames) !== JSON.stringify(expectedSkills)) {
  errors.push(`plugin skills must be exactly: ${expectedSkills.join(', ')}.`);
}
```

Keep the manifest version assertion at `0.2.0` until Task 3 so this task's
existing manifest remains valid.

- [x] **Step 8: Extend the CLI contract test to both inventories**

  - Implementation: Preserved the exact character inventory and viewer check,
    added the exact audit IDs, and ran shared argument validation/help assertions
    over both non-version inventories.

Refactor `packages/cli/test/plugin-contract.test.ts` to read `characterContract`
and `auditContract` separately. Preserve the existing exact character ID test.
Add this audit ID expectation:

```ts
expect(auditContract.commands.map(({ id }) => id)).toEqual([
  'version',
  'catalog-types',
  'catalog-items',
  'catalog-item',
  'catalog-audit-animations',
]);
```

Run the shared generated-option/help assertion over
`[...characterContract.commands, ...auditContract.commands]`, excluding both
`version` records. Preserve the existing character workflow/viewer assertion.

- [x] **Step 9: Run focused and plugin verification**

  - Verification: `rtk node --test plugins/lpc-toolkit/test/animation-asset-audit.test.mjs scripts/verify-codex-plugin.test.mjs` PASS — 22 tests passed, 0 failed.
  - Verification: `rtk pnpm --filter @lpc-toolkit/cli test -- plugin-contract.test.ts` PASS — 17 tests passed, 0 failed.
  - Verification: `rtk pnpm verify:plugin` PASS — 33 tests passed, 0 failed; plugin structure valid with exactly two discoverable skills.

Run:

```sh
rtk node --test plugins/lpc-toolkit/test/animation-asset-audit.test.mjs scripts/verify-codex-plugin.test.mjs
rtk pnpm --filter @lpc-toolkit/cli test -- plugin-contract.test.ts
rtk pnpm verify:plugin
```

Expected: PASS; exactly two skills are discoverable, both compatibility
contracts are aligned, both CLI inventories validate, and the plugin remains
lightweight.

- [x] **Step 10: Commit the audit skill**

  - Commit: bea40726feeac3d0cae0404536b39a969762c716
  - Implementation: Committed the audit skill, self-contained compatibility
    contract, bounded workflow, routing boundary, exact two-skill verifier, and
    dual CLI contract coverage as `feat(plugin): add animation asset audit skill`.

```sh
rtk git add plugins/lpc-toolkit/skills/animation-asset-audit plugins/lpc-toolkit/skills/character-authoring/SKILL.md plugins/lpc-toolkit/test/animation-asset-audit.test.mjs scripts/verify-codex-plugin.mjs scripts/verify-codex-plugin.test.mjs packages/cli/test/plugin-contract.test.ts
rtk git commit -m "feat(plugin): add animation asset audit skill"
```

After the product commit, update this task's checkboxes and add the required full hash, implementation note, and verification results; commit that update separately.

---

### Task 3: Publish the two-workflow plugin presentation

**Files:**
- Modify: `plugins/lpc-toolkit/.codex-plugin/plugin.json`
- Modify: `plugins/lpc-toolkit/skills/animation-asset-audit/references/compatibility.md`
- Modify: `plugins/lpc-toolkit/skills/character-authoring/references/compatibility.md`
- Modify: `plugins/lpc-toolkit/test/check-cli.test.mjs`
- Modify: `scripts/verify-codex-plugin.mjs`
- Modify: `scripts/verify-codex-plugin.test.mjs`
- Modify: `README.md`

**Interfaces:**
- Consumes: Task 2's two discoverable skills.
- Produces: plugin version `0.2.1`, accurate public prompts/descriptions, and synchronized compatibility prose.
- Preserves: plugin name, source path, license, icons, marketplace identity, CLI range, and lightweight component prohibitions.

- [x] **Step 1: Write failing presentation and version assertions**

Extend `scripts/verify-codex-plugin.test.mjs` and `check-cli.test.mjs` to require:

```js
assert.equal(manifest.version, '0.2.1');
assert.match(manifest.description, /audit/u);
assert.match(manifest.interface.longDescription, /drawing worklist/u);
assert.equal(
  manifest.interface.defaultPrompt.some((prompt) => /incomplete.*animation/iu.test(prompt)),
  true,
);
```

Read both compatibility references and assert each contains:

```text
Plugin version `0.2.1` supports `@lpc-toolkit/cli >=0.2.0 <0.3.0`
```

Add a README assertion that the Codex Plugin section contains plugin `0.2.1`,
`catalog audit-animations`, and `drawing worklist`.

- [x] **Step 2: Run focused tests to verify they fail**

Run:

```sh
rtk node --test plugins/lpc-toolkit/test/check-cli.test.mjs scripts/verify-codex-plugin.test.mjs
```

Expected: FAIL because the manifest, verifier, references, and README still
name `0.2.0` and character-only presentation.

- [x] **Step 3: Update manifest and verifier version contracts**

Set manifest and verifier fixture/assertion versions to `0.2.1`. Use this
plugin presentation:

```json
{
  "description": "Create attributed LPC characters and audit incomplete animation assets through the installed LPC Toolkit CLI.",
  "keywords": ["lpc", "sprites", "characters", "animation-audit", "game-assets", "cli"],
  "interface": {
    "shortDescription": "Author LPC characters and audit animation assets",
    "longDescription": "Guide Codex through attributed LPC character authoring and read-only animation asset audits that produce bounded drawing worklists from structured CLI findings.",
    "defaultPrompt": [
      "Create an LPC character from the farmer preset and help me refine the outfit.",
      "Change my LPC character's hair, preview it, and render an attributed ZIP bundle.",
      "Find weapon assets with incomplete run animation support and produce a bounded drawing worklist."
    ]
  }
}
```

Preserve every existing manifest field not shown, including author, URLs,
license, category, capabilities, icons, logo, and brand color.

- [x] **Step 4: Synchronize compatibility prose and root README**

Change both compatibility references from plugin `0.2.0` to `0.2.1` without
changing `>=0.2.0 <0.3.0`. In the README Codex Plugin section:

- change “plugin `0.2.0`” to “plugin `0.2.1`”;
- keep the existing install and compatibility commands; and
- extend the capability paragraph with a sentence stating that the plugin can
  run `catalog audit-animations`, preserve structured findings, and produce a
  bounded drawing worklist without modifying source assets.

- [x] **Step 5: Run focused and plugin verification**

Run:

```sh
rtk node --test plugins/lpc-toolkit/test/check-cli.test.mjs scripts/verify-codex-plugin.test.mjs
rtk pnpm verify:plugin
```

Expected: PASS with manifest `0.2.1`, synchronized compatibility text, two
skills, and correct public presentation.

- [x] **Step 6: Commit the plugin presentation**

```sh
rtk git add README.md plugins/lpc-toolkit/.codex-plugin/plugin.json plugins/lpc-toolkit/skills/animation-asset-audit/references/compatibility.md plugins/lpc-toolkit/skills/character-authoring/references/compatibility.md plugins/lpc-toolkit/test/check-cli.test.mjs scripts/verify-codex-plugin.mjs scripts/verify-codex-plugin.test.mjs
rtk git commit -m "docs(plugin): publish animation audit workflow"
```

After the product commit, update this task's checkboxes and add the required full hash, implementation note, and verification results; commit that update separately.

**Implementation record:**

- Product commit: `0e1b649687f3d8eff56c3ed6fbb5518e1afaee23` — `docs(plugin): publish animation audit workflow`.
- Implementation: Published plugin `0.2.1` with the two-workflow description,
  prompts, keywords, and README capability summary. The verifier fixture and
  runtime contract now require `0.2.1`; both skill compatibility references use
  the final plugin version while preserving `@lpc-toolkit/cli >=0.2.0 <0.3.0`.
- RED verification: `rtk node --test plugins/lpc-toolkit/test/check-cli.test.mjs scripts/verify-codex-plugin.test.mjs` FAIL — 19 passed, 2 failed as expected because the compatibility references and manifest still presented `0.2.0`.
- GREEN verification: `rtk node --test plugins/lpc-toolkit/test/check-cli.test.mjs scripts/verify-codex-plugin.test.mjs` PASS — 21 passed, 0 failed.
- Plugin verification: `rtk pnpm verify:plugin` PASS — 34 passed, 0 failed; `Codex plugin structure is valid.`

---

### Task 4: Verify the complete plugin and reassess documentation impact

**Files:**
- Modify only if verification exposes a scoped defect: files already owned by Tasks 1-3.
- Modify: `docs/superpowers/plans/2026-07-19-lpc-animation-asset-audit-skill.md` with final records.

**Interfaces:**
- Consumes: the complete two-skill plugin from Tasks 1-3.
- Produces: final verification evidence and an accurate CLI documentation impact declaration.

- [ ] **Step 1: Run the focused plugin tests**

```sh
rtk node --test plugins/lpc-toolkit/test/animation-asset-audit.test.mjs plugins/lpc-toolkit/test/check-cli.test.mjs scripts/verify-codex-plugin.test.mjs
rtk pnpm --filter @lpc-toolkit/cli test -- plugin-contract.test.ts
rtk pnpm verify:plugin
```

Expected: PASS for helper behavior, skill/static contracts, both CLI inventories,
plugin structure, compatibility parity, and presentation.

- [ ] **Step 2: Run the repository verification gate**

```sh
rtk pnpm verify
```

Expected: PASS. Do not weaken a failing gate. Fix only failures caused by this
change and rerun the narrowest failing command before rerunning `verify`.

- [ ] **Step 3: Reassess the CLI documentation matrix**

Confirm before handoff:

```text
help: N/A — no CLI command or help behavior changes
cli-readme: N/A — existing audit command documentation remains accurate
root-readme: update — plugin version and audit capability are documented
landing: N/A — no product landing workflow change
architecture: N/A — no runtime or package boundary change
engineering: N/A — public verification command names remain unchanged
releasing: N/A — no CLI publication workflow change
plugin: update — audit skill, workflow, contract, metadata, and tests added
```

Use this PR declaration:

```text
CLI docs impact: updated
CLI docs surfaces: root-readme, plugin
```

- [ ] **Step 4: Review the final diff for forbidden scope**

Run:

```sh
rtk git status --short
rtk git diff --check
rtk git diff --stat 09d38c3251ea660d7dc13780a98592632f83fd76..HEAD
rtk rg -n "upstream/|allow-partial|asset mutation|0\.2\.0" plugins/lpc-toolkit README.md
```

Expected: only planned plugin, test, README, package-script, CLI contract-test,
spec, and plan files are changed; no dependency, asset, CLI production, Core,
web, `upstream/`, or attribution behavior changed. Review every `0.2.0` match:
CLI minimum/range references remain correct, while plugin-version references
must be `0.2.1`.

- [ ] **Step 5: Record final evidence**

Update every completed checkbox in this plan. For each product task, record its
full product commit hash, implementation note, and exact PASS/FAIL commands.
Add the final matrix reassessment and full `rtk pnpm verify` PASS result. Commit
only the plan record:

```sh
rtk git add docs/superpowers/plans/2026-07-19-lpc-animation-asset-audit-skill.md
rtk git commit -m "docs(plan): record animation audit skill verification"
```
