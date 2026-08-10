# Agent Integration Audit Gate

Apply this gate whenever an audited journey is described as Agent-guided,
Agent-integrated, plugin-driven, or started by a prompt-oriented UI.

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

## Reject false substitutes

- A Prompt Builder copies text. It is a launcher, not the Agent Integration.
- A default prompt suggests a request. It is not proof that a Skill executes it.
- A plugin manifest proves packaging, not discoverability or a usable journey.
- `allow_implicit_invocation` may help routing, but it does not explain the
  control model to the user.
- A test that only finds copy on a page proves presence, not comprehension or
  reachability.

Apply a standalone-entry check before aggregating scores: if the reader cannot
identify the executor, invocation, authority boundary, and continuation from
the active launcher plus its clearly scoped local guidance, the entry fails
even when the same words appear elsewhere on the page.

If the executable mechanism exists but the intended entry calls a launcher the
integration, hides the Skill, or omits a required Skill-to-Skill handoff, report
one material **presentation mismatch**. Cap readability and usability at `2`
for the affected launcher unit while scoring functional implementation
separately. Apply this cap before rollup so a clearer parent page or sibling
entry cannot dilute the launcher-specific failure.

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
