# Audit Report Format

## Choose the artifact

- Default to Markdown (`.md`).
- Produce standalone HTML (`.html`) when the user requests HTML.
- Produce both only when the user explicitly requests both.
- Use a user-supplied output path. Otherwise write to
  `.audit-output/product-audits/YYYY-MM-DD-<scope-slug>.<ext>` below the
  repository root.
- Never overwrite an existing report silently. Add a time or numeric suffix.
- Report output is the only file write allowed during an audit.

HTML must be one portable UTF-8 file with embedded CSS, no scripts, no remote
assets, and no network dependency. Use semantic headings, tables that wrap on
small screens, visible PASS/PARTIAL/FAIL labels that do not rely on color, and
print-friendly styling.

## Write for two reading depths

### Main report

Use this order:

1. **Bottom line** — two to four sentences answering whether the capability or
   repository delivers the intended journey.
2. **Why this matters** — the concrete effect on a user or Agent.
3. **Key findings** — at most five, ordered by user impact. For each, show what
   the user sees, what actually happens, why it matters, smallest evidence, and
   next proof.
4. **Scorecard** — separate readability, usability, and functional completeness;
   never combine them.
5. **Journey trace** — compact visible-entry-to-executor-to-result maps for the
   affected paths. For every cross-surface launcher, include `origin entry`,
   `exact emitted artifact`, `destination`, `executor binding`, and `verdict`;
   state what context travels and what origin context disappears.
6. **Next actions** — smallest evidence-producing actions, not a speculative
   implementation plan.

### Evidence appendix

Put revision scope, full `PD-*` and requirement accounting, raw numerators and
denominators, confidence, guardrail/evolution and delivery rows, exact paths and
line numbers, commands, skipped checks, limitations, and the artifact-capture
method here. When a launcher crosses surfaces, record the exact clipboard,
request, URL, file, or structured fields inspected and the destination context.

## Remove noise

- Use the user's language and ordinary product terms. Explain `launcher` as
  “只負責複製或送出請求的入口” and `executor` as “真正執行工作的 Skill／工具”
  when reporting in Traditional Chinese.
- Lead with the mismatch, not the scoring method.
- Keep one root cause as one finding and attach all affected objective IDs in
  the appendix.
- Cite one strongest implementation path and one strongest test or command when
  enough; add more only when they prove a different boundary.
- Do not aggregate origin explanation and destination binding into one PASS.
  Report each cross-surface arrow separately and apply the destination
  paste-isolation verdict before rollup.
- Do not narrate discovery commands, repeat tables in prose, or list every
  passing objective in the main report.
- Distinguish facts, inferences, and unknowns explicitly.

## Chat handoff

Do not paste the report into chat. Return only:

- the bottom-line verdict;
- at most three key findings;
- the smallest next action;
- verification status; and
- a clickable absolute link to each report artifact.
