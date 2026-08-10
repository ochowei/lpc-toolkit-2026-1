# Animation Remediation Journey Alignment Design

**Date:** 2026-08-10

**Status:** Proposed for review

## Summary

Align every active animation-remediation explanation and Agent handoff with the
already implemented current capability contract. The primary guided path must
remain a read-only `lpc-animation-asset-audit` followed, only after explicit
confirmation, by one strict `lpc-asset-authoring` `extend-item` session. The
direct CLI guidance must present the same strict contract from audit evidence
through attributed preview and must identify `asset init --from-audit` as a
separate, narrower Phase 1 scaffold workflow rather than the strict session.

After a user separately authorizes formal release and installation, the Agent
workflow must make the final same-scope handback explicit: return to
`lpc-animation-asset-audit`, reuse the original animation/type/body-type scope,
and inspect the resulting finding categories instead of treating process exit
status as closure.

This is a guidance, Skill-workflow, test, and evidence-alignment change. The
underlying CLI and Core behavior is already implemented and verified.

## Audit finding being resolved

The audited revision `ecabd2294b4a5130918c996f8fa12f1c87221788` has complete
functional coverage for all 13 current animation-remediation requirements, but
two explanation gaps remain:

1. The `/cli` page and root README prominently show
   `catalog audit-animations -> asset init --from-audit -> asset validate ->
   asset preview -> asset sync -> asset pack`, then later show strict
   `asset authoring ... --session <session-id>` commands without introducing
   the strict session. The CLI guide separately documents the current
   `asset authoring start -> contract -> import -> validate -> preview` path and
   states that the Phase 1 scaffold cannot handle `blankFrames`.
2. The audit Skill records the requirement to rerun the original scope, and the
   public CLI proves post-install closure, but the end of the authoring Skill
   does not explicitly hand the same Codex task back to the audit Skill after a
   separately authorized installation.

The active `/agents` page already classifies the prompt builder correctly as a
launcher and names both executable Skills. That boundary must be retained.

## Decision at a glance

- The strict authoring session is the normative animation-remediation path
  shown by the Agent workflow and by prominent CLI guidance.
- `asset init --from-audit` remains supported and documented, but only as a
  limited direct scaffold alternative with its finding restrictions stated.
- The default Agent-guided endpoint remains review-ready. No release,
  installation, or closure audit occurs without a separate user request and
  the existing confirmations.
- If an extension is formally installed, the authoring workflow hands the task
  back to `lpc-animation-asset-audit` with the original bounds.
- No command, schema, response, persistence, provider, attribution, or release
  behavior changes.
- The stronger public two-workspace closure test becomes the evidence pointer
  for REQ-REMED-013.

## Goals

- Give CLI readers one complete and ordered strict remediation journey from a
  structured finding to a review-ready attributed preview.
- Introduce `session-id` only after the visible `asset authoring start` step.
- Explain where the strict `lpc-toolkit.asset-authoring-plan.v1` input comes
  from without implying that the CLI invents audit scope or human attribution.
- Keep the Phase 1 scaffold discoverable while making its narrower support and
  lack of strict session receipts unmistakable.
- Keep the Agent launcher, executor names, authority changes, review-ready
  endpoint, and CLI fallback consistent across `/agents`, the root README, the
  CLI README, and plugin workflows.
- Make post-install same-scope closure a discoverable conditional handoff.
- Protect the journey with focused surface, cross-document, plugin, and public
  contract tests.
- Correct the current capability spec's REQ-REMED-013 evidence pointer without
  changing the requirement.

## Non-goals

- No new CLI command, option, plan schema, report schema, response field, or
  runtime behavior.
- No automatic conversion of an audit report into a strict authoring plan.
- No removal of `asset init --from-audit` or the direct asset-pack workflow.
- No change to the default review-ready endpoint.
- No automatic warning acknowledgement, declaration, preview acceptance,
  synchronization, packaging, inspection, installation, or closure audit.
- No bundled provider, provider discovery registry, credential store, image
  generation, or network behavior.
- No change to Product Direction semantics or objective IDs.
- No requirement for the Web Composer, a repository clone, or `upstream/`.
- No Core, CLI implementation, asset, attribution, archive, or installation
  code change unless implementation work uncovers evidence that contradicts
  this design.
- No Vercel deployment change. Capturing a canonical live deployment URL is a
  separate delivery-evidence follow-up and does not block this alignment.

## Current contracts retained

The change must preserve these current contracts:

- `catalog audit-animations` is read-only, requires an explicit animation, and
  preserves optional type and body-type bounds.
- Unsupported, missing-file, blank-frame, and inspection-error findings remain
  distinct.
- `lpc-animation-asset-audit` may produce a bounded handoff but may not create
  a workspace or mutate source.
- `lpc-asset-authoring` may begin `extend-item` work only after explicit human
  confirmation of one bounded finding.
- The strict plan retains the original report/digest, selected finding,
  physical source, affected consumers, geometry/confidence evidence, inherited
  identity and credits, and approved scope.
- Candidate pixels become canonical only through the current contract-bound
  import operation.
- Review-ready means current import, validation, preview PNG, metadata, credits
  TXT, and credits CSV. It is not release or human acceptance.
- Formal release and installation remain separately confirmed.
- Closure is determined from a same-scope audit result, not exit code alone.

## User journeys

### 1. Agent-guided remediation

```text
/agents animation-extension launcher
  -> copied request pasted into one Codex task
  -> lpc-animation-asset-audit
  -> catalog audit-animations --json
  -> preserved report and bounded worklist
  -> user selects one finding
  -> user confirms one source-authoring transition
  -> lpc-asset-authoring in extend-item mode
  -> strict plan -> start -> contract
  -> optional separately consented provider, or external artist/tool
  -> import -> validate -> attributed preview
  -> stop at review-ready
```

The `/agents` page must continue to say that copying the kickoff prompt does
not run the journey. It must continue to name both Skills and the same-task
handoff.

### 2. Direct strict CLI remediation

Prominent CLI guidance must show this ordered contract:

```text
catalog audit-animations --animation <name> [--type ...] [--body-type ...] --json
  -> save the complete successful report
  -> choose one finding and prepare a strict extend-item plan.json
asset authoring start --plan <plan.json> --workspace <workspace> --json
  -> receive <session-id>
asset authoring contract --session <session-id> --workspace <workspace> --json
  -> prepare one contract-compatible candidate outside canonical source
asset authoring import --session <session-id> --target <target-id>
  --candidate <png> --contract-digest <sha256> --workspace <workspace> --json
asset authoring validate --session <session-id> --workspace <workspace> --json
asset authoring preview --session <session-id> --workspace <workspace> --json
  -> review-ready attributed artifacts
```

The compact Web page and root README do not need to reproduce the full strict
plan schema. They must say that `plan.json` is explicit input prepared from the
selected finding and human-provided draft attribution, and link to the CLI
package guide for the complete schema and recovery rules. They must not imply
that `asset authoring start` generates scope, consent, credits, or candidate
pixels.

The visible command sequence must not contain a session-dependent operation
before `asset authoring start` introduces the session identifier.

### 3. Limited Phase 1 scaffold alternative

`asset init --from-audit` remains a real public operation. Active guidance must
classify it as a separate direct scaffold alternative.

This is a mutating direct CLI authoring action that writes a scaffold into an
authoring workspace; it is not part of the read-only audit. It may run only
after the user reviews one selected finding and explicitly consents to leave
the audit and begin authoring. The `lpc-animation-asset-audit` Skill must never
run this command.

At the decision point, guidance must also state all material limits needed to
choose the alternative safely:

- it accepts only a complete successful `catalog audit-animations --json`
  response;
- supported scaffoldable findings retain their current warnings and evidence;
- `blankFrames` cannot be scaffolded by this Phase 1 path;
- audit `errors` never become drawing tasks;
- it does not create a strict authoring session, drawing contract, candidate
  import receipt, validation receipt, or preview receipt; and
- a reader who needs the current strict contract must use
  `asset authoring start`, not continue with an unexplained `<session-id>`.

The guidance may link to the detailed CLI guide rather than duplicating every
finding rule, but the `blankFrames` limit and the distinction from a strict
session must be visible at the decision point.

### 4. Conditional post-install closure

The default Agent journey still stops at review-ready. If, and only if, the
user later requests the formal lifecycle and completes the existing human
gates through installation, the authoring workflow must expose this handoff:

```text
successful exact installation
  -> preserve original audit targets and optional type/body-type scope
  -> return in the same task to lpc-animation-asset-audit
  -> rerun catalog audit-animations with those exact bounds
  -> inspect unsupported, missingFiles, blankFrames, and errors
  -> report the selected finding absent or still present for further review
```

An exit code of zero proves that the audit ran, not that remediation closed.
If the finding or a relevant inspection error remains, the Agent reports that
evidence and stops; it does not expand scope or mutate source automatically.

## Surface responsibilities

| Surface | Responsibility after alignment |
| --- | --- |
| `/agents` page | Explain launcher versus executors, name both Skills, show authority stages, retain CLI fallback and review-ready endpoint. |
| Animation prompt builder | Produce the bounded kickoff request and expected review-ready result; do not claim to execute, release, install, or close the audit. |
| `/cli` page | Show the compact strict remediation sequence first; identify Phase 1 scaffold as a limited post-consent direct CLI alternative; link to the complete CLI guide. |
| Root `README.md` | Give a short, consistent remediation overview and strict command path; defer schema and recovery detail to the CLI README. |
| `packages/cli/README.md` | Own the complete direct audit, strict plan/session, Phase 1 alternative, finding limits, recovery, and lifecycle reference. |
| `lpc-animation-asset-audit` | Own read-only audit, bounded interpretation, original-scope preservation, and final same-scope closure evaluation. |
| `lpc-asset-authoring` | Own the confirmed strict extension through review-ready, plus a conditional post-install handback to the audit Skill. |
| Current capability spec | Keep normative requirements unchanged and point REQ-REMED-013 at the strongest current public closure proof. |

## Content rules

- Use “strict authoring session” for the current contract-bound path.
- Use “Phase 1 scaffold alternative” or another clearly limited label for
  `asset init --from-audit`; do not call it the strict session.
- At the Phase 1 decision point, say that scaffolding is a mutating direct CLI
  authoring action that requires selected-finding review and explicit consent;
  the read-only audit Skill never runs it.
- Do not call either a provider or prompt builder the Agent integration.
- Do not describe the CLI as generating pixels or invoking a provider.
- Do not claim that review-ready means accepted, released, or installed.
- Do not put the closure audit before separately confirmed installation.
- Do not imply that exit code zero means no findings.
- Keep matching metadata and TXT/CSV credits visible at preview and lifecycle
  boundaries.
- Preserve the existing no-repository and no-`upstream/` journey.

## Test and evidence design

### Web surface tests

Extend `packages/web/test/landing-page.test.tsx` to prove:

- the compact strict remediation commands are present in journey order;
- `asset authoring start` appears before the first dependent session command in
  the remediation walkthrough;
- the page identifies `plan.json` as explicit selected-finding input;
- the Phase 1 alternative is visibly separate and mentions its `blankFrames`
  limitation;
- the Phase 1 decision point identifies scaffolding as a mutating direct CLI
  authoring action after selected-finding review and explicit consent; and
- existing launcher/executor, Skill names, authority, provider, review-ready,
  and release/install wording remains present.

The test proves rendered content and ordering, not reader comprehension. Final
verification therefore also includes a recorded manual walkthrough of `/cli`
and `/agents` against the journeys in this design.

### Cross-document tests

Extend `packages/web/test/readme-architecture-docs.test.ts` with stable semantic
assertions that the root and CLI READMEs:

- name the strict remediation session;
- keep the strict command order consistent;
- identify the Phase 1 scaffold as limited;
- state that `blankFrames` require the strict path rather than Phase 1
  scaffolding; and
- state that Phase 1 scaffolding is a mutating direct CLI authoring transition
  after finding review and explicit consent, not an audit operation.

Avoid asserting whole paragraphs or incidental wording.

### Plugin contract tests

Extend `plugins/lpc-toolkit/test/animation-asset-audit.test.mjs` and the focused
CLI plugin contract when useful to prove:

- the audit-to-authoring handoff still enters one strict `extend-item` session;
- the audit Skill never runs `asset init --from-audit`, initializes an
  authoring workspace, or scaffolds source;
- the authoring workflow's default endpoint remains review-ready;
- release/install remain separately requested; and
- after a separately completed installation, the workflow names
  `lpc-animation-asset-audit`, preserves the original target/type/body-type
  scope, and evaluates finding categories rather than process exit status.

### Capability evidence pointer

Update only the REQ-REMED-013 evidence list in
`docs/product-specs/animation-remediation.md` to include the public
two-workspace closure scenario in
`packages/cli/test/asset-lifecycle-e2e.test.ts`. Do not change the requirement,
scenario, Product Direction mappings, or current capability semantics.

## Key Product Direction mapping (non-exhaustive)

This design aligns existing delivery with these key current objectives; it
does not change their meaning. The list highlights the guardrails most exposed
by this guidance change and is not a replacement for the standalone objective
register:

- `PD-CAP-GUIDANCE-AGENT-001`
- `PD-CAP-AUDIT-PRODUCT-001`
- `PD-CAP-AUDIT-AGENT-001`
- `PD-CAP-REMEDIATION-CLI-001`
- `PD-CAP-CONTRACT-CLI-002`
- `PD-CAP-IMPORT-CLI-001`
- `PD-CAP-IMPORT-CLI-002`
- `PD-CAP-RESUME-PRODUCT-001`
- `PD-CAP-LIFECYCLE-AGENT-001`
- `PD-CAP-LIFECYCLE-PRODUCT-001`
- `PD-GRD-AUDIT-PRODUCT-001`
- `PD-GRD-GENERATION-PRODUCT-001`
- `PD-GRD-REMEDIATION-PRODUCT-001`
- `PD-GRD-REMEDIATION-PRODUCT-002`
- `PD-GRD-REMEDIATION-PRODUCT-003`
- `PD-GRD-CONSENT-AGENT-001`
- `PD-GRD-CONSENT-AGENT-003`
- `PD-GRD-CONSENT-AGENT-004`
- `PD-GRD-LIFECYCLE-PROVIDER-001`
- `PD-GRD-ATTR-PRODUCT-001`
- `PD-GRD-ATTR-PRODUCT-002`
- `PD-GRD-ATTR-PRODUCT-003`
- `PD-GRD-INDEPENDENCE-PRODUCT-001`
- `PD-GRD-INDEPENDENCE-PRODUCT-002`
- `PD-GRD-LIFECYCLE-PRODUCT-004`
- `PD-GRD-RELEASE-PRODUCT-001`
- `PD-GRD-AUTHORITY-PRODUCT-001`
- `PD-GRD-RELEASE-PRODUCT-002`
- `PD-CAP-INSTALL-PRODUCT-001`
- `PD-GRD-AUTHORITY-AGENT-004`
- `PD-GRD-AUTHORITY-AGENT-005`

## Risks and mitigations

### The strict path may look like an automatic plan generator

Mitigation: say that the plan is explicit input prepared from one selected
finding and human-provided draft attribution. Link to the full schema. Do not
invent a new command in documentation.

### The Phase 1 path may appear deprecated or unsupported

Mitigation: call it supported but limited, preserve its existing guide, and
state when it remains useful. At the decision point, identify it as a mutating
direct CLI authoring action that follows selected-finding review and explicit
consent and is never executed by the audit Skill. The change clarifies choice;
it does not remove the operation.

### Closure wording may broaden Agent authority

Mitigation: make the handback conditional on a separately requested and
successfully completed installation. Keep finding interpretation read-only and
require another explicit confirmation for any further authoring.

### Content-presence tests may overstate readability

Mitigation: test stable semantic content and ordering, then record a manual
reader walkthrough across the active pages and linked guide before handoff.

### Documentation surfaces may drift again

Mitigation: keep the root README compact, make the CLI README the detailed
owner, and add cross-document assertions only for the stable journey and
control-model distinctions.

## Acceptance criteria

1. The `/agents` page still says the kickoff control only copies a request and
   names `lpc-animation-asset-audit` and `lpc-asset-authoring` as the executors.
2. The `/cli` page presents the strict remediation sequence from audit through
   attributed preview in executable order.
3. `asset authoring start` introduces the session before any dependent
   `<session-id>` operation in that walkthrough.
4. The root README and CLI README describe the same strict journey and assign
   detailed schema/recovery ownership to the CLI README.
5. The Phase 1 `asset init --from-audit` workflow remains documented as a
   supported limited direct CLI alternative, visibly states that it cannot
   scaffold `blankFrames`, and identifies scaffolding as a mutating authoring
   transition that follows selected-finding review and explicit consent. The
   read-only `lpc-animation-asset-audit` Skill never runs it.
6. The visible guidance does not imply that the CLI generates pixels, invents
   plan scope or credits, invokes a provider, or performs lifecycle actions
   automatically.
7. `lpc-asset-authoring` still stops at review-ready by default.
8. After separately authorized installation, the documented same-task handback
   returns to `lpc-animation-asset-audit` with the original target/type/body
   scope and evaluates all finding categories rather than exit status alone.
9. REQ-REMED-013 points to the public two-workspace post-install closure test.
10. Focused Web, cross-document, plugin, and CLI contract tests pass.
11. A recorded manual walkthrough finds no explanation, responsibility,
    authority, output, recovery, or next-action mismatch across `/agents`,
    `/cli`, the root README, CLI README, and both Skills.
12. `rtk pnpm verify` passes before implementation handoff without initializing
    or modifying `upstream/`.

## Deferred delivery-evidence follow-up

The audit could not verify `PD-DEL-WEB-VERCEL-001` because no canonical live URL
was identified. Resolve that separately by identifying the owned Vercel
deployment, recording its canonical URL in the appropriate current-delivery
surface, and capturing a live smoke result. Do not couple a deployment or
Product Direction change to this guidance-alignment implementation.
