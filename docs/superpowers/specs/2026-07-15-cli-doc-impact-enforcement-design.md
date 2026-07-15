# CLI Documentation Impact Enforcement Design

**Date:** 2026-07-15

**Status:** Approved

## Purpose

CLI behavior changes currently rely on a checklist in `docs/ENGINEERING.md` to
keep generated help, READMEs, the web landing guide, architecture, release
documentation, and plugin references synchronized. That checklist is useful but
is not part of the Agent hard rules and is not enforced against a pull request's
actual diff. A plan can therefore update some documentation surfaces while
silently omitting another affected surface.

Add two complementary enforcement layers:

1. require Agents to evaluate every owned CLI documentation surface in plans
   and handoffs; and
2. require pull requests with CLI-sensitive changes to provide a
   machine-readable documentation-impact declaration that CI validates against
   the diff.

The goal is not to require documentation churn for every internal CLI change.
The system must retain an auditable `not-applicable` path with a concrete
reason.

## Design Principles

- Keep documentation ownership explicit instead of attempting semantic source
  analysis.
- Treat an explicit, reviewable decision as the unit of enforcement.
- Use the same trigger and surface vocabulary in Agent rules, contributor
  guidance, the PR template, tests, and CI.
- Reject unverifiable declarations, but permit well-explained internal changes
  that do not alter a documentation contract.
- Do not add dependencies or grant CI additional repository permissions.
- Do not generate README or landing-page prose from CLI source in this change.

## Enforcement Architecture

### Agent layer

Add a CLI documentation impact hard rule to `AGENTS.md`. For any CLI-sensitive
change, the implementation plan must evaluate these surfaces:

- `help`
- `cli-readme`
- `root-readme`
- `landing`
- `architecture`
- `engineering`
- `releasing`
- `plugin`

Every entry must be either `update` or `N/A — <reason>`. The Agent must repeat
the evaluation before handoff because implementation and review fixes can
change the final impact after the original plan was written. Unplanned CLI
fixes that do not use a checked-in plan must still record the same matrix in
their handoff evidence.

The Agent layer is responsible for semantic completeness: CI can prove that a
declared surface changed, but it cannot prove that every relevant surface was
declared.

### Pull request and CI layer

Add `.github/pull_request_template.md` with these machine-readable fields:

```text
CLI docs impact: <!-- updated | not-applicable -->
CLI docs surfaces: <!-- comma-separated tokens | none -->
CLI docs reason: <!-- required for not-applicable -->
```

GitHub inserts the template into a new pull request description. The CI checker
reads the submitted pull request body from `GITHUB_EVENT_PATH`; it does not read
the template file as the declaration.

For a CLI-sensitive diff:

- `updated` requires one or more known surface tokens, and every declared
  surface must have a matching changed path.
- `not-applicable` requires `CLI docs surfaces: none` and a specific reason of
  at least 20 trimmed characters.
- a missing field, unchanged template placeholder, duplicate field, unknown
  status, unknown token, or unverifiable surface fails the check.

For a diff with no CLI-sensitive files, the checker exits successfully without
requiring or validating the template fields. This prevents the unedited CLI
section in the general PR template from breaking unrelated pull requests.

## Trigger Paths

The live PR gate activates when at least one changed file matches:

```text
packages/cli/src/**
packages/cli/package.json
packages/cli/scripts/**
plugins/lpc-toolkit/**
asset-release.json
.github/workflows/cli-release-candidate.yml
.github/workflows/publish.yml
```

The following changes do not activate the gate by themselves:

```text
packages/cli/test/**
docs/superpowers/plans/**
docs/superpowers/specs/**
fixture-only changes
ordinary documentation changes
```

If one pull request contains both an excluded path and a trigger path, the
trigger path wins and a declaration is required.

## Surface Mapping

The checker uses this closed mapping:

| Token | Matching changed path |
| --- | --- |
| `help` | `packages/cli/src/command-spec.ts` |
| `cli-readme` | `packages/cli/README.md` |
| `root-readme` | `README.md` |
| `landing` | `packages/web/src/components/landing-page.tsx` |
| `architecture` | `docs/ARCHITECTURE.md` |
| `engineering` | `docs/ENGINEERING.md` |
| `releasing` | `docs/RELEASING.md` |
| `plugin` | `plugins/lpc-toolkit/skills/**` |

Tests do not count as documentation surfaces. Existing verification gates must
still run the relevant help, landing, README, release, and plugin contract
tests. The Agent impact matrix must name the matching verification when a
surface is updated.

## Declaration Grammar

The checker parses exactly one line for each field:

```text
CLI docs impact: updated
CLI docs surfaces: help, cli-readme, landing
CLI docs reason:
```

or:

```text
CLI docs impact: not-applicable
CLI docs surfaces: none
CLI docs reason: Internal cache refactor with no user-visible CLI contract change.
```

Rules:

- field names and status values use the exact lowercase spelling shown above;
- surrounding value whitespace is ignored;
- surface tokens are comma-separated, trimmed, deduplicated, and validated
  against the closed mapping;
- `none` cannot be combined with another token;
- `updated` cannot use `none` and must declare at least one surface;
- `not-applicable` must use only `none` and a reason of at least 20 characters;
- duplicate declaration fields fail rather than allowing the checker to choose
  one silently.

## Checker Components and Data Flow

Create `scripts/check-cli-doc-impact.mjs` with small exported pure helpers for:

1. classifying changed paths;
2. parsing the three PR fields;
3. validating status, surfaces, reason, and surface-to-diff evidence; and
4. formatting actionable diagnostics.

The executable entry point supports two modes:

- **CI mode:** with no explicit inputs, read `GITHUB_EVENT_PATH`, extract
  `pull_request.body`, `pull_request.base.sha`, and `pull_request.head.sha`,
  then obtain changed files with `git diff --name-only <base>...<head>`.
- **Reproduction mode:** accept explicit `--base`, `--head`, and `--body-file`
  arguments so a maintainer can reproduce a CI failure locally using the same
  validation core.

The script exits `0` for a valid declaration or an unrelated diff, `1` for a
policy failure, and `2` for malformed invocation or unavailable event data.

## CI Integration

Add root scripts:

```json
{
  "check:cli-docs-impact": "node scripts/check-cli-doc-impact.mjs",
  "verify:cli-docs-policy": "node --test scripts/check-cli-doc-impact.test.mjs"
}
```

Include `verify:cli-docs-policy` in `pnpm verify`. This validates the policy
implementation locally without requiring a synthetic PR body.

Add a `CLI documentation impact` job to `.github/workflows/ci.yml`:

- run for `pull_request` activity types `opened`, `synchronize`, `reopened`, and
  `edited`;
- use `actions/checkout` with `fetch-depth: 0`;
- use Node.js 22;
- run `node scripts/check-cli-doc-impact.mjs` without installing workspace
  dependencies;
- request only `contents: read` permission and use no secrets.

The job runs for every supported pull request activity so its check name is
stable. The `edited` activity lets an author correct the declaration in the PR
body and receive a new check using the new event payload. Re-running the old
failed job is not a recovery path because a rerun retains the original event
payload. On an `edited` activity, skip the change-detection and unit jobs so the
dependent package and E2E jobs also remain skipped; changing PR prose must rerun
only the documentation-impact job. The script quickly succeeds for unrelated
diffs. Repository branch protection or the repository ruleset must require the
`CLI documentation impact` status check to make a failure merge-blocking.
Changing that external GitHub setting is an operational follow-up and is not
performed by the repository patch.

Pushes to `main` do not run the declaration gate because they have no PR body;
the normal `pnpm verify` policy tests still run. The repository's protected-PR
workflow is the enforcement boundary.

## Diagnostics

A missing declaration produces an actionable failure such as:

```text
CLI documentation impact declaration is required.

Sensitive files:
- packages/cli/src/response.ts

Add these fields to the pull request body:
CLI docs impact: updated | not-applicable
CLI docs surfaces: help, cli-readme, root-readme, landing, architecture, engineering, releasing, plugin | none
CLI docs reason: required for not-applicable
```

Other failures name the invalid field, token, or declared surface and list the
paths that would satisfy it. Diagnostics must not print the complete PR body.

## Documentation Updates

- `AGENTS.md` and its identical `CLAUDE.md` mirror: add the mandatory Agent
  matrix and pre-handoff reassessment.
- `docs/ENGINEERING.md`: retain the detailed ownership checklist, add the token
  mapping, local reproduction command, and CI behavior.
- `CONTRIBUTING.md`: explain how to complete the PR declaration and recover
  from a failed check.
- `.github/pull_request_template.md`: add the declaration fields and concise
  author instructions.

The root README, CLI README, landing page, architecture guide, and release guide
are policy targets, not automatically modified by this enforcement feature
unless their own contracts need clarification during implementation.

## Verification

Create `scripts/check-cli-doc-impact.test.mjs` covering:

1. unrelated diff without a declaration passes;
2. sensitive diff without a declaration fails;
3. `updated` with one matching surface passes;
4. `updated` with several matching surfaces passes;
5. declared surface without a matching diff fails;
6. unknown token fails;
7. `none` combined with another token fails;
8. valid `not-applicable` with a concrete reason passes;
9. missing or shorter-than-20-character reason fails;
10. `not-applicable` with non-`none` surfaces fails;
11. duplicate fields fail;
12. a test-only or plan-only diff does not activate the gate;
13. a mixed excluded/trigger diff requires a declaration;
14. the workflow listens for PR-body edits and skips the ordinary CI entry jobs
    for that activity.

Extend repository documentation contract tests to ensure `AGENTS.md`,
`docs/ENGINEERING.md`, `CONTRIBUTING.md`, and the PR template retain the shared
status values and surface vocabulary.

Run at minimum:

```sh
rtk node --test scripts/check-cli-doc-impact.test.mjs
rtk pnpm --filter @lpc-toolkit/web test -- readme-architecture-docs.test.ts
rtk pnpm verify
rtk git diff --check
```

Perform one local reproduction-mode smoke for both a passing `updated`
declaration and a failing missing declaration.

## Non-Goals

- Automatically generating prose from CLI source.
- Proving that the declared surface list is semantically complete.
- Requiring documentation edits for test-only or implementation-internal
  changes.
- Replacing human or Agent review of attribution and release documentation.
- Changing release workflows, package versions, dependencies, or publication
  behavior.
- Mutating GitHub branch-protection settings from repository code.

## Success Criteria

- Every CLI-sensitive pull request contains an auditable `updated` or
  `not-applicable` decision.
- An `updated` declaration cannot claim a surface that is absent from the diff.
- A `not-applicable` declaration cannot omit its explanation.
- Agents evaluate all eight surfaces before implementation and again before
  handoff.
- Unrelated pull requests and test-only CLI changes do not require boilerplate
  declarations.
- Correcting a PR-body declaration creates a fresh documentation-impact check
  without rerunning unit, package, or E2E jobs.
- The same policy vocabulary is locked by tests across Agent rules,
  contributor guidance, the PR template, and CI.
