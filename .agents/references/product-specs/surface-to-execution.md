# Surface-to-Execution Method

Inventory the active user- and Agent-facing surfaces owned by the capability before scoring readability or promising an Agent-facing current requirement. Inspect relevant guidance or landing pages, prompt builders and calls to action, CLI help or README sections, plugin skills and workflow references, expected-result copy, and handoff or recovery instructions. Use historical plans only to resolve intent; do not score them as active guidance.

Classify every visible entry point or control before assessing it:

- `explanation` describes a journey or result but does not initiate it;
- `launcher` creates, copies, forwards, or opens a request for another surface to execute; and
- `executable capability` conducts the Agent interaction and coordinates a public product contract through a Skill, MCP tool, another Agent transport, or an equivalent current mechanism.

If one page contains more than one class, classify its controls separately. Do not infer execution from outcome-oriented copy. A prompt builder, starter or default prompt, copied request, manifest, button label, Skill file, or text-presence test is not by itself evidence that the represented journey can be executed.

Once a request or artifact is copied, opened, exported, downloaded, or
forwarded away from its origin, treat it as a new active surface. Do not let it
inherit origin-page guidance that is unavailable at the destination.

For each intended entry, record a surface-to-execution map:

```text
visible entry/control
  -> request, handoff, or artifact
  -> destination and transported context
  -> Agent transport and executable capability
  -> public product contract or operation
  -> authority checkpoint and observable evidence
```

Name a platform-specific Skill, package, manifest, or transport when it is current delivery evidence. Do not promote that implementation name into the cross-platform product contract unless Product Direction or the current spec does so. If the product permits multiple transports, verify the stable responsibilities and authority boundaries independently from each transport's packaging.

Walk each supported journey through the surfaces and record:

- the intended reader and entry action;
- the visible stages, checkpoints, prompts, commands, and controls;
- what the system or Agent does, what the user decides, and where authority changes;
- the evidence or artifact produced at each boundary;
- exactly what travels across each boundary and what origin context disappears;
- the selector, field, or transport binding that reaches the next executor;
- the stop condition and next action; and
- the relevant failure and recovery path.

Also verify that the intended reader can tell:

- whether a control performs work, merely copies a request, or opens another product;
- which installed or available capability continues the journey;
- where same-task follow-up, resume, and cross-capability handoff occur; and
- what happens when the executable capability is unavailable, incompatible, or declined.

Compare the walkthrough with the current spec and across active surfaces. The wording may differ, but the journey, authority boundaries, outputs, and control model must remain consistent. When a surface displays multiple stages but exposes fewer prompts, commands, or controls, require it to say whether those stages are steps, checkpoints, or separate invocations. A multi-stage journey started by one control must explain where same-task follow-up questions and confirmations occur.

For a cross-surface launcher, inspect the exact emitted artifact with the origin
page removed. Rank reachability evidence from strongest to weakest:

1. deterministic transport binding verified at the destination;
2. a direct platform executor selector inside the exact artifact;
3. destination-local invocation guidance;
4. origin-only adjacent guidance; and
5. implicit discovery or invocation metadata.

The final two levels may support intent or fallback behavior, but they cannot
alone prove a product claim that a named executor will run after handoff. Keep
platform-specific selectors as current delivery evidence; do not promote them
into a cross-platform capability contract unless Product Direction or the
current spec requires that transport.

Report material mismatches without promoting exact UI wording or incidental ordering into the current capability spec.

Distinguish two mismatch classes:

- `presentation mismatch`: an executable capability exists, but the entry surface attributes its work to an explanation or launcher, hides the required handoff, or leaves the execution mechanism materially ambiguous;
- `execution gap`: the surface promises a journey with no usable mapped executable capability or public product contract.

A visible prompt-only path with no mapped executable capability is explanation or launcher evidence, not delivered Agent-integration evidence. An execution gap caps functional completeness at `1` for the affected unit. A material launcher-versus-executor ambiguity, including a named-executor promise whose emitted artifact relies only on implicit matching, caps readability and usability at `2`. If the executable mechanism exists but the intended reader cannot discover or reach it from the supported entry, cap usability at `2` while scoring functional implementation separately from that discoverability failure.
