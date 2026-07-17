# Final Fix: CLI and Plugin 0.2.0 Alignment

## Approved Scope

- CLI version: `0.2.0`
- Codex plugin version: `0.2.0`
- Supported CLI range: `>=0.2.0 <0.3.0`
- Add the offline animation viewer description to top-level `render --help`.
- Local preparation only: no branch, tag, push, pull request, merge, npm
  publication, plugin reinstall, or marketplace mutation.
- No dependency, `any`, `upstream/`, viewer implementation, or core changes.

## Release Audit

Final command:

```sh
rtk node /Users/william/.agents/skills/releasing-lpc-toolkit/scripts/audit-release.mjs \
  --repo /Users/william/.codex/worktrees/3a1a/lpc-toolkit-2026-1 \
  --version 0.2.0
```

Result at `b00cda4699f8c07e02f100bf711adff5c1713ccf`:

- CLI package: `0.2.0`
- plugin manifest: `0.2.0`
- checker and documented range: `>=0.2.0 <0.3.0`
- latest stable tag: `v0.1.4`
- `v0.2.0` exists: no
- next computed RC: `v0.2.0-rc.1`
- `upstream/` changed: no
- `asset-release.json` changed: no
- expected blockers: `detached_head`, `worktree_dirty`

The dirty entries belong to concurrent viewer work and were neither staged nor
committed here. Detached HEAD is the expected shared-worktree environment. No
release transition was attempted.

## RED / GREEN Evidence

RED was observed before production changes:

- CLI focused tests: 3 expected failures for package `0.1.4`, stale plugin
  installation docs, and missing top-level `render` viewer help.
- plugin checker tests: 5 expected failures while `0.2.0` was outside
  `>=0.1.4 <0.2.0` and compatibility documentation remained stale.
- plugin structure tests: 4 expected failures while the verifier required
  manifest `0.1.0`.
- repository verification later exposed one additional RED assertion in the
  root README documentation contract for `>=0.1.4 <0.2.0`.

GREEN evidence:

- focused CLI help/version/plugin contract tests: 109 passed;
- plugin checker: 11 passed;
- plugin structure: 6 passed;
- root README documentation contract: 21 passed;
- full CLI suite: 417 passed, 1 skipped;
- full repository `rtk pnpm verify`: PASS.

The existing checker test is also the concise skill application/retrieval test:
it resolves the installed skill by absolute path and executes the checker from
an unrelated working directory. The CLI plugin-contract test parses every
documented command against the generated command specification.

## Version and Contract Surfaces

- `packages/cli/package.json`: CLI `0.2.0`.
- `packages/cli/test/package-metadata.test.ts`: current package version and
  plugin installation range assertions.
- built `lpc-toolkit --version`: `0.2.0`; the existing version-output test reads
  the package version dynamically and passed.
- `plugins/lpc-toolkit/.codex-plugin/plugin.json`: plugin `0.2.0`.
- `scripts/verify-codex-plugin.mjs` and its fixture tests: manifest `0.2.0`.
- plugin checker constants and tests: `>=0.2.0 <0.3.0`, accepts `0.2.0`, rejects
  `0.1.4` and `0.3.0`.
- plugin compatibility reference, root README, CLI README, and their executable
  documentation tests: plugin `0.2.0` and CLI `>=0.2.0 <0.3.0`.
- top-level, preset, and character full-render help tests all require the
  offline viewer description.
- `docs/RELEASING.md`: describes the prepared `0.2.0` viewer capability without
  claiming publication and requires sheet/viewer/metadata/TXT/CSV verification
  beside one another and inside ZIP output.
- `pnpm-lock.yaml`: unchanged; pnpm lockfile v9 does not store workspace package
  versions, and no dependency changed.
- `.agents/plugins/marketplace.json`: unchanged; its local source entry has no
  plugin version field.

Plugin-creator cachebuster reassessment: a cachebuster is for reinstalling an
existing local development plugin. This task prepares the repository's real
`0.2.0` release metadata and explicitly forbids installed-cache or user
marketplace edits, so no `+codex.*` suffix or reinstall was appropriate.

## CLI Documentation Impact

```text
help: update
cli-readme: update
root-readme: update
landing: N/A — the viewer workflow was already documented and has no version contract
architecture: N/A — package ownership, attribution, and output boundaries did not change
engineering: N/A — verification commands and CI mapping did not change
releasing: update
plugin: update
```

## Verification

- `rtk pnpm --filter @lpc-toolkit/cli test -- command-spec.test.ts package-metadata.test.ts main-assets.test.ts plugin-contract.test.ts` — PASS, 109 tests.
- `rtk node --test plugins/lpc-toolkit/test/check-cli.test.mjs` — PASS, 11 tests.
- `rtk node --test scripts/verify-codex-plugin.test.mjs` — PASS, 6 tests.
- `rtk pnpm verify:plugin` — PASS, 17 tests plus repository structure validation.
- plugin-creator `validate_plugin.py plugins/lpc-toolkit` — PASS.
- skill-creator `quick_validate.py plugins/lpc-toolkit/skills/character-authoring` — PASS.
- `rtk pnpm --filter @lpc-toolkit/cli run typecheck` — PASS.
- `rtk pnpm --filter @lpc-toolkit/cli test` — PASS, 417 tests and 1 skip.
- `rtk pnpm --filter @lpc-toolkit/cli build` — PASS.
- `rtk node packages/cli/dist/index.js --version` — PASS, `0.2.0`.
- `rtk node packages/cli/dist/index.js render --help` — PASS, offline viewer described.
- `rtk pnpm --filter @lpc-toolkit/cli test:package` — PASS; produced and
  installed `lpc-toolkit-cli-0.2.0.tgz` and completed the packed smoke workflow.
- `rtk pnpm --filter @lpc-toolkit/web test -- readme-architecture-docs.test.ts`
  — PASS, 21 tests.
- `rtk pnpm verify` — PASS.

The Python validators used an ephemeral `/tmp` uv environment for PyYAML after
the system interpreter lacked it. The package smoke and socket-using tests were
rerun with approved sandbox escalation after their first attempts failed only
on DNS or local socket restrictions. No repository dependency was added.

## Commits and Concerns

- `b00cda4699f8c07e02f100bf711adff5c1713ccf` —
  `chore(release): align CLI and plugin 0.2.0`

Remaining release blockers are intentional: the worktree is detached and has
concurrent uncommitted viewer files. Stable `v0.2.0` must remain absent until a
separately authorized RC and stable release workflow occurs.
