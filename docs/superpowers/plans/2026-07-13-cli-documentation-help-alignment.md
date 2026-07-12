# CLI Documentation and Help Alignment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Align generated CLI character help, the repository README, the CLI package README, and the architecture guide with the persistent character-authoring workflow delivered by PR #115.

**Architecture:** Keep runtime locator validation unchanged and correct only the command metadata that renders help. Treat the repository README as the short onboarding entry point, the CLI package README as the workflow reference, and `docs/ARCHITECTURE.md` as the ownership/boundary reference. Protect both help and documentation with focused existing Vitest contract suites.

**Tech Stack:** TypeScript strict mode, Vitest, Markdown, pnpm workspaces, RTK command proxy.

## Global Constraints

- Do not change command behavior, persisted selection schemas, output formats, or default paths.
- Do not add dependencies or use `any`.
- Do not modify the read-only `upstream/` submodule.
- Preserve mandatory attribution and the `packages/core/` environment boundary.
- Use `pnpm` and prefix every terminal command with `rtk`.
- Keep the existing `codex/cli-character-authoring` branch; the user previously declined a new worktree.
- Never stage the unrelated `docs/README-ARCHITECTURE-AUDIT.tmp.md` file.
- After every completed checkbox, update this plan checkbox and add a concise note with the current verification state; after each task commit, record its full commit hash.

---

## File Structure

- Modify `packages/cli/src/command-spec.ts`: source of generated CLI usage/help strings.
- Modify `packages/cli/test/command-spec.test.ts`: regression coverage for mutually exclusive locator notation across all locator-based character commands.
- Modify `README.md`: repository-level character-authoring entry point and link to the detailed package guide.
- Modify `packages/cli/README.md`: complete workflow-oriented character command index and locator/output semantics.
- Modify `docs/ARCHITECTURE.md`: CLI character persistence, application decision, and transactional output ownership.
- Modify `packages/web/test/readme-architecture-docs.test.ts`: documentation contract for the three Markdown surfaces.
- Modify `docs/superpowers/plans/2026-07-13-cli-documentation-help-alignment.md`: checkbox, implementation, commit, and verification record required by repository policy.

---

### Task 1: Correct Character Locator Usage in Generated Help

**Files:**
- Modify: `packages/cli/test/command-spec.test.ts:7-27`
- Modify: `packages/cli/src/command-spec.ts:223-298`
- Modify: `docs/superpowers/plans/2026-07-13-cli-documentation-help-alignment.md`

**Interfaces:**
- Consumes: `helpForCommand(command: readonly string[]): string` and the existing runtime rule in `characterLocator` that accepts exactly one of a positional name or `--selection <file>`.
- Produces: generated help usage lines containing `(<name> | --selection <file>)` for `show`, `search`, `set`, `remove`, `validate`, `preview`, and `render`.

- [x] **Step 1: Add a failing locator-usage help test**

  - Implementation note: Added the parameterized alternative-locator help regression test; RED has not yet been run.

Add this test inside `describe('helpForCommand', ...)` in `packages/cli/test/command-spec.test.ts`:

```ts
  it.each([
    ['show', ''],
    ['search', ' --type <type> [options]'],
    ['set', ' --type <type> --item <item-id-or-type/name> [options]'],
    ['remove', ' --type <type> [options]'],
    ['validate', ''],
    ['preview', ' [options]'],
    ['render', ' --out <directory> [options]'],
  ])('documents the alternative locator for character %s', (command, suffix) => {
    expect(helpForCommand(['character', command])).toContain(
      `lpc-toolkit character ${command} (<name> | --selection <file>)${suffix}`,
    );
  });
```

Update this plan checkbox immediately after editing and note that RED has not yet been run.

- [x] **Step 2: Run the focused test and verify RED**

  - Verification: RED confirmed with 7 expected locator-usage assertion failures and 9 passing tests; generated help still required `<name>` and listed `--selection` separately.

Run:

```sh
rtk pnpm --filter @lpc-toolkit/cli test -- command-spec.test.ts
```

Expected: FAIL in the new parameterized test because current usage strings require `<name>` and render `--selection` only as a separate option. Record the failing assertion summary under Task 1 and check this step.

- [x] **Step 3: Make the minimal usage-string changes**

  - Implementation note: Changed only the seven locator-based generated-help usage strings; runtime locator parsing and validation are unchanged.

In `packages/cli/src/command-spec.ts`, change only the seven locator-based `usage` values to these exact strings:

```ts
usage: 'lpc-toolkit character show (<name> | --selection <file>)',
usage: 'lpc-toolkit character search (<name> | --selection <file>) --type <type> [options]',
usage: 'lpc-toolkit character set (<name> | --selection <file>) --type <type> --item <item-id-or-type/name> [options]',
usage: 'lpc-toolkit character remove (<name> | --selection <file>) --type <type> [options]',
usage: 'lpc-toolkit character validate (<name> | --selection <file>)',
usage: 'lpc-toolkit character preview (<name> | --selection <file>) [options]',
usage: 'lpc-toolkit character render (<name> | --selection <file>) --out <directory> [options]',
```

Do not change `character create`, `character list`, option validation, locator parsing, or examples. Update this plan checkbox and record that only help metadata changed.

- [x] **Step 4: Verify GREEN and inspect actual generated help**

  - Verification: `command-spec.test.ts` PASS (1 file, 16 tests). The sandboxed group-help inspection hit the expected `tsx` IPC `EPERM`; the approved rerun succeeded for both group and render help, showing `(<name> | --selection <file>)` for all seven locator-based commands and the exact render usage.

Run:

```sh
rtk pnpm --filter @lpc-toolkit/cli test -- command-spec.test.ts
rtk pnpm --filter @lpc-toolkit/cli exec tsx src/index.ts character --help
rtk pnpm --filter @lpc-toolkit/cli exec tsx src/index.ts character render --help
```

Expected: all command-spec tests PASS; character group and render help show the alternative locator notation. If sandboxed `tsx` fails with an IPC `EPERM`, rerun the two `tsx` commands with the approved permission path and record both the environmental failure and successful rerun. Update this plan checkbox with exact test counts.

- [x] **Step 5: Commit Task 1 and record its hash**

  - Commit: `5917f45aa30036d34fa831624b410c3ad5c44350`
  - Implementation note: Committed only the generated-help metadata correction and its focused regression test; plan-record changes remain unstaged for Task 3.
  - Verification: Focused command-spec suite PASS (1 file, 16 tests); actual character group and render help inspected successfully after the documented sandbox IPC rerun.

Run:

```sh
rtk git add packages/cli/src/command-spec.ts packages/cli/test/command-spec.test.ts
rtk git commit -m "fix(cli): clarify character locator help"
rtk git log -1 --format=%H
```

Expected: one commit containing only help metadata and its regression test. Record the full hash, implementation note, and focused verification beneath Task 1, then check this step.

**Task 1 implementation record:**

- Implementation: Updated the seven locator-based character command usage strings to document exactly one of `<name>` or `--selection <file>`; runtime behavior and examples are unchanged. Added parameterized generated-help regression coverage.
- Commit: `5917f45aa30036d34fa831624b410c3ad5c44350`
- Verification: RED confirmed with 7 expected failures and 9 passes; GREEN confirmed with 16/16 focused tests passing. Character group and render help show the alternative locator notation; sandboxed `tsx` first hit IPC `EPERM`, then both approved reruns passed.

---

### Task 2: Align the Three Documentation Surfaces

**Files:**
- Modify: `packages/web/test/readme-architecture-docs.test.ts:8-93`
- Modify: `README.md:17-23,164-197`
- Modify: `packages/cli/README.md:21-53`
- Modify: `docs/ARCHITECTURE.md:123-136,217-226`
- Modify: `docs/superpowers/plans/2026-07-13-cli-documentation-help-alignment.md`

**Interfaces:**
- Consumes: the nine character subcommands and locator/output behavior verified by Task 1 and existing CLI tests.
- Produces: stable Markdown phrases checked by `readme-architecture-docs.test.ts`; no runtime interface changes.

- [x] **Step 1: Add failing documentation-contract assertions**

  - Implementation note: Added root README, CLI README, and architecture character-workflow contract assertions; RED has not yet been run.

In `packages/web/test/readme-architecture-docs.test.ts`, load the package README:

```ts
const cliReadme = readRepoFile('packages/cli/README.md');
```

Add this repository README contract inside `describe('README architecture contract', ...)`:

```ts
  it('links the persistent character authoring workflow', () => {
    expect(readme).toContain('Character authoring quick start');
    expect(readme).toContain('lpc-toolkit character create hero --preset farmer');
    expect(readme).toContain('[`packages/cli/README.md`](packages/cli/README.md)');
  });
```

Add this new describe block before the architecture ownership contract:

```ts
describe('CLI README character contract', () => {
  it('documents all character commands and locator/output semantics', () => {
    for (const command of [
      'create',
      'list',
      'show',
      'search',
      'set',
      'remove',
      'validate',
      'preview',
      'render',
    ]) {
      expect(cliReadme).toContain(`\`character ${command}\``);
    }
    for (const phrase of [
      '`--selection <file>`',
      '`characters/previews/<name>/`',
      'strict by default',
      '`--allow-partial`',
    ]) {
      expect(cliReadme).toContain(phrase);
    }
  });
});
```

Add this separate test inside `describe('architecture ownership contract', ...)`:

```ts
  it('documents CLI character persistence and output ownership', () => {
    for (const phrase of [
      '`character-store.ts`',
      'atomic create and replace',
      'catalog-backed character editing',
      'transactional attributed preview and render publication',
    ]) {
      expect(architecture).toContain(phrase);
    }
  });
```

Update this plan checkbox and note that RED has not yet been run.

- [x] **Step 2: Run the documentation contract and verify RED**

  - Verification: The sandboxed pretest hit `tsx` IPC `EPERM`; the approved rerun confirmed RED with 3 expected failures and 9 passing tests. Missing first phrases were `Character authoring quick start`, `` `character create` ``, and `` `character-store.ts` `` in the root README, CLI README, and architecture guide respectively.

Run:

```sh
rtk pnpm --filter @lpc-toolkit/web test -- readme-architecture-docs.test.ts
```

Expected: FAIL only in the new assertions because the root README lacks the quick start, the CLI README lacks the complete index/semantics, and the architecture guide lacks character ownership wording. Record the exact failures and check this step.

- [x] **Step 3: Update the repository README with a compact entry point**

  - Implementation note: Updated the CLI status row to mention persistent named character authoring and added the exact `Character authoring quick start` section after the public npm install example; existing package, maintainer, cache, and licensing text remains intact.

In the CLI status/command overview, mention persistent named character authoring. After the npm install example, add this exact section:

````markdown
### Character authoring quick start

Create and edit a named character without writing selection JSON by hand:

```sh
lpc-toolkit character create hero --preset farmer
lpc-toolkit character search hero --type hair --query braid
lpc-toolkit character set hero --type hair --item hair_braid --recolor lpcr.brown
lpc-toolkit character preview hero
lpc-toolkit character render hero --out ./dist/hero --animation walk --bundle zip
```

Named selections are stored under `./characters/`. Preview and render outputs
include metadata plus TXT and CSV attribution. See
[`packages/cli/README.md`](packages/cli/README.md) for every character command,
locator rules, output defaults, cache behavior, and troubleshooting.
````

Keep the existing public package, maintainer, cache, and licensing text. Update this plan checkbox and note the exact README sections changed.

- [x] **Step 4: Make the CLI package README the workflow reference**

  - Implementation note: Added the exact `Character commands and locators` workflow-reference section with the nine-command index and locator, preview-default, strict rendering, and attributed partial-output semantics; generated option reference remains unduplicated.

After the existing character quick start, add this exact content:

````markdown
### Character commands and locators

| Command | Purpose |
| --- | --- |
| `character create` | Create a named selection, optionally from a preset. |
| `character list` | List selections stored under `./characters/`. |
| `character show` | Show a stored or explicitly located selection. |
| `character search` | Find compatible catalog items for one selection type. |
| `character set` | Set or replace one selected item. |
| `character remove` | Remove one selected item. |
| `character validate` | Validate the complete selection against the catalog. |
| `character preview` | Render one attributed animation frame. |
| `character render` | Render the attributed sheet and optional exports. |

Locator-based commands accept either a character name or
`--selection <file>`, never both. A named preview defaults to
`characters/previews/<name>/`; use `--out <directory>` to override it.
Character rendering is strict by default. Use `--allow-partial` only when
attributed partial animation output is acceptable; missing paths are reported
in warnings and metadata rather than silently credited.
````

Do not duplicate the full generated option reference. Update this plan checkbox and record the package README section added.

- [x] **Step 5: Document CLI character ownership boundaries**

  - Implementation note: Added CLI architecture-shape bullets and package-rule text for character persistence, catalog-backed decisions, atomic mutation, and transactional attributed publication; no package dependency boundary changed.

Add these bullets to the `packages/cli/` architecture shape list:

```markdown
- filesystem-backed character documents with atomic create and replace in
  `character-store.ts`
- catalog-backed character editing, search, and validation decisions
- transactional attributed preview and render publication
```

Extend `## CLI Package Rules` with this paragraph:

```markdown
The character store owns named selection persistence under `./characters/` and
explicit selection-file access. Character commands validate a complete
candidate before atomic mutation, and preview/render stage every pixel,
metadata, TXT credit, and CSV credit artifact before transactional publication.
Shared selection parsing, composition, attribution, and preset rules remain in
core or presets; CLI persistence must not introduce Node filesystem APIs into
those packages.
```

Update this plan checkbox and record that no package dependency boundary changed.

- [x] **Step 6: Verify GREEN and inspect the documentation diff**

  - Verification: The sandboxed pretest again hit `tsx` IPC `EPERM`; the approved rerun passed 1 test file and 12/12 tests. Diff inspection confirmed only the approved workflow/ownership content and its contract assertions in the four implementation files; the separate required plan record remains unstaged. `rtk git diff --check` exited 0. The path-filtered RTK diff form reported `bad revision 'README.md'`, so the successful full RTK diff was inspected file by file.

Run:

```sh
rtk pnpm --filter @lpc-toolkit/web test -- readme-architecture-docs.test.ts
rtk git diff -- README.md packages/cli/README.md docs/ARCHITECTURE.md packages/web/test/readme-architecture-docs.test.ts
rtk git diff --check
```

Expected: documentation contract PASS, the diff contains only the approved workflow/ownership content and its contract assertions, and `git diff --check` exits 0. Update this plan checkbox with exact counts.

- [x] **Step 7: Commit Task 2 and record its hash**

  - Commit: `08bab6378d64d29f7f6fe6d8cdbe189431cdd5ae`
  - Implementation note: Committed exactly the root README, CLI README, architecture guide, and focused documentation contract test; plan-record changes remain unstaged for Task 3 and `docs/README-ARCHITECTURE-AUDIT.tmp.md` remains untracked and unstaged.
  - Verification: Focused documentation contract PASS (1 file, 12 tests); implementation diff inspected and `rtk git diff --check` exited 0.

Run:

```sh
rtk git add README.md packages/cli/README.md docs/ARCHITECTURE.md packages/web/test/readme-architecture-docs.test.ts
rtk git commit -m "docs(cli): align character workflow references"
rtk git log -1 --format=%H
```

Expected: one documentation commit with its contract test. Record the full hash, implementation note, and focused verification beneath Task 2, then check this step.

**Task 2 implementation record:**

- Implementation: Aligned the repository onboarding entry point, CLI workflow reference, and architecture ownership guidance with the nine-command persistent character-authoring workflow; added focused contracts for stable command, locator/output, and ownership phrases. No runtime or dependency boundary changed.
- Commit: `08bab6378d64d29f7f6fe6d8cdbe189431cdd5ae`
- Verification: RED confirmed with 3 expected failures and 9 passes after the documented sandbox IPC rerun; GREEN confirmed with 12/12 focused tests passing. The four-file implementation diff is scoped and whitespace-clean; plan records remain unstaged for Task 3.

---

### Task 3: Final Verification and Plan Record

**Files:**
- Modify: `docs/superpowers/plans/2026-07-13-cli-documentation-help-alignment.md`

**Interfaces:**
- Consumes: Task 1 generated help and Task 2 documentation contracts.
- Produces: final local verification evidence and a branch ready to push to the existing PR #115; no runtime API.

- [x] **Step 1: Run the complete scoped verification matrix**

  - Verification: The initial full CLI suite exposed one stale nested-help assertion in addition to 13 sandbox-only localhost `EPERM` failures: the approved rerun had 1 failure, 300 passes, and 1 existing skip across 30 files. The focused RED was 1 failure out of 51 tests; commit `7e376a6aa9b6ad413fb13c98407b36c7a3c90366` updated only that assertion, and the focused GREEN passed 2 files and 67/67 tests. On the fixed head, the sandboxed full suite again hit only the 13 localhost `EPERM` failures; its approved rerun passed 30/30 files with 301 tests passed and 1 existing skip out of 302. The focused Web documentation contract sandbox run hit the known `tsx` IPC `EPERM`; its approved rerun passed 1 file and 12/12 tests. CLI and Web typechecks, architecture boundaries, and `rtk git diff --check main..HEAD` all exited 0.

Run:

```sh
rtk pnpm --filter @lpc-toolkit/cli test
rtk pnpm --filter @lpc-toolkit/web test -- readme-architecture-docs.test.ts
rtk pnpm --dir packages/cli run typecheck
rtk pnpm --dir packages/web run typecheck
rtk pnpm check:boundaries
rtk git diff --check main..HEAD
```

Expected: CLI suite has zero failures with only its existing platform-specific skip; focused Web documentation contract, both typechecks, boundaries, and diff check all pass. If CLI/Web tests hit known localhost or `tsx` IPC sandbox `EPERM`, rerun with the approved permission path and record both attempts. Check this step with exact results.

- [x] **Step 2: Re-run actual help output as the user-facing acceptance check**

  - Verification: All three sandboxed `tsx` help commands hit the expected IPC `EPERM`; every approved rerun exited 0. Root help lists `character`; character group help lists all nine subcommands and documents the alternative locator for all seven locator-based commands; render help shows `(<name> | --selection <file>)` plus `--help`, `--json`, `--selection`, `--out`, `--animation`, `--frames`, `--bundle`, and `--allow-partial`.

Run:

```sh
rtk pnpm --filter @lpc-toolkit/cli exec tsx src/index.ts --help
rtk pnpm --filter @lpc-toolkit/cli exec tsx src/index.ts character --help
rtk pnpm --filter @lpc-toolkit/cli exec tsx src/index.ts character render --help
```

Expected: root help lists `character`; group help lists all nine subcommands with alternative locators; render help shows `(<name> | --selection <file>)` and all existing render options. Record the acceptance result and check this step.

- [x] **Step 3: Finalize and commit the plan execution record**

  - Implementation note: Replaced all Task 3 placeholders with the stale-assertion correction, complete scoped matrix, and actual-help acceptance evidence; confirmed every implementation checkbox is checked. The plan file is the only path selected for the planned documentation commit; `docs/README-ARCHITECTURE-AUDIT.tmp.md` remains untracked and unstaged. The plan-record commit hash is reported in the final handoff because a commit cannot record its own hash in its committed contents.

Replace every `Not started`, `Not created`, and `Not run` record with actual implementation, full commit hash, and verification evidence. Confirm no unchecked implementation steps remain, then run:

```sh
rtk git add docs/superpowers/plans/2026-07-13-cli-documentation-help-alignment.md
rtk git commit -m "docs(plan): record CLI documentation alignment"
rtk git status -sb
```

Expected: the branch is ahead only by the intended commits, and the only untracked path remains `docs/README-ARCHITECTURE-AUDIT.tmp.md`. Record the plan-record commit hash in the final handoff and check this step before creating the plan-record commit.

**Task 3 implementation record:**

- Implementation: Completed final verification and user-facing help acceptance. The first full-suite run discovered a stale nested-help integration assertion that expected the superseded required-name usage; the test-only correction now asserts the exact alternative-locator usage without changing runtime behavior or documentation.
- Commits: `7e376a6aa9b6ad413fb13c98407b36c7a3c90366` (`test(cli): align nested character help expectation`); the plan-record commit is identified in the final handoff.
- Verification: Stale assertion RED: 1 failure out of 51 focused tests and 1 failure with 300 passes plus 1 skip in the approved full-suite rerun. Focused fix GREEN: 2 files, 67/67 tests. Final matrix: CLI 30/30 files, 301 passed and 1 existing skip; focused Web docs 1 file, 12/12 tests; CLI and Web typechecks PASS; boundaries PASS; `git diff --check main..HEAD` PASS. Known sandbox localhost and `tsx` IPC `EPERM` attempts were followed by successful approved reruns. Root, character-group, and render help acceptance PASS with all required commands, locator notation, and render options.

After every plan checkbox is complete and the plan record is committed, push
`codex/cli-character-authoring` and monitor PR #115. This publish action is the
execution handoff rather than another plan checkbox, so recording its result
cannot create a documentation-only commit that triggers an endless new CI run.
If a check fails, inspect its log through the `github:gh-fix-ci` workflow before
proposing or applying another change.
