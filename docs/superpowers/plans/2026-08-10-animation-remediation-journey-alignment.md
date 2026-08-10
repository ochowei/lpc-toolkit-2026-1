# Animation Remediation Journey Alignment Implementation Plan

> Source design: [Animation Remediation Journey Alignment Design](../specs/2026-08-10-animation-remediation-journey-alignment-design.md)

**Goal:** Make the public CLI guidance and executable Codex Skill handoff tell
one accurate animation-remediation story that matches the already implemented
strict authoring contract, while retaining `asset init --from-audit` as a
clearly limited Phase 1 alternative.

**Architecture:** Keep all Core and CLI runtime behavior unchanged. Treat the
Web `/cli` page and root README as compact entry points, the CLI README as the
complete direct-workflow reference, and the two plugin Skills as the
executable Agent mechanism. Protect the alignment with rendered-page,
cross-document, plugin-contract, and public lifecycle tests. Correct only the
current capability spec's evidence pointer for closure.

**Tech stack:** TypeScript strict mode, React static rendering, Vitest,
Node test runner, Markdown, pnpm workspaces, RTK command proxy.

## Global constraints

- This is guidance, Skill-workflow, test, and evidence alignment. Do not change
  command behavior, schemas, output shapes, persistence, providers, asset
  generation, attribution, installation, or audit semantics.
- Keep the strict `asset authoring start -> contract -> import -> validate ->
  preview` session as the normative guided remediation path.
- Keep `asset init --from-audit` supported and discoverable as a separate
  Phase 1 scaffold alternative. It is a mutating direct CLI authoring action
  that may run only after the user reviews one selected finding and explicitly
  consents to leave the read-only audit. The audit Skill must never run it.
  State that it cannot scaffold `blankFrames`, does not convert audit `errors`
  into work, and does not create strict-session contracts or receipts.
- Do not imply that the CLI generates the strict plan, selects a finding,
  invents attribution, invokes a provider, or creates candidate pixels.
- Keep the default Agent-guided endpoint review-ready. Release, installation,
  and closure remain separately authorized follow-up work.
- Add the same-scope audit handback only after a separately authorized and
  successful exact installation. Exit code zero alone must never mean closure.
- Preserve matching metadata plus TXT and CSV credits at every preview and
  lifecycle boundary.
- Do not change Product Direction semantics or objective IDs. The current
  capability requirement text remains normative and unchanged.
- Do not add dependencies, use `any`, initialize or modify `upstream/`, weaken
  a verification gate, or touch asset source files.
- Use pnpm and prefix every terminal command with `rtk`.
- Preserve unrelated user changes. Stop and ask if implementation evidence
  contradicts the source design or requires a runtime behavior change.
- After every completed checkbox, update this plan with a concise
  implementation or verification note. After each task commit, record its full
  hash and the exact verification command with PASS/FAIL.

## File structure

- Modify `packages/web/test/landing-page.test.tsx`: rendered contracts for the
  strict CLI sequence, limited Phase 1 alternative, launcher/executor boundary,
  and conditional closure wording.
- Modify `packages/web/src/components/landing-page.tsx`: compact `/cli` journey
  and `/agents` conditional handback explanation.
- Modify `packages/web/test/readme-architecture-docs.test.ts`: stable semantic
  alignment assertions across the root and CLI READMEs.
- Modify `README.md`: short strict-remediation entry point and Phase 1 decision
  warning.
- Modify `packages/cli/README.md`: complete direct strict-session journey,
  Phase 1 limitations, recovery references, and same-scope closure explanation.
- Modify `plugins/lpc-toolkit/test/animation-asset-audit.test.mjs`: executable
  Skill contract for the conditional post-install handback.
- Modify `packages/cli/test/plugin-contract.test.ts`: packaged-plugin contract
  for the same review-ready and closure boundaries.
- Modify `plugins/lpc-toolkit/skills/asset-authoring/SKILL.md` only if the
  conditional handback belongs in the concise top-level Skill contract.
- Modify `plugins/lpc-toolkit/skills/asset-authoring/references/authoring-workflow.md`:
  detailed conditional post-install handback.
- Modify `plugins/lpc-toolkit/skills/animation-asset-audit/SKILL.md` only if the
  re-entry contract is not sufficiently discoverable from its workflow.
- Modify `plugins/lpc-toolkit/skills/animation-asset-audit/references/audit-workflow.md`:
  exact re-entry scope and finding-category closure evaluation.
- Modify `docs/product-specs/animation-remediation.md`: replace the weaker
  REQ-REMED-013 closure pointer with the public two-workspace lifecycle proof;
  do not edit requirement or scenario wording.
- Modify this plan after each completed step with its evidence record.

## CLI documentation impact

This plan changes `plugins/lpc-toolkit/` and public CLI guidance, so the
repository's complete CLI documentation impact matrix is mandatory.

```text
help: N/A — no command, option, usage, example, or generated help behavior changes
cli-readme: update
root-readme: update
landing: update
architecture: N/A — no package ownership, dependency boundary, or stable design decision changes
engineering: N/A — no command, CI, verification, or contributor workflow changes
releasing: N/A — no package version, archive, publication, installation, or release process changes
plugin: update
```

Use this declaration in the eventual PR or handoff:

```text
CLI docs impact: updated
CLI docs surfaces: cli-readme, root-readme, landing, plugin
CLI docs reason: Align animation-remediation guidance and the conditional Skill closure handback with the existing strict authoring contract.
```

Reassess every row during final verification. If implementation expands the
scope, update both this matrix and the affected owned surface before handoff.

---

### Task 1: Align the rendered `/cli` and `/agents` journeys

**Files:**

- Modify `packages/web/test/landing-page.test.tsx`
- Modify `packages/web/src/components/landing-page.tsx`
- Modify this plan

**Produces:** A compact strict remediation sequence that introduces the
session before any session-dependent command, a visibly separate Phase 1
alternative, and an Agent explanation that preserves the default review-ready
endpoint while exposing the conditional closure handback.

- [ ] **Step 1: Add failing rendered-page contract assertions**

  Extend the existing artist-workflow test without asserting whole paragraphs.
  Prove all of the following:

  - the strict commands appear in this order:
    `catalog audit-animations`, `asset authoring start`,
    `asset authoring contract`, `asset authoring import`,
    `asset authoring validate`, `asset authoring preview`;
  - the visible plan is explicit selected-finding input and `start` introduces
    the session before the first dependent `--session <session-id>` command;
  - `asset init --from-audit` appears only in a separately labelled Phase 1
    alternative and its decision-point copy mentions `blankFrames`;
  - that decision point identifies scaffolding as a mutating direct CLI
    authoring action that follows selected-finding review and explicit consent,
    not as work performed by the read-only audit;
  - the page does not claim the CLI generates scope, credits, provider output,
    or candidate pixels;
  - `/agents` still identifies the prompt builder as a launcher, names
    `lpc-animation-asset-audit` and `lpc-asset-authoring`, and keeps the same-task
    handoff; and
  - `/agents` says closure re-enters the audit Skill only after separately
    authorized installation and evaluates categories rather than exit status.

  Update this checkbox immediately after editing and note that RED has not yet
  been run.

- [ ] **Step 2: Run the focused test and record RED**

  ```sh
  rtk pnpm --filter @lpc-toolkit/web test -- landing-page.test.tsx
  ```

  Expected: FAIL only in the new alignment assertions because the current
  artist workflow leads with `asset init --from-audit`, does not introduce the
  strict session or the Phase 1 consent/mutation boundary in sequence, and does
  not expose the conditional closure handback. Record the exact failing
  assertions and passing test count.

- [ ] **Step 3: Make the minimum landing-page content change**

  In `landing-page.tsx`:

  - replace the prominent remediation sequence with the strict ordered path;
  - say that `plan.json` is prepared from one selected finding plus
    human-provided draft attribution and link to the CLI README for its full
    schema;
  - keep existing direct pack creation and lifecycle material, but separate it
    visually from the review-ready strict session;
  - retain `asset init --from-audit` in a compact Phase 1 alternative with its
    `blankFrames`, audit-error, and no-strict-receipts limits;
  - state beside that alternative that it is a mutating direct CLI authoring
    action available only after selected-finding review and explicit consent,
    and is never run by the read-only audit Skill;
  - retain all current no-clone, attribution, provider, Web handoff, and
    draft-versus-install wording; and
  - add one conditional `/agents` paragraph describing the post-install
    handback without making installation part of the default journey.

  Do not change routing, components outside these content regions, command
  behavior, or prompt-builder output.

- [ ] **Step 4: Verify GREEN and inspect both rendered journeys**

  ```sh
  rtk pnpm --filter @lpc-toolkit/web test -- landing-page.test.tsx agent-prompt-builder.test.tsx
  rtk pnpm --filter @lpc-toolkit/web run typecheck
  rtk git diff --check
  ```

  Expected: all focused page and prompt-builder tests PASS; Web typecheck and
  whitespace validation PASS. Manually read the rendered/static `/cli` and
  `/agents` content in journey order and record whether every design acceptance
  criterion owned by those pages is visible.

- [ ] **Step 5: Commit Task 1 and record its full hash**

  ```sh
  rtk git add packages/web/src/components/landing-page.tsx packages/web/test/landing-page.test.tsx
  rtk git commit -m "docs(web): align animation remediation journey"
  rtk git log -1 --format=%H
  ```

  Stage only the two Task 1 files. Leave plan-record edits unstaged for the
  final documentation record unless the repository owner requests otherwise.

**Task 1 record:**

- Implementation: Not started.
- Commit: Not created.
- Verification: Not run.

---

### Task 2: Align the root and CLI README decision path

**Files:**

- Modify `packages/web/test/readme-architecture-docs.test.ts`
- Modify `README.md`
- Modify `packages/cli/README.md`
- Modify this plan

**Produces:** A concise repository entry point and a detailed CLI reference
that agree on strict-session order, explicit plan ownership, Phase 1 limits,
review-ready scope, and optional lifecycle closure.

- [ ] **Step 1: Add failing cross-document semantic assertions**

  Add focused assertions for both documents that check stable phrases or
  command tokens rather than exact prose:

  - both name a strict authoring session and order `start`, `contract`,
    `import`, `validate`, and `preview` correctly;
  - neither uses a session-dependent command before `start`;
  - both identify `plan.json` as explicit input derived from a selected finding
    and draft credits rather than generated CLI output;
  - both label `asset init --from-audit` as a limited Phase 1 alternative;
  - both make the `blankFrames` limitation discoverable at that choice; and
  - both identify Phase 1 scaffolding as a mutating direct CLI authoring action
    that follows selected-finding review and explicit consent, not an audit
    operation.

  The CLI README-specific assertions should additionally retain its existing
  complete-report, audit-error, strict-plan-schema, receipt, recovery,
  review-ready, and lifecycle semantics.

- [ ] **Step 2: Run the documentation contract and record RED**

  ```sh
  rtk pnpm --filter @lpc-toolkit/web test -- readme-architecture-docs.test.ts
  ```

  Expected: FAIL only in the new alignment assertions. Record exactly which
  semantic contract is missing from each document.

- [ ] **Step 3: Update `README.md` as the compact entry point**

  Replace the ambiguous remediation walkthrough with a short strict-session
  sequence. Explain plan ownership in one sentence, preserve attributed
  review-ready output, and link to `packages/cli/README.md` for the schema,
  recovery, provider, and lifecycle details. Keep the Phase 1 scaffold in a
  separate note that explicitly mentions `blankFrames`, no strict receipts,
  the mutating authoring boundary, and the required finding review and explicit
  consent.

  Do not expand the root README into a duplicate command reference.

- [ ] **Step 4: Update `packages/cli/README.md` as the complete reference**

  Make one authoritative section walk through:

  1. bounded `catalog audit-animations --json` and complete-report retention;
  2. one human-selected finding and explicit strict
     `lpc-toolkit.asset-authoring-plan.v1` input;
  3. `asset authoring start` and the returned session ID;
  4. contract inspection and external/provider-neutral candidate creation;
  5. contract-bound import, validation, and attributed preview;
  6. the review-ready stopping boundary;
  7. separately confirmed formal lifecycle actions; and
  8. same-scope closure after successful installation.

  Keep the existing detailed Phase 1 section, but connect the decision point
  clearly to its mutating direct CLI authoring boundary, selected-finding
  review and explicit consent, `blankFrames`, audit-error, and receipt
  limitations. State that the read-only audit Skill never runs the scaffold
  command. Prefer links to existing schema and recovery subsections over
  duplicating them.

- [ ] **Step 5: Verify GREEN and documentation policy**

  ```sh
  rtk pnpm --filter @lpc-toolkit/web test -- readme-architecture-docs.test.ts
  rtk pnpm verify:cli-docs-policy
  rtk git diff --check
  ```

  Expected: cross-document tests, CLI documentation policy, and whitespace
  checks PASS. Record the exact counts and confirm that no maintained Markdown
  link became absolute or unresolved.

- [ ] **Step 6: Commit Task 2 and record its full hash**

  ```sh
  rtk git add README.md packages/cli/README.md packages/web/test/readme-architecture-docs.test.ts
  rtk git commit -m "docs(cli): align remediation workflow guidance"
  rtk git log -1 --format=%H
  ```

  Stage only Task 2 files.

**Task 2 record:**

- Implementation: Not started.
- Commit: Not created.
- Verification: Not run.

---

### Task 3: Make the conditional Skill closure handback explicit

**Files:**

- Modify `plugins/lpc-toolkit/test/animation-asset-audit.test.mjs`
- Modify `packages/cli/test/plugin-contract.test.ts`
- Modify `plugins/lpc-toolkit/skills/asset-authoring/SKILL.md` only if needed
- Modify `plugins/lpc-toolkit/skills/asset-authoring/references/authoring-workflow.md`
- Modify `plugins/lpc-toolkit/skills/animation-asset-audit/SKILL.md` only if needed
- Modify `plugins/lpc-toolkit/skills/animation-asset-audit/references/audit-workflow.md`
- Modify this plan

**Produces:** An executable Agent contract that stops at review-ready by
default, preserves every human authority boundary, and conditionally returns a
completed installation to the original bounded audit for category-based
closure evaluation.

- [ ] **Step 1: Add a failing plugin handback contract**

  Extend the existing strict-handoff and review-ready tests to prove these
  concepts are simultaneously present:

  - the normal `extend-item` route starts in `lpc-animation-asset-audit` and
    enters exactly one strict authoring session;
  - the audit Skill never runs `asset init --from-audit`, initializes an
    authoring workspace, scaffolds source, or otherwise crosses the consent
    boundary itself;
  - review-ready remains the default endpoint;
  - warning acknowledgement, declaration, preview acceptance, sync, pack,
    inspection, and installation are separately requested and confirmed;
  - only after successful exact installation does authoring name
    `lpc-animation-asset-audit` as the next executor;
  - the handback retains the original animation, optional type, optional body
    type, report identity/digest, and selected finding; and
  - the audit re-entry evaluates `unsupported`, `missingFiles`, `blankFrames`,
    and `errors`, explicitly rejecting exit status as closure evidence.

  Keep the tests semantic: assert the required executor, boundary, scope, and
  categories without freezing whole paragraphs.

- [ ] **Step 2: Run the focused plugin contracts and record RED**

  ```sh
  rtk node --test plugins/lpc-toolkit/test/animation-asset-audit.test.mjs
  rtk pnpm --filter @lpc-toolkit/cli test -- plugin-contract.test.ts
  ```

  Expected: the new post-install handback assertions FAIL while existing
  strict-session and review-ready tests continue to pass. Record both command
  results separately.

- [ ] **Step 3: Update the minimum executable Skill guidance**

  In the asset-authoring workflow, append a conditional lifecycle-closure
  section after the existing review-ready endpoint:

  - do not run it unless the user separately requests and confirms formal
    lifecycle work;
  - require a successful exact installation receipt;
  - pass the preserved original bounds back to
    `lpc-animation-asset-audit` in the same Codex task;
  - rerun `catalog audit-animations` with the exact original animation and
    optional type/body-type filters;
  - inspect all four finding categories and report absent, remaining, or
    inspection-error evidence; and
  - stop instead of expanding scope or starting another mutation automatically.

  Update the audit workflow only enough to define this re-entry. Edit either
  top-level `SKILL.md` only if the conditional executor transition would
  otherwise be undiscoverable or contradict its concise contract. Do not
  duplicate the detailed workflow wholesale. Preserve its explicit prohibition
  against `asset init --from-audit`, workspace initialization, source
  scaffolding, or any other mutation inside the audit Skill.

- [ ] **Step 4: Verify GREEN and the packaged plugin**

  ```sh
  rtk node --test plugins/lpc-toolkit/test/animation-asset-audit.test.mjs
  rtk pnpm --filter @lpc-toolkit/cli test -- plugin-contract.test.ts
  rtk pnpm verify:plugin
  rtk git diff --check
  ```

  Expected: both focused contracts and the complete plugin verification PASS.
  Record exact test counts and confirm no new CLI command was added to a Skill
  contract.

- [ ] **Step 5: Commit Task 3 and record its full hash**

  ```sh
  rtk git add plugins/lpc-toolkit/test/animation-asset-audit.test.mjs packages/cli/test/plugin-contract.test.ts plugins/lpc-toolkit/skills/asset-authoring/SKILL.md plugins/lpc-toolkit/skills/asset-authoring/references/authoring-workflow.md plugins/lpc-toolkit/skills/animation-asset-audit/SKILL.md plugins/lpc-toolkit/skills/animation-asset-audit/references/audit-workflow.md
  rtk git diff --cached --stat
  rtk git commit -m "docs(plugin): clarify remediation closure handoff"
  rtk git log -1 --format=%H
  ```

  Before committing, unstage any listed optional `SKILL.md` file that did not
  need a change. Confirm the staged diff contains no product or asset source.

**Task 3 record:**

- Implementation: Not started.
- Commit: Not created.
- Verification: Not run.

---

### Task 4: Point REQ-REMED-013 at the strongest closure proof

**Files:**

- Modify `docs/product-specs/animation-remediation.md`
- Modify this plan

**Produces:** A more accurate evidence pointer for an unchanged current
capability requirement.

- [ ] **Step 1: Reconfirm the public closure evidence**

  Inspect the exact test and verify that it packs in one clean workspace,
  installs into another, reruns the bounded animation/type/body-type audit, and
  asserts zero remaining findings across all four categories:

  ```sh
  rtk rg -n "packs in one clean workspace|installedAudit|incompleteItems|blankFrames|errors" packages/cli/test/asset-lifecycle-e2e.test.ts
  ```

  Record the exact test name and relevant assertion location in this plan.

- [ ] **Step 2: Update only the REQ-REMED-013 evidence list**

  Replace the weaker single-workspace authoring E2E pointer with:

  ```text
  packages/cli/test/asset-lifecycle-e2e.test.ts — packs in one clean workspace and installs, upgrades, renders, removes, and diagnoses in another
  ```

  Retain the animation-audit owner and category-separation test. Do not change
  REQ-REMED-013, its scenario, Product Direction mappings, or any other current
  capability statement.

- [ ] **Step 3: Run the evidence tests**

  ```sh
  rtk pnpm --filter @lpc-toolkit/cli test -- animation-audit.test.ts asset-lifecycle-e2e.test.ts
  rtk git diff --check
  ```

  Expected: both current behavior suites PASS; the only spec diff is the
  evidence pointer. Record exact test counts.

- [ ] **Step 4: Commit Task 4 and record its full hash**

  ```sh
  rtk git add docs/product-specs/animation-remediation.md
  rtk git commit -m "docs(spec): strengthen remediation closure evidence"
  rtk git log -1 --format=%H
  ```

**Task 4 record:**

- Implementation: Not started.
- Commit: Not created.
- Verification: Not run.

---

### Task 5: Reassess owned surfaces and complete final verification

**Files:**

- Review every file changed by Tasks 1–4
- Modify this plan with final records and the reassessed CLI matrix

- [ ] **Step 1: Perform a reader-level journey walkthrough**

  Read `/cli`, `/agents`, the root README, the strict-session section of the
  CLI README, and both Skill workflows in this order. Record PASS/FAIL for:

  1. launcher versus executor classification;
  2. audit before mutation;
  3. explicit finding selection and human confirmation;
  4. explicit plan ownership;
  5. session introduction before dependent commands;
  6. strict import/validate/preview order;
  7. metadata plus TXT/CSV attribution;
  8. review-ready versus formal lifecycle authority;
  9. separate Phase 1 choice, `blankFrames` limitation, explicit consent, and
     mutating direct CLI authoring boundary; and
  10. conditional same-scope post-install closure by finding category.

  Also confirm no active surface describes the prompt builder or a provider as
  the Agent integration and no normal path requires a repository clone or
  `upstream/`.

- [ ] **Step 2: Reassess the CLI documentation impact matrix**

  Recheck all eight rows from the matrix near the top of this plan against the
  final diff. Record each as `update` or `N/A — reason`. If any row changed,
  correct the matrix and surface before continuing.

- [ ] **Step 3: Run focused alignment verification**

  ```sh
  rtk pnpm --filter @lpc-toolkit/web test -- landing-page.test.tsx agent-prompt-builder.test.tsx readme-architecture-docs.test.ts
  rtk node --test plugins/lpc-toolkit/test/animation-asset-audit.test.mjs
  rtk pnpm --filter @lpc-toolkit/cli test -- plugin-contract.test.ts animation-audit.test.ts asset-lifecycle-e2e.test.ts
  rtk pnpm verify:plugin
  rtk pnpm verify:cli-docs-policy
  rtk pnpm --filter @lpc-toolkit/web run typecheck
  rtk pnpm --filter @lpc-toolkit/cli run typecheck
  rtk git diff --check
  ```

  Record every command, exact PASS/FAIL, and relevant test count. Fix only
  failures caused by this change.

- [ ] **Step 4: Run repository-wide gates**

  ```sh
  rtk pnpm verify
  rtk pnpm build
  ```

  Both commands must PASS before handoff. If a failure is unrelated, preserve
  its full evidence and stop for user direction rather than weakening a gate.

- [ ] **Step 5: Review scope and diff quality**

  ```sh
  rtk git status -sb
  rtk git diff --stat
  rtk git diff --check
  rtk git log --oneline -5
  ```

  Confirm the final change contains only guidance, tests, Skill workflow, the
  evidence pointer, and this plan record. Confirm there are no changes under
  `packages/core/`, CLI implementation source, `assets/`, or `upstream/`.

- [ ] **Step 6: Commit the completed plan record and report handoff evidence**

  ```sh
  rtk git add docs/superpowers/plans/2026-08-10-animation-remediation-journey-alignment.md
  rtk git commit -m "docs(plan): record remediation journey alignment"
  rtk git log -1 --format=%H
  rtk git status -sb
  ```

  Record the final plan-record commit hash in the handoff because a commit
  cannot contain its own hash. Do not push or open a PR unless the user asks.

**Task 5 record:**

- Walkthrough: Not run.
- CLI documentation impact reassessment: Not run.
- Focused verification: Not run.
- Repository-wide verification: Not run.
- Commit: Not created.

## Completion criteria

The work is complete only when:

- all acceptance criteria in the source design are satisfied;
- the `/agents` prompt builder remains a launcher and both Skills remain the
  named executors;
- every prominent direct CLI journey introduces the strict session correctly;
- the Phase 1 alternative remains supported and honestly bounded as a mutating
  direct CLI authoring action after finding review and explicit consent, never
  as an operation performed by the read-only audit Skill;
- default review-ready and separate lifecycle authority remain intact;
- the post-install closure handback is explicit, same-scope, and category-based;
- REQ-REMED-013 points to the public two-workspace closure proof without
  changing normative behavior;
- the final CLI documentation impact matrix is recorded;
- focused tests, plugin verification, CLI docs policy, typechecks,
  `rtk pnpm verify`, and `rtk pnpm build` all PASS; and
- the handoff lists exact changed files, full commit hashes, and verification
  results.

## Deferred follow-up

Locating and recording the canonical live Vercel delivery URL is intentionally
outside this implementation. Track it as a separate delivery-evidence task if
the repository owner wants deployed-surface verification; it does not block
this guidance and Skill alignment.
