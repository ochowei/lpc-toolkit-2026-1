# Animation Asset Audit Workflow

## Define The Scope

Require at least one registered standard animation. Use `catalog types --json`
or a bounded `catalog items --type <type> --limit 20 --json` only when scope
discovery is needed. Prefer `--type` and `--body-type` when they match the
request. Never assume every item must support every registered animation.

## Preserve One Structured Audit

Run `catalog audit-animations` once with `--json`. Prefer a user-supplied report
path. Otherwise create a task-specific temporary directory and report that path
while it remains available. Preserve complete stdout there, outside `upstream/`
and the managed asset cache, and keep stderr separate. Require `ok: true`, the
expected command name, all four finding arrays, and no top-level errors.
Exit code zero means the audit ran, not that the scope is complete.

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

The worklist is a read-only animation remediation handoff. If the user confirms
one finding for source revision, switch to `$lpc-asset-authoring` in
`extend-item` mode and preserve the complete report, its digest, the selected
finding, and the exact approved scope. The authoring Skill creates the strict
plan and session, materializes the sprite drawing contract, imports only a
contract-compatible candidate, validates it, and produces the attributed
review-ready preview. This audit workflow never initializes a workspace or
creates source files itself.

## Conditional closure re-entry

Re-enter this workflow only after `$lpc-asset-authoring` reports a successful
exact installation and a current installation receipt. Receive the preserved
original target animation, optional type, optional body type, complete report
identity and digest, selected finding and category, and exact installation
receipt identity and digest.

Rerun `catalog audit-animations --json` once with the exact original animation
and optional filters. Preserve the new complete report, then inspect
`unsupported`, `missingFiles`, `blankFrames`, and `errors`. Exit code zero is
not closure evidence: report the selected finding as absent, remaining, or
inspection-error evidence, and identify any new regression inside the same
scope.

Do not expand scope, start another mutation, or hand off a new finding
automatically. Close only when the selected finding is absent or has an explicit
residual disposition, no relevant inspection error blocks evaluation, and no
new scoped regression appeared.
