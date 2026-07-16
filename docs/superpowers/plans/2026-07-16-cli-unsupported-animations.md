# CLI Unsupported Animations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `catalog item` report native, compatible, and unsupported animations while making catalog animation filters honor custom-animation compatibility.

**Architecture:** Keep the capability calculation inside CLI catalog discovery, using Core's existing ordered animation registry, defaults, and custom-animation base definitions. Item summaries retain their compact schema; item details add two arrays, and human formatting emits them only for detail responses.

**Tech Stack:** TypeScript, Node.js 22+, pnpm, Vitest, existing `@lpc-toolkit/core` animation registries.

## Global Constraints

- Add no dependency and no `any` type.
- Preserve `animations` as native identifiers; do not insert derived base names.
- Use `ANIMATION_DEFAULTS` only when `animations` is missing or malformed; preserve an explicit empty array.
- Order compatible and unsupported standard names by `ANIMATIONS`.
- Do not change render, preview, export, frame extraction, or attribution behavior.
- Do not modify or initialize `upstream/`.
- Prefix every repository command with `rtk`.

## File Structure

- `packages/cli/src/catalog-discovery.ts` — own normalized native animation metadata and derived capability calculation.
- `packages/cli/src/catalog-commands.ts` — consume capabilities for `--animation` filtering and validation.
- `packages/cli/src/response.ts` — format detail-only human animation capability lines.
- `packages/cli/src/command-spec.ts` — describe the richer `catalog item` inspection contract.
- `packages/cli/test/catalog-commands.test.ts` — verify JSON/detail data, normalization, custom bases, filtering, and edge cases.
- `packages/cli/test/main-human.test.ts` — verify human detail output and compact list output.
- `packages/cli/test/command-spec.test.ts` — verify help text.
- `packages/cli/README.md` — document public human and JSON fields.
- `plugins/lpc-toolkit/skills/character-authoring/references/cli-workflow.md` — teach agents how to interpret the fields.

## CLI Documentation Impact

```text
help: update
cli-readme: update
root-readme: N/A — quick start and command usage remain unchanged
landing: N/A — existing command and credit-inspection description remain valid
architecture: N/A — package boundaries and ownership do not change
engineering: N/A — development and verification commands do not change
releasing: N/A — packaging, versioning, and publication do not change
plugin: update
```

The implementation pull request must declare:

```text
CLI docs impact: updated
CLI docs surfaces: help, cli-readme, plugin
```

---

### Task 1: Add the animation capability model and compatible filtering

**Files:**
- Modify: `packages/cli/src/catalog-discovery.ts`
- Modify: `packages/cli/src/catalog-commands.ts`
- Test: `packages/cli/test/catalog-commands.test.ts`

**Interfaces:**
- Consumes: `ANIMATIONS`, `ANIMATION_DEFAULTS`, `customAnimations`, and `customAnimationBase` from `@lpc-toolkit/core`.
- Produces: exported `itemAnimationCapabilities(item: ItemDefinition): ItemAnimationCapabilities` with `native`, `compatible`, and `unsupported` arrays.
- Produces: `DiscoveryItemDetail.compatibleAnimations` and `DiscoveryItemDetail.unsupportedAnimations`.
- Produces: catalog filtering and validation over the union of native and compatible animation names.

- [x] **Step 1: Write failing detail-capability tests**

Import `ANIMATION_DEFAULTS` and add fixtures for Wheelchair, `tool_rod`, an unknown custom animation, an explicit empty list, and missing/malformed metadata. Add assertions shaped like:

```ts
it('reports native, compatible, and unsupported animations', () => {
  const wheelchair: ItemDefinition = {
    ...hair,
    name: 'Wheelchair',
    type_name: 'wheelchair',
    animations: ['wheelchair'],
  };
  const detail = getCatalogItem(
    createCatalog({ 'body/wheelchair.json': wheelchair }).catalog,
    'wheelchair',
    palettes,
  );

  expect(detail).toMatchObject({
    animations: ['wheelchair'],
    compatibleAnimations: ['sit'],
  });
  expect(detail?.unsupportedAnimations).not.toContain('sit');
  expect(detail?.unsupportedAnimations).toContain('walk');
});

it.each([
  ['tool_rod', 'thrust'],
  ['slash_oversize', 'slash'],
])('derives the registered base for %s', (customName, baseName) => {
  const item = { ...hair, name: customName, animations: [customName] } as ItemDefinition;
  const detail = getCatalogItem(
    createCatalog({ [`hair/${customName}.json`]: item }).catalog,
    customName,
    palettes,
  );

  expect(detail).toMatchObject({
    animations: [customName],
    compatibleAnimations: [baseName],
  });
  expect(detail?.unsupportedAnimations).not.toContain(baseName);
});

it('normalizes missing and malformed animations but preserves an empty array', () => {
  const missing = {
    name: 'Missing',
    type_name: 'hair',
    credits: hair.credits,
    layer_1: hair.layer_1,
  } as unknown as ItemDefinition;
  const malformed = { ...hair, animations: 'walk' } as unknown as ItemDefinition;
  const empty = { ...hair, animations: [] };
  const catalog = createCatalog({
    'hair/missing.json': missing,
    'hair/malformed.json': malformed,
    'hair/empty.json': empty,
  }).catalog;

  expect(getCatalogItem(catalog, 'missing', palettes)?.animations).toEqual(ANIMATION_DEFAULTS);
  expect(getCatalogItem(catalog, 'malformed', palettes)?.animations).toEqual(ANIMATION_DEFAULTS);
  expect(getCatalogItem(catalog, 'empty', palettes)).toMatchObject({
    animations: [],
    compatibleAnimations: [],
  });
});

it('does not infer compatibility for an unknown custom animation', () => {
  const item = { ...hair, name: 'Unknown', animations: ['unknown_custom'] };
  const detail = getCatalogItem(
    createCatalog({ 'hair/unknown.json': item }).catalog,
    'unknown',
    palettes,
  );

  expect(detail).toMatchObject({
    animations: ['unknown_custom'],
    compatibleAnimations: [],
  });
  expect(detail?.unsupportedAnimations).toContain('sit');
});
```

Change the existing missing-animation discovery expectation from `animations: []` to `animations: ANIMATION_DEFAULTS` so it demonstrates the Core/CLI inconsistency being corrected.

- [x] **Step 2: Run the detail tests and verify RED**

Run:

```sh
rtk pnpm --filter @lpc-toolkit/cli test -- catalog-commands.test.ts
```

Expected: FAIL because `compatibleAnimations` and `unsupportedAnimations` are absent and missing metadata still produces an empty list.

- [x] **Step 3: Implement the minimal capability calculator**

In `catalog-discovery.ts`, extend the Core import and add the following focused interface and helper:

```ts
export interface ItemAnimationCapabilities {
  readonly native: readonly AnimationName[];
  readonly compatible: readonly AnimationName[];
  readonly unsupported: readonly AnimationName[];
}

const STANDARD_ANIMATION_NAMES = ANIMATIONS.map((animation) => animation.value);
const STANDARD_ANIMATION_SET = new Set<AnimationName>(STANDARD_ANIMATION_NAMES);

export function itemAnimationCapabilities(
  item: ItemDefinition,
): ItemAnimationCapabilities {
  const raw: unknown = item.animations;
  const native = Array.isArray(raw)
    ? [...new Set(raw.filter((name): name is AnimationName => typeof name === 'string'))]
    : [...ANIMATION_DEFAULTS];
  const nativeSet = new Set(native);
  const compatibleSet = new Set<AnimationName>();

  for (const name of native) {
    const custom = customAnimations[name];
    if (!custom) continue;
    const base = customAnimationBase(custom);
    if (STANDARD_ANIMATION_SET.has(base) && !nativeSet.has(base)) {
      compatibleSet.add(base);
    }
  }

  const compatible = STANDARD_ANIMATION_NAMES.filter((name) => compatibleSet.has(name));
  const unsupported = STANDARD_ANIMATION_NAMES.filter(
    (name) => !nativeSet.has(name) && !compatibleSet.has(name),
  );
  return { native, compatible, unsupported };
}
```

Add fields to the detail interface and use the helper without expanding summaries:

```ts
export interface DiscoveryItemDetail extends DiscoveryItemSummary {
  readonly compatibleAnimations: readonly AnimationName[];
  readonly unsupportedAnimations: readonly AnimationName[];
  readonly credits: readonly CreditEntry[];
}

// in toDiscoveryCandidate
animations: itemAnimationCapabilities(item).native,

// in toDiscoveryDetail
const candidate = toDiscoveryCandidate(item, palettes);
if (!candidate) return undefined;
const capabilities = itemAnimationCapabilities(item);
return {
  ...candidate.summary,
  compatibleAnimations: capabilities.compatible,
  unsupportedAnimations: capabilities.unsupported,
  credits: item.credits,
};
```

- [x] **Step 4: Run the detail tests and verify GREEN**

Run the same focused command. Expected: PASS with no warnings or errors.

- [x] **Step 5: Write a failing compatible-filter test**

Add a runtime fixture containing only a credited Wheelchair definition and assert both validation and filtering accept its base:

```ts
it('filters custom animations by their compatible standard base', () => {
  const cwd = mkdtempSync(path.join(tmpdir(), 'lpc-catalog-custom-'));
  const definitionPath = path.join(
    cwd,
    'assets',
    'sheet_definitions',
    'body',
    'wheelchair.json',
  );
  mkdirSync(path.dirname(definitionPath), { recursive: true });
  writeFileSync(definitionPath, JSON.stringify({
    ...hair,
    name: 'Wheelchair',
    type_name: 'wheelchair',
    animations: ['wheelchair'],
  }));

  const response = runCatalogCommand(
    parseArgs(['catalog', 'items', '--animation', 'sit']),
    createRuntime(cwd),
  );

  expect(response).toMatchObject({
    ok: true,
    data: { items: [{ itemId: 'wheelchair', animations: ['wheelchair'] }] },
    errors: [],
  });
});
```

- [x] **Step 6: Run the compatible-filter test and verify RED**

Run the focused CLI test command. Expected: FAIL with `unknown_animation` or an empty result because filtering still checks native names only.

- [x] **Step 7: Make catalog filters consume capabilities**

In `catalog-commands.ts`, import `itemAnimationCapabilities`, remove the local `itemAnimations`, and use:

```ts
function itemMatchesAnimation(item: ItemDefinition, animation: AnimationName): boolean {
  const capabilities = itemAnimationCapabilities(item);
  return capabilities.native.includes(animation)
    || capabilities.compatible.includes(animation);
}
```

Apply it to list filtering:

```ts
if (options.animation && !itemMatchesAnimation(item, options.animation)) return [];
```

Build the validation domain from the same capability union:

```ts
const animations = domain(items.flatMap((item) => {
  const capabilities = itemAnimationCapabilities(item);
  return [...capabilities.native, ...capabilities.compatible];
}));
```

- [x] **Step 8: Run catalog command tests and CLI typecheck**

Run:

```sh
rtk pnpm --filter @lpc-toolkit/cli test -- catalog-commands.test.ts
rtk pnpm --filter @lpc-toolkit/cli run typecheck
```

Expected: both PASS.

- [x] **Step 9: Commit the capability model**

```sh
rtk git add packages/cli/src/catalog-discovery.ts packages/cli/src/catalog-commands.ts packages/cli/test/catalog-commands.test.ts
rtk git commit -m "feat(cli): report unsupported asset animations"
```

After the commit, check this task's boxes and add the full commit hash plus exact PASS commands beneath the task heading.

Implementation note: Added normalized native animation metadata, ordered compatible/unsupported standard capability arrays, registered custom-animation base inference, and compatible animation filtering/validation. Missing or malformed metadata now uses `ANIMATION_DEFAULTS`, while explicit empty arrays remain empty.

Commit: f96f69e6905cb8d6e5da3f92d988ca754db6679d

Verification: `rtk pnpm --filter @lpc-toolkit/cli test -- catalog-commands.test.ts` PASS (22 tests)

Verification: `rtk pnpm --filter @lpc-toolkit/cli run typecheck` PASS

---

### Task 2: Add human output and command help

**Files:**
- Modify: `packages/cli/src/response.ts`
- Modify: `packages/cli/src/command-spec.ts`
- Test: `packages/cli/test/main-human.test.ts`
- Test: `packages/cli/test/command-spec.test.ts`

**Interfaces:**
- Consumes: optional `compatibleAnimations` and `unsupportedAnimations` detail fields.
- Produces: two detail-only human lines and help text that names animation capability inspection.

- [x] **Step 1: Write failing human-output tests**

Extend the existing `prints one catalog item without --json` test and list-summary test:

```ts
expect(output).toContain('compatible standard animations: none');
expect(output).toContain('unsupported standard animations: spellcast, thrust');
```

For `catalog items --type hair`, assert:

```ts
expect(output).not.toContain('compatible standard animations:');
expect(output).not.toContain('unsupported standard animations:');
```

- [x] **Step 2: Run the human-output test and verify RED**

```sh
rtk pnpm --filter @lpc-toolkit/cli test -- main-human.test.ts
```

Expected: FAIL because the new detail fields are not formatted.

- [x] **Step 3: Format detail-only fields**

In `formatCatalogItemDetails`, append lines only when the fields exist:

```ts
const compatibleAnimations = stringArrayValue(item, 'compatibleAnimations');
const unsupportedAnimations = stringArrayValue(item, 'unsupportedAnimations');
return [
  `${indent}supported body types: ${formatCsv(stringArrayValue(item, 'supportedBodyTypes'))}`,
  `${indent}variants: ${formatCsv(stringArrayValue(item, 'variants'))}`,
  `${indent}recolors: ${formatCsv(stringArrayValue(item, 'recolors'))}`,
  `${indent}animations: ${formatCsv(stringArrayValue(item, 'animations'))}`,
  ...(compatibleAnimations === undefined ? [] : [
    `${indent}compatible standard animations: ${formatCsv(compatibleAnimations)}`,
  ]),
  ...(unsupportedAnimations === undefined ? [] : [
    `${indent}unsupported standard animations: ${formatCsv(unsupportedAnimations)}`,
  ]),
  `${indent}licenses: ${formatCsv(stringArrayValue(item, 'licenses'))}`,
  `${indent}credit count: ${numberValue(item, 'creditCount') ?? 0}`,
];
```

Because summary objects omit both fields, list output remains compact without a separate formatter mode.

- [x] **Step 4: Run the human-output test and verify GREEN**

Run the same focused command. Expected: PASS.

- [x] **Step 5: Write and verify a failing help-text test**

Add:

```ts
it('describes catalog item animation capability inspection', () => {
  expect(helpForCommand(['catalog', 'item'])).toContain(
    'Show one catalog item with credits and animation capabilities.',
  );
});
```

Run:

```sh
rtk pnpm --filter @lpc-toolkit/cli test -- command-spec.test.ts
```

Expected: FAIL because help still says only `Show one catalog item.`

- [x] **Step 6: Update the command description and verify GREEN**

Set the `catalog item` description in `command-spec.ts` to:

```ts
description: 'Show one catalog item with credits and animation capabilities.',
```

Run:

```sh
rtk pnpm --filter @lpc-toolkit/cli test -- command-spec.test.ts main-human.test.ts
rtk pnpm --filter @lpc-toolkit/cli run typecheck
```

Expected: both PASS.

- [x] **Step 7: Commit the human and help contract**

```sh
rtk git add packages/cli/src/response.ts packages/cli/src/command-spec.ts packages/cli/test/main-human.test.ts packages/cli/test/command-spec.test.ts
rtk git commit -m "feat(cli): show animation capabilities in item details"
```

After the commit, check this task's boxes and add the full commit hash plus exact PASS commands beneath the task heading.

Implementation note: Human detail output now labels compatible and unsupported standard animation arrays, while compact list summaries omit both fields. Catalog item help describes the richer inspection contract.

Commit: 43d9ac6ac1f9d90b42877c59e92e582fa986cad3

Verification: `rtk pnpm --filter @lpc-toolkit/cli test -- command-spec.test.ts main-human.test.ts` PASS (35 tests)

Verification: `rtk pnpm --filter @lpc-toolkit/cli run typecheck` PASS

---

### Task 3: Document the public and agent-facing contract

**Files:**
- Modify: `packages/cli/README.md`
- Modify: `plugins/lpc-toolkit/skills/character-authoring/references/cli-workflow.md`

**Interfaces:**
- Consumes: the final human and JSON field names from Tasks 1–2.
- Produces: public CLI guidance and agent interpretation rules.

- [x] **Step 1: Update the CLI README**

After the catalog discovery paragraph, add a concrete detail example and semantics:

```markdown
`catalog item <itemId>` keeps `animations` as the asset's native animation
identifiers. Item detail also reports `compatibleAnimations`, derived from
registered custom-animation bases such as `wheelchair` → `sit`, and
`unsupportedAnimations`, the ordered standard animation names supported by
neither the native nor compatible set. Human output labels the latter fields
`compatible standard animations` and `unsupported standard animations`.
Definitions without a valid `animations` array use the same standard defaults
as Core composition; an explicit empty array remains empty.
```

- [x] **Step 2: Update the plugin workflow**

After the search-summary paragraph, add:

```markdown
The `catalog item` detail preserves native identifiers in `animations` and adds
`compatibleAnimations` plus `unsupportedAnimations`. Treat a compatible base
as an action the asset can participate in, while retaining the native custom
name when requesting or describing the actual custom animation output.
```

- [x] **Step 3: Verify documentation and plugin contracts**

Run:

```sh
rtk pnpm verify:cli-docs-policy
rtk pnpm verify:plugin
rtk git diff --check
```

Expected: all PASS with no whitespace errors.

- [x] **Step 4: Commit the documentation**

```sh
rtk git add packages/cli/README.md plugins/lpc-toolkit/skills/character-authoring/references/cli-workflow.md
rtk git commit -m "docs(cli): explain animation capability fields"
```

After the commit, check this task's boxes and add the full commit hash plus exact PASS commands beneath the task heading.

Implementation note: Documented native-versus-compatible semantics, unsupported standard animation ordering, default normalization, and the agent-facing interpretation of compatible custom-animation bases.

Commit: 7f764f1ff01559ed127ad1b8140c55a67615bd7e

Verification: `rtk pnpm verify:cli-docs-policy` PASS

Verification: `rtk pnpm verify:plugin` PASS

Verification: `rtk git diff --check` PASS

---

### Task 4: Run final verification and reassess documentation impact

**Files:**
- Modify: `docs/superpowers/plans/2026-07-16-cli-unsupported-animations.md` with checked tasks, implementation notes, full hashes, exact verification commands, and PASS/FAIL results.

**Interfaces:**
- Consumes: all implementation and documentation from Tasks 1–3.
- Produces: handoff evidence proving the feature, packaging, plugin, and documentation policy remain valid.

- [x] **Step 1: Run the complete CLI and common gates**

```sh
rtk pnpm --filter @lpc-toolkit/cli run typecheck
rtk pnpm --filter @lpc-toolkit/cli test
rtk pnpm verify:plugin
rtk pnpm verify
```

Expected: every command PASS.

- [x] **Step 2: Run build and packed-package smoke verification**

```sh
rtk pnpm --filter @lpc-toolkit/cli build
rtk pnpm --filter @lpc-toolkit/cli test:package
```

Expected: both PASS, proving the bundled Core exports and installed CLI contract work.

- [x] **Step 3: Reassess the CLI Documentation Impact matrix**

Confirm the final diff contains `packages/cli/src/command-spec.ts`,
`packages/cli/README.md`, and
`plugins/lpc-toolkit/skills/character-authoring/references/cli-workflow.md`, while
the root README, landing page, architecture, engineering, and releasing guides
remain N/A for the reasons recorded above.

- [x] **Step 4: Record evidence and inspect the final diff**

Update this plan after every completed task with checked boxes, concise
implementation notes, full commit hashes, and exact PASS/FAIL command results.
Then run:

```sh
rtk git diff --check
rtk git status --short
rtk git log -5 --oneline
```

Expected: no whitespace errors, only the plan evidence change remains uncommitted, and the expected focused commits are at the tip.

- [x] **Step 5: Commit the completed plan record**

```sh
rtk git add docs/superpowers/plans/2026-07-16-cli-unsupported-animations.md
rtk git commit -m "docs(plan): record CLI animation capability verification"
```

After the commit, verify `rtk git status --short` reports a clean worktree.

Implementation note: Updated the existing discovery exact-object expectation for the new detail fields. Reassessed the CLI documentation matrix: help, cli-readme, and plugin are updated; root-readme, landing, architecture, engineering, and releasing remain N/A for the documented reasons.

Commit: 0fc8bc416adeed95e9d8ad88053e9ba4d60d5978 (discovery expectation)

Verification: `rtk pnpm --filter @lpc-toolkit/cli run typecheck` PASS

Verification: `rtk pnpm --filter @lpc-toolkit/cli test` PASS (32 files, 355 passed, 1 skipped; run with escalation for local web-server ports)

Verification: `rtk pnpm verify:plugin` PASS

Verification: `rtk pnpm verify` PASS (workspace typecheck and tests; run with escalation for tsx IPC/local assets)

Verification: `rtk pnpm --filter @lpc-toolkit/cli build` PASS

Verification: `rtk pnpm --filter @lpc-toolkit/cli test:package` PASS (packed CLI install smoke test)

Verification: `rtk git diff --check` PASS; `rtk git status --short` shows only this plan evidence change before its final commit.

Review note: Code review found no Critical or Important issues. A minor malformed-array edge case was addressed by treating mixed-type animation arrays as malformed and defaulting them to `ANIMATION_DEFAULTS`.

Commit: 51e3430ef9642167b91a452cb7a190660658c94a

Verification: `rtk pnpm --filter @lpc-toolkit/cli test -- catalog-commands.test.ts` PASS (22 tests)

Verification: `rtk pnpm --filter @lpc-toolkit/cli run typecheck` PASS
