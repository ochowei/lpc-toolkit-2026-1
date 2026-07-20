# LPC Animation Asset Audit Skill Design

**Date:** 2026-07-19

## Context

`@lpc-toolkit/cli` 0.2.0 already provides a read-only
`catalog audit-animations` command that can identify incomplete support for a
chosen set of standard animations. It distinguishes four outcomes:

- an item does not declare or compatibly provide an animation;
- an expected PNG is missing;
- a referenced source cell is fully transparent; or
- an asset could not be inspected.

The current `lpc-toolkit` Codex plugin does not expose that workflow. Its only
skill, `lpc-character-authoring`, is intentionally scoped to composing,
editing, validating, previewing, and rendering characters. Its tested CLI
contract does not include `catalog audit-animations`, and its instructions do
not explain how to turn audit findings into drawing tasks.

An agent can discover and invoke the audit command outside the plugin contract,
but that is an ad hoc fallback rather than a supported plugin workflow. Full
audit responses can also be too large to consume directly: a `walk` and `run`
audit of the current catalog scans hundreds of items and can return thousands
of missing-file and blank-frame findings. A reliable skill must keep the
complete report while giving the agent bounded views of it.

## Goals

- Add a focused plugin skill for identifying which LPC assets lack which parts
  of selected standard animations.
- Keep the CLI as the only source of catalog, capability, path, frame geometry,
  runtime asset, and inspection behavior.
- Require an explicit animation target and encourage the narrowest useful type
  and body-type scope.
- Preserve the complete JSON audit report before deriving summaries or drawing
  worklists.
- Translate `unsupported`, `missingFiles`, `blankFrames`, and `errors` into
  distinct, actionable guidance without changing their meaning.
- Prevent large reports from overwhelming the agent context by providing a
  deterministic, bounded report-reading helper.
- Re-run the same audit scope after asset work and assess completion from the
  returned summary and findings rather than the process exit code alone.
- Keep character composition and source-asset maintenance as separate skill
  responsibilities.

## Non-goals

- Do not add, edit, generate, or repair spritesheet PNGs.
- Do not update catalog definitions or `CREDITS.csv`.
- Do not decide that every catalog item must support every registered
  animation.
- Do not add an arbitrary asset-root option or change runtime asset precedence.
- Do not duplicate animation capability, path inference, image decoding, or
  blank-frame detection outside the CLI.
- Do not add an MCP server, app, hook, or third-party dependency.
- Do not modify or initialize `upstream/`.
- Do not add the future `lpc-animation-asset-authoring` skill in this change.

## Selected Approach

Add one new `lpc-animation-asset-audit` skill and tighten the existing
`lpc-character-authoring` trigger boundary.

```text
User request
  |-- compose or render a character
  |     -> lpc-character-authoring
  |
  `-- identify incomplete animation assets or make a drawing worklist
        -> lpc-animation-asset-audit
              -> lpc-toolkit catalog audit-animations --json
              -> preserved full report
              -> bounded summary or finding view
```

This boundary keeps the existing character workflow small and prevents source
asset production concepts from leaking into character selection and rendering.

The alternatives are:

1. **Expand `lpc-character-authoring`.** This requires fewer files, but broadens
   its triggers, loads irrelevant instructions for normal character work, and
   mixes consumer composition with contributor asset maintenance.
2. **Add a broad asset-authoring skill immediately.** This could eventually
   cover auditing and repair, but the CLI currently provides a read-only audit
   contract rather than a safe asset-editing contract. Instructions would have
   to depend on repository internals and unrelated image tools.
3. **Add an umbrella routing skill plus two focused skills.** This may become
   useful if the plugin gains several asset-production workflows, but a second
   workflow does not yet justify another always-visible routing layer.

The selected focused skill is the smallest design that makes the existing CLI
audit capability reliable for agents without precommitting to asset mutation.

## Repository Layout

Add the new skill beside character authoring:

```text
plugins/lpc-toolkit/
  .codex-plugin/
    plugin.json                         # update presentation and prompts
  skills/
    animation-asset-audit/
      SKILL.md
      agents/
        openai.yaml
      references/
        audit-workflow.md
        cli-contract.json
        compatibility.md
      scripts/
        check-cli.mjs
        read-audit-report.mjs
    character-authoring/
      SKILL.md                           # clarify exclusion and routing
      agents/openai.yaml
      references/
      scripts/
  test/
    check-cli.test.mjs                   # retain existing compatibility tests
    animation-asset-audit.test.mjs       # new contract and helper tests
```

The audit skill retains a skill-local compatibility checker so the skill is
self-contained. Its supported range must match the plugin's character skill.
Plugin tests compare the two declared ranges so a future release cannot update
one silently. This small duplication is preferable to a sibling-skill import
that would make either skill unusable outside the exact plugin directory
layout.

## Skill Trigger And Boundary

The new skill name is `lpc-animation-asset-audit`. Its description should
trigger when a user asks to:

- find assets with incomplete animation support;
- identify missing animation PNGs or transparent animation frames;
- audit one or more LPC animations by asset type or body type;
- create or refine an animation drawing worklist; or
- verify that a completed asset contribution removed the intended findings.

It must explicitly exclude character outfit authoring, unrelated raster image
editing, non-LPC sprites, and requests to mutate source assets.

The existing `lpc-character-authoring` description and `SKILL.md` should state
that source-asset animation audits belong to `lpc-animation-asset-audit`. Its
existing command contract remains character-focused and does not gain
`catalog audit-animations`.

## Compatibility Preflight

Before an audit operation, resolve the installed audit skill directory to an
absolute `SKILL_DIR` and run:

```sh
node "$SKILL_DIR/scripts/check-cli.mjs"
```

The initial audit skill version supports the same public CLI range as the
current plugin:

```text
@lpc-toolkit/cli >=0.2.0 <0.3.0
```

Continue only when the JSON result has `ok: true`. Missing, malformed, or
unsupported CLI versions stop the workflow. The plugin never installs or
upgrades the CLI silently.

## Tested CLI Contract

The audit skill owns a separate `references/cli-contract.json`. It includes
only the commands needed to scope, execute, and explain an audit:

```text
lpc-toolkit --version
lpc-toolkit catalog types --json
lpc-toolkit catalog items --type <type> --limit 20 --json
lpc-toolkit catalog item <item-id> --json
lpc-toolkit catalog audit-animations \
  --animation <name> [--animation <name> ...] \
  [--type <type>] [--body-type <body-type>] --json
```

`catalog types` and bounded `catalog items` calls support scope discovery.
`catalog item` supports exact follow-up inspection. The skill must not use
unbounded `catalog items --all` merely to approximate an audit because
`audit-animations` is already complete and unpaginated for its chosen scope.

## Audit Workflow

### 1. Define completeness

Ask for or infer the smallest safe target from the user's request:

- at least one registered standard animation;
- an optional catalog type; and
- an optional body type.

Do not silently audit every registered animation. Supporting every animation is
not a universal catalog requirement, and an all-animation scan creates a noisy,
misleading worklist. If the user explicitly requests a broad inventory, record
the chosen target set and explain that findings are relative to that policy.

### 2. Execute one structured audit

Use `--json` and preserve the complete stdout response in a task-owned report
file before reading individual findings. Keep stderr separate so asset
preparation progress cannot corrupt JSON.

The report path must not be inside `upstream/` or the managed asset cache. A
user-provided path is preferred; otherwise use a task-specific temporary
directory and report the path while it remains available.

### 3. Validate the response envelope

Require:

- `ok: true`;
- `command: "catalog audit-animations"`;
- a `data.summary` object;
- all four finding arrays; and
- an empty top-level `errors` array.

Finding arrays may be non-empty while the command exits successfully. Exit code
zero therefore means the audit ran, not that the audited assets are complete.

### 4. Read a bounded view

Run the bundled report helper against the preserved JSON rather than printing
the whole report into agent context. The helper validates the expected response
shape and provides bounded, deterministic views for:

- the summary;
- distinct incomplete items grouped by type;
- one finding category;
- one exact item; and
- the first bounded page of drawing tasks.

The helper never runs the audit, changes counts, infers new paths, or edits the
report. It only validates, filters, sorts, and projects existing CLI fields.
Node.js is already required by the CLI, so the helper adds no dependency.

Pagination is local to the preserved report and must expose a returned count,
total, offset, and next offset. The default page must be small enough for agent
context, with an explicit upper bound. Repeated reads of the same report and
filters must return the same order.

### 5. Interpret findings without collapsing semantics

Treat each category independently:

- `unsupported`: drawing work is required for an animation the item neither
  natively nor compatibly supplies. Read every nested requirement. An inferred
  expected path is guidance, while `manual-review` requires human coordination
  before choosing a file layout.
- `missingFiles`: the returned path is an exact active-source relative path
  expected by a declared or compatible animation. Consumers identify every
  item, layer, body type, and variant that depends on the physical file.
- `blankFrames`: the file exists, but the listed referenced cells are fully
  transparent. Preserve animation, source animation, direction, source row,
  source column, and consumer context in the task.
- `errors`: inspection did not prove asset incompleteness. Report the stable
  error kind and resolve or escalate it instead of assigning speculative
  drawing work.

Runtime recolors in a consumer are dependent outputs, not additional PNG files
to draw. Shared physical paths produce one drawing task with multiple
consumers, not duplicate files.

### 6. Produce the worklist

Every worklist entry must retain enough CLI evidence to be independently
actionable:

```text
category
type name and item ID
target and source animation
exact or inferred path, when present
path confidence and manual-review reason, when applicable
layer
body types
physical variant
dependent recolors
direction and source-cell coordinates for blank frames
all consumers of a shared physical file
```

The agent may summarize counts, group entries, or prepare text suitable for an
issue tracker, but it must not rewrite an inferred path as exact or turn an
inspection error into a missing-file claim.

### 7. Verify after external asset work

This skill does not perform the asset modification. After the user or another
authorized workflow changes the active asset source, rerun the exact original
target and scope. Compare category counts and the specific item/path findings.

A scoped task is complete only when its intended findings disappear and the
new run has no relevant inspection error. The whole catalog does not need to
reach zero unless that was the explicitly stated policy.

## Bounded Report Helper

`scripts/read-audit-report.mjs` is a deterministic reader for a previously
captured JSON report. Its implementation uses only Node built-ins.

Its command contract is:

```text
node read-audit-report.mjs <report.json> summary
node read-audit-report.mjs <report.json> types
node read-audit-report.mjs <report.json> findings \
  --category <unsupported|missingFiles|blankFrames|errors> \
  [--item <item-id>] [--limit <count>] [--offset <count>]
node read-audit-report.mjs <report.json> worklist \
  [--item <item-id>] [--limit <count>] [--offset <count>]
```

`summary` returns targets, scope, and the CLI summary unchanged. `types`
returns distinct incomplete item counts grouped by type. `findings` returns one
source category without flattening its nested requirements or consumers.
`worklist` projects all four categories in the fixed order `unsupported`,
`missingFiles`, `blankFrames`, then `errors`, while preserving source-array
order within each category.

Paged views default to 20 entries and accept 1 through 100. Their JSON envelope
contains `ok`, `view`, report targets, report scope, report summary, a `page`
object with `limit`, `offset`, `returned`, `total`, `hasMore`, and
`nextOffset`, the projected `data`, and an `errors` array. Invalid helper input
uses the same envelope with `ok: false`, no partial data, and at least one
stable helper error record.

The helper must:

- reject missing, invalid, failed, or wrong-command reports;
- preserve source data without mutation;
- provide machine-readable JSON output;
- default to a bounded result;
- support category, item, limit, and offset filters;
- retain all consumers for any returned physical finding;
- use the CLI report's deterministic order rather than creating a new semantic
  order; and
- return stable error codes and a nonzero status for invalid helper input.

The helper is not a compatibility layer for older CLI schemas. The preflight
range and contract tests own schema compatibility. If the CLI contract changes,
the plugin version, references, helper, and tests change together.

## Errors And Safety

### Missing audit target

Stop before runtime asset preparation and ask which standard animation should
define completeness.

### Unknown animation, type, or body type

Return the CLI's structured error and bounded suggestions. Do not silently
substitute another value.

### Runtime asset preparation failure

Surface the CLI error. Do not bypass checksum verification, combine an
incomplete current-directory asset tree with the managed cache, or initialize
`upstream/`.

### Large report

Preserve the full report and use the bounded helper. Do not repeat the expensive
audit merely because terminal output was truncated.

### Findings present with exit zero

Explain that this is expected audit behavior. Use `summary.incompleteItems` and
the finding arrays to determine work, not the process status.

### Attribution

The audit is read-only and produces no rendered artifact, so it does not create
a new credits bundle. Item IDs remain in findings for exact catalog and credit
inspection. Any later source-asset contribution remains subject to repository
credit and GPL requirements, but those mutation rules are outside this skill.

## Plugin Presentation

Update `.codex-plugin/plugin.json` so the plugin is discoverable for both
character and animation-audit work. Keep `LPC Toolkit` as the display name and
expand the description, long description, keywords, and default prompts to
include identifying incomplete animation assets and producing drawing
worklists.

Update the root README's Codex Plugin section from plugin `0.2.0` to `0.2.1`
and mention the new audit workflow. The public CLI installation range remains
unchanged.

Add `agents/openai.yaml` for the audit skill with implicit invocation enabled
and UI text focused on auditing LPC animation assets. Update character skill UI
metadata only if needed to make the composition boundary unambiguous.

Because this is an additive plugin capability with no CLI contract change, the
implementation should prepare the next plugin patch version, `0.2.1`, while
retaining CLI compatibility `>=0.2.0 <0.3.0`.

## Testing

### Skill structure and metadata

- validate both skill folders and frontmatter;
- verify audit trigger text includes missing files, blank frames, and drawing
  worklists;
- verify character trigger text excludes source-asset audits;
- verify each `agents/openai.yaml` matches its skill boundary; and
- verify plugin presentation includes both workflows.

### Compatibility

- retain the existing semantic-version checker coverage;
- run the audit checker from an unrelated working directory;
- accept CLI 0.2.x stable versions and reject unsupported versions; and
- assert both skills declare the same supported CLI range.

### CLI contract

- verify every audit contract command is accepted by the packaged CLI;
- verify `audit-animations` requires at least one target;
- verify repeated animation options and optional scope filters;
- verify successful findings remain a successful CLI response; and
- verify the report envelope and four finding arrays.

### Report helper

- valid summary projection;
- bounded default output and local pagination;
- category and exact-item filtering;
- retention of all nested requirements and consumers;
- missing-file and blank-frame coordinate preservation;
- runtime recolors retained as dependents;
- manual-review reason preservation;
- deterministic repeated output;
- malformed JSON, failed response, wrong command, and invalid filters; and
- a large fixture that proves output remains bounded without truncating the
  preserved source report.

### Workflow references

Tests or static assertions should confirm that the documentation requires:

- explicit target animations;
- narrow optional scope;
- complete JSON preservation;
- category-specific interpretation;
- no drawing task for inspection-only errors;
- no duplicate drawing task for runtime recolors;
- no `upstream/` modification; and
- same-scope re-audit with finding-based completion criteria.

## Success Criteria

- A request such as “find which weapon assets are missing `run` support”
  triggers `lpc-animation-asset-audit`, not character authoring.
- The agent performs compatibility preflight and one scoped JSON audit.
- The full audit response remains available even when it is too large for
  direct context.
- The agent can produce a bounded worklist naming exact items, animations,
  paths, layers, variants, body types, and blank source cells.
- Unsupported, missing, blank, and inspection-error findings remain
  semantically distinct.
- Re-audit uses the same scope and does not misinterpret exit zero as complete.
- Normal character creation and rendering continue to use the unchanged
  character command contract.
- No dependency, CLI behavior, asset, selection, render, attribution, or
  `upstream/` change is introduced.

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

The implementation plan must reassess this matrix before changes and again
before handoff as required by `AGENTS.md`.
