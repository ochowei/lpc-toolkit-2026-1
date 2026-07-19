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
