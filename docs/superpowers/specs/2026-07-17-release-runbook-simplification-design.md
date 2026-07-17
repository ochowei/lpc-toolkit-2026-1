# Release Runbook Simplification Design

## Goal

Turn `docs/RELEASING.md` into a thin, repository-owned maintainer runbook
without changing the CLI release process, GitHub Actions workflows, tag
contracts, publication authorization, or post-publication verification.

## Chosen Approach

Keep executable release mechanics in the existing workflows and verifier
scripts, keep human-facing gates and recovery rules in `docs/RELEASING.md`, and
keep version recommendations, plugin compatibility analysis, and just-in-time
coordination in the installed `releasing-lpc-toolkit` skill.

The runbook will remain usable without the skill. It will link release phases
to the repository-owned automation instead of repeating every CI step.

## Runbook Structure

The simplified document will contain five focused sections:

1. **Scope and authority** — identify maintainers, external mutations, and the
   requirement for explicit authorization.
2. **Pre-release verification** — retain the local build, help, package test,
   tarball, and real asset-dependent smoke-test requirements.
3. **Release candidate** — retain version/tag agreement, the repository tag
   verifier, the tagged macOS and Windows gate, and the advisory status of
   manually dispatched runs.
4. **Stable publication** — describe the stable tag and npm OIDC workflow. The
   completed `v0.1.0` manual bootstrap becomes a short historical note because
   it is not part of the current recurring procedure.
5. **Public verification and failure handling** — retain registry installation,
   help/version, asset cache, metadata, TXT/CSV credits, workspace independence,
   and version equality checks; state that pushed tags and published versions
   must not be deleted, retargeted, or overwritten.

## Contract Boundaries

- Do not change `.github/workflows/cli-release-candidate.yml`,
  `.github/workflows/publish.yml`, or CLI tag-verifier scripts.
- Do not change tag patterns, npm OIDC publication, platform coverage, package
  contents, attribution output, or approval requirements.
- Preserve the phrases asserted by `packages/cli/test/release-workflows.test.ts`:
  `v<version>-rc.<number>`, `macos-latest`, `windows-latest`, `advisory`, and
  `never publishes npm`.
- Keep `docs/RELEASING.md` as the repository-owned `releasing` documentation
  surface required by the release audit and CLI documentation-impact policy.

## Failure Handling

Documentation inconsistencies are treated as contract failures. If the
simplified instructions disagree with a workflow, verifier, package version,
or current repository policy, update the document rather than weakening an
executable gate. A failed release after an external tag or npm mutation must
stop with its immutable state recorded before recovery is proposed.

## Verification

Run the focused release workflow test and plugin/release contract audit, then
run the repository verification gate:

```sh
rtk pnpm --filter @lpc-toolkit/cli test -- release-workflows.test.ts
rtk node /Users/william/.agents/skills/releasing-lpc-toolkit/scripts/audit-release.mjs --repo .
rtk pnpm verify
```

The release audit may report `detached_head` in the managed Codex worktree; that
blocks an actual release transition but does not invalidate a documentation-only
change when all required release contract files remain present.

## Documentation Impact

```text
help: N/A — no CLI help or command behavior changes
cli-readme: N/A — no public CLI usage changes
root-readme: N/A — no public quick-start changes
landing: N/A — no landing workflow changes
architecture: N/A — no package ownership or output-contract changes
engineering: N/A — no command or CI mapping changes
releasing: update — simplify the maintainer runbook without changing its contract
plugin: N/A — no installed skill or plugin contract changes
```
