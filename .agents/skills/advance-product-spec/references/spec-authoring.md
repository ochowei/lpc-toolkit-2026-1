# Current Spec Authoring

## Contract boundary

A current product spec describes intentional, externally observable, supported behavior. It is normative for compatibility but does not replace implementation schemas, CLI help, architecture ownership, user guides, or tests.

Include:

- supported inputs, actions, outputs, and failure behavior;
- authority, attribution, lifecycle, and mutation boundaries;
- interoperability behavior that consumers may rely on;
- recovery or resume behavior when it is part of the supported journey.

Exclude:

- proposed or partially designed behavior;
- incidental ordering, exact prose, internal filenames, and implementation structure;
- known bugs and accidental quirks;
- historical decisions already owned by plans or ADRs;
- copied code, fixtures, command output, screenshots, or generated reports.

## Requirement quality

Give each requirement a stable `REQ-<DOMAIN>-<NNN>` ID and a concise title. Use `MUST`, `MUST NOT`, `SHALL`, or `SHALL NOT` for normative behavior. Add observable Given/When/Then scenarios; do not restate implementation mechanics.

Split a requirement when its parts can independently pass or fail. Do not split it merely to increase completion counts. Preserve an existing ID when clarifying language without changing the contract. Never reuse a retired ID for new behavior.

## Direction mapping

Declare the capability's `PD-*` objectives once in YAML frontmatter. Requirements inherit those mappings. Add an `Objective override` evidence line only when one requirement serves a cross-domain objective or exceptional guardrail.

A mapping denotes scope traceability only. It does not prove implementation or completion.

## Evidence

Store pointers, not evidence copies.

Each requirement must include:

```md
##### Evidence

- Owner: `packages/.../file.ts`
- Verification: `packages/.../file.test.ts` — `test name`
```

Multiple owner or verification lines are allowed. Paths must be repository-relative and must exist. Use the narrowest owning path. If supported behavior lacks direct automated verification, use:

```md
- Verification: gap — Explain the exact missing executable evidence.
```

Do not mark a requirement verified merely because a broader unrelated gate passes.

## Review preview

Before writing, show:

1. capability and target path;
2. inherited Product Direction objectives;
3. every proposed requirement and scenario;
4. evidence pointers and verification gaps;
5. observable behaviors deliberately excluded;
6. Product Direction coverage and expected spec-to-code conformance;
7. exact files that would change.

Wait for explicit approval. After approval, use `apply_patch`, run the bundled validator, run the narrowest relevant documentation checks, and summarize the resulting diff.
