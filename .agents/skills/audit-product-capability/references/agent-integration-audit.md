# Agent Integration Audit Gate

Apply this gate whenever an audited journey is described as Agent-guided,
Agent-integrated, plugin-driven, or started by a prompt-oriented UI.

## Contents

- [Prove the executor](#prove-the-executor)
- [Prove the entry locally](#prove-the-entry-locally)
- [Prove the transported artifact](#prove-the-transported-artifact)
- [Reject false substitutes](#reject-false-substitutes)
- [Report in plain language](#report-in-plain-language)
- [Canonical regression example](#canonical-regression-example)

## Prove the executor

1. Inventory every visible entry and label each control as explanation,
   launcher, or executable capability.
2. Inspect installed or distributable Agent mechanisms, including plugin
   Skills, `agents/openai.yaml`, plugin manifests, MCP tools, and their workflow
   references.
3. Name the exact mechanism that owns the interaction. For a Skill, record its
   Skill name, trigger, authority checkpoints, public CLI or product contracts,
   outputs, recovery, and next handoff.
4. Search the intended visible entry for that mechanism or an unambiguous
   platform-neutral description of how it is invoked and continued.
5. Walk the whole chain:

```text
visible entry
  -> copied/opened request, if any
  -> named executable Skill, MCP tool, or equivalent
  -> public product operation
  -> user confirmation or authority change
  -> observable result
  -> same-task continuation, recovery, or next Skill
```

Give every arrow its own evidence-backed PASS or FAIL. The existence of both
endpoints does not prove that the entry reaches the executor between them.

## Prove the entry locally

Evaluate every journey-specific launcher in its selected or active state at
the point where the user acts. Count executor guidance only when it appears in
the launcher panel or in immediately adjacent, persistent guidance that is
clearly scoped to that launcher. Do not inherit guidance from generic page
copy, another tab or panel, an unselected default state, or content the reader
must search for elsewhere.

For a launcher backed by Skills, require the local guidance to let the reader
answer all of these questions without leaving the entry:

1. Does this control only copy or open a request, or does it execute work?
2. Which Skill runs first, and what work does it own?
3. Where or how does the user invoke that Skill?
4. Which confirmation or authority checkpoint stops automatic progress?
5. Which Skill or mechanism continues afterward, and does it continue in the
   same task, stop for review, or require a new invocation?

Use the equivalent executor, invocation, authority, and continuation questions
for MCP tools or other executable mechanisms. If exact Skill names are part of
the supported product journey, require those names rather than accepting vague
references to "the agent."

Verify the actual active state. Prefer an interactive walkthrough or a
launcher-scoped rendered test. Source inspection may supplement that evidence,
but a default-state render or a page-wide string assertion does not prove that
the selected launcher explains its execution model.

Adjacent guidance can satisfy origin-entry comprehension only. It cannot
satisfy destination executor binding for an artifact that leaves the page.

## Prove the transported artifact

Apply this gate whenever a launcher copies, opens, exports, downloads, or
forwards a request or artifact:

1. Activate the current launcher and capture the exact clipboard text, opened
   request, downloaded file, URL payload, or structured transport fields.
   Treat a source builder function as supplemental evidence, not a substitute
   for the emitted artifact when interactive capture is available.
2. Record the destination surface and only the context available there.
3. Remove the origin page and its adjacent guidance from the walkthrough.
4. Identify the binding mechanism: transport metadata, direct platform
   selector, destination-local invocation, or implicit-only matching.
5. For a platform-specific launcher that promises a named Skill, require the
   emitted artifact to contain that platform's direct selector (for Codex,
   `$<skill-name>`) or another deterministic transport binding.
6. Verify that the first executor preserves the advertised authority checkpoint
   and owns any later Skill-to-Skill handoff. Do not require the launcher to
   invoke a later mutating Skill before the user reaches its consent boundary.

With the origin removed, require the exact artifact and destination to answer:

1. What content travels to the destination?
2. Which executor runs first, and which bytes or fields bind it?
3. Can the destination invoke that executor without guessing or reconstructing
   origin-only instructions?
4. Does the first executor stop at the advertised authority checkpoint?
5. Does that executor own the later continuation, or does the user need a new
   explicit invocation?

Prefer a clipboard-, request-, URL-, or downloaded-artifact assertion. A
selected-state DOM test proves what the user sees, but not what leaves the
surface. Apply a paste-isolation negative control: inspect the exact artifact
as if it were placed into a fresh destination with no origin-page context.

## Reject false substitutes

- A Prompt Builder copies text. It is a launcher, not the Agent Integration.
- A default prompt suggests a request. It is not proof that a Skill executes it.
- A plugin manifest proves packaging, not discoverability or a usable journey.
- `allow_implicit_invocation` may help routing, but it does not explain the
  control model or prove a product-owned launcher-to-executor edge.
- A test that only finds copy on a page proves presence, not comprehension or
  reachability.

Apply two standalone checks before aggregating scores:

1. **Origin comprehension:** the active launcher plus clearly scoped local
   guidance must identify the executor, invocation, authority boundary, and
   continuation.
2. **Destination binding:** the exact emitted artifact plus destination-local
   context must deterministically bind the first executor and preserve the
   advertised authority boundary.

The entry fails when either check fails, even when the same words appear
elsewhere on the origin page.

If the executable mechanism exists but the intended entry calls a launcher the
integration, hides the Skill, omits a required Skill-to-Skill handoff, or
promises a named Skill while the transported artifact relies only on implicit
matching, report one material **presentation mismatch**. Cap readability and
usability at `2` for the affected launcher unit while scoring functional
implementation separately. Apply this cap before rollup so a clearer parent
page or sibling entry cannot dilute the launcher-specific failure.

If no executable mechanism or public operation exists, report an **execution
gap** and apply the functional cap from the shared surface-to-execution method.

## Report in plain language

State the mismatch as:

> The page tells the user to **[visible action]**, but **[named executor]** is
> what actually performs **[work]**. Because the page does not explain that
> handoff, the user may **[specific consequence]**.

Then show the compact map and the minimum evidence needed to prove a correction.
Do not turn every missing Skill mention into a separate finding when they share
the same root cause.

## Canonical regression example

Treat this as a material presentation mismatch:

```text
origin page: names lpc-animation-asset-audit and says it runs after paste
selected launcher: copies "Find the existing LPC catalog item ..."
emitted artifact: contains no direct Skill selector or transport binding
Skill metadata: allow_implicit_invocation: true
tests: page-wide Skill-name assertions pass
```

The executor exists, so functional implementation remains separate. The exact
artifact does not bind it, so cap readability and usability at `2`.

The minimal passing counterpart is an emitted Codex prompt that directly
invokes `$lpc-animation-asset-audit`, while that read-only Skill retains the
confirmation checkpoint and hands off to the authoring Skill only after the
user consents. Do not directly invoke both Skills in the kickoff artifact when
doing so would cross the authority boundary early.
