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

## Reject false substitutes

- A Prompt Builder copies text. It is a launcher, not the Agent Integration.
- A default prompt suggests a request. It is not proof that a Skill executes it.
- A plugin manifest proves packaging, not discoverability or a usable journey.
- `allow_implicit_invocation` may help routing, but it does not explain the
  control model to the user.
- A test that only finds copy on a page proves presence, not comprehension or
  reachability.

If the executable mechanism exists but the intended entry calls a launcher the
integration, hides the Skill, or omits a required Skill-to-Skill handoff, report
one material **presentation mismatch**. Cap readability and usability at `2`
for the affected units while scoring functional implementation separately.

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
