# Agent Documentation Retrieval Cost

Status: discussion notes; non-binding survey record

Date: 2026-07-24

## Purpose

This document records a discussion about how to evaluate how much documentation
and repository context an AI agent might need to complete a change in LPC
Toolkit. It collects candidate concepts, possible measurements, and questions
for future sessions. It is not an implementation plan, repository policy, or
decision to change the documentation structure. It does not claim that one
scalar can fully describe agent performance.

## Discussion summary

One possible direction is to measure agent context as a vector rather than model
the repository as a binary search tree. The repository is better described as a
directed graph:

```text
task
  ├──> entry and policy documents
  ├──> package ownership and dependency boundaries
  ├──> implementation files and tests
  └──> verification commands
```

The measures that appear most relevant to this repository are:

1. Retrieval cost and token cost.
2. Navigation cost and branching factor.
3. Agent context radius and dependency distance.
4. Verification cost and change impact.

Information gain could be useful for a later benchmark, once representative
tasks and their required reading sets have been recorded. A single ARC/ARS
score would require more discussion and evidence before it could be meaningful.

## Current repository baseline

The current documentation system already has a strong high-level entry path:

```text
AGENTS.md
  ├── docs/ARCHITECTURE.md
  ├── docs/ENGINEERING.md
  ├── docs/ONBOARDING.md
  └── CONTRIBUTING.md
```

As of 2026-07-24, the main entry documents contain approximately 1,458 lines:

| Document | Approximate lines | Primary role |
| --- | ---: | --- |
| `AGENTS.md` | 193 | Agent entry point and non-negotiable rules |
| `docs/ARCHITECTURE.md` | 639 | Ownership, boundaries, and stable design |
| `docs/ENGINEERING.md` | 356 | Commands, tests, CI, and verification |
| `docs/ONBOARDING.md` | 159 | Repository orientation |
| `CONTRIBUTING.md` | 111 | Human contribution workflow |

The `docs/superpowers/` area contains approximately 220 plans, specs, and
notes. It is valuable historical context, but should not be treated as the
default reading set for every task. The package surface is also unevenly sized:
the Web package is substantially larger than Core, Presets, or the shared
asset-pack-format package. This makes routing more important than a flat
document index.

## Cost model

The initial task cost profile should be recorded as a vector:

```text
Agent Task Cost = (H, B, D, T, R, X, V)
```

Where:

- `H` — navigation hops from the task to the first useful source and then to
  the owned implementation/test files.
- `B` — branching factor: plausible documents or paths considered at each
  navigation step.
- `D` — number of documents opened.
- `T` — tokens read from those documents. Line count is a useful local proxy,
  but token counts should be used for benchmark comparisons.
- `R` — context radius: the number of ownership/dependency layers required by
  the task.
- `X` — dependency distance and change impact across package boundaries.
- `V` — verification burden: required checks, commands, and expected runtime.

These dimensions should remain separate at first. Weighting them into a single
score would hide useful tradeoffs, such as a task that reads more tokens but
has a much smaller change-impact surface.

## Suitability of candidate measures

| Measure | Fit | How to apply it here |
| --- | --- | --- |
| Retrieval cost | Very high | Count opened documents and required source/test files for a task. |
| Token cost | Very high | Record tokens read, especially from `AGENTS.md`, Architecture, Engineering, and plans. |
| Navigation cost | Very high | Count links, searches, and ownership decisions before reaching the correct files. |
| Branching factor | Very high | Count plausible candidate docs in `docs/superpowers/` and package subtrees. |
| Context radius | High | Measure how many policy, package, adapter, and test layers a task crosses. |
| Dependency distance | Very high | Use the executable architecture graph, such as `web/CLI → presets → core`. |
| Information gain | Medium-high | Compare useful or retained facts with total text read; requires a gold reading set. |
| Verification cost | Very high | Count required focused tests, typechecks, boundary checks, docs gates, and full verify runs. |
| Single ARC/ARS score | Defer | Use only after enough benchmark data exists to justify weights. |

## Task routing model

The most actionable improvement is a task-to-owner routing table. The table
should be short enough to use as an index from `AGENTS.md`:

| Task class | First documents | Likely implementation scope | Minimum verification |
| --- | --- | --- | --- |
| Core behavior | Architecture, Core boundary rules | `packages/core/` and Core tests | Core tests, typecheck, `check:boundaries` |
| Preset behavior | Architecture, Presets ownership | `packages/presets/` and consuming tests | Preset tests plus one Web or CLI consumer path |
| Web UI | Architecture, Web responsibility rules | `packages/web/src/components/`, `hooks/`, `slice/`, or adapters | Focused Web tests and Web typecheck |
| CLI behavior | Engineering, CLI documentation policy | `packages/cli/` and CLI tests/docs | Focused CLI tests, typecheck, docs-impact matrix |
| Asset or attribution behavior | Architecture asset/credit sections | Core, CLI, Web owner identified by the flow | Attribution/export tests and relevant boundary checks |
| Plugin or release workflow | Engineering, releasing, plugin contract | `plugins/`, release scripts, package metadata | Plugin/release verification and affected package tests |
| Documentation-only change | The owning guide and target document | The target documentation surface | `git diff --check` and relevant documentation tests |

The table should route an agent to the owner first. It should not require the
agent to inspect every plan or spec before choosing a package.

## Agent Context Radius

Context radius should be measured over ownership and dependency layers, not
filesystem depth. For example, a Web component change may reasonably require:

```text
AGENTS.md
  → Architecture Web ownership
  → Web component or hook
  → pure slice/helper or adapter
  → focused test
  → relevant verification command
```

A task should be considered high-radius when it crosses several of these
layers, such as a CLI/Web asset-pack workflow that also touches Core schemas,
attribution, package format, and release documentation. High radius is not
automatically bad; it is a signal that the task needs an explicit plan and
ownership map.

## Information gain and retrieval quality

Information gain is best used as a quality metric after a small task corpus has
been established. For each task, record a gold set of sources that a competent
maintainer would expect an agent to consult. Then calculate:

```text
Document recall    = required sources opened / gold sources
Document precision = relevant sources opened / all sources opened
Token waste        = 1 - useful tokens / all tokens read
```

These are evaluation measures, not hard repository gates. A low-precision task
may indicate stale plans, ambiguous ownership, or a missing routing entry. A
low-recall task may indicate that `AGENTS.md` or a package guide does not expose
the correct entry point.

## Benchmark design

The first benchmark should use 10–20 representative tasks rather than synthetic
file-search questions. Include at least:

- one Core behavior change;
- one Presets change consumed by Web;
- one Web UI change involving a component, hook, and slice/helper;
- one CLI command change with documentation impact;
- one asset or attribution change;
- one plugin or release change;
- one documentation-only change;
- one cross-package architecture change.

For each task, record:

1. The task statement and expected owner.
2. The gold reading set: required policy, architecture, implementation, and
   test sources.
3. The agent's opened files, search queries, navigation steps, and tokens.
4. The final changed paths and package dependency radius.
5. The verification commands and elapsed time.
6. Whether the agent missed a required rule or read irrelevant material.

The benchmark should compare documentation revisions against the same task set.
It should not compare different tasks as if their costs were interchangeable.

## Verification cost and change impact

Documentation retrieval is only one part of agent cost. LPC Toolkit already has
strong executable signals that should be included in the profile:

- `pnpm check:boundaries` validates the architecture graph.
- `pnpm verify` is the common repository quality gate.
- CLI-sensitive changes require the eight-surface documentation matrix.
- Attribution must remain reachable through preview, render, download, and
  export paths.

For each task, record both the number of verification gates and the affected
ownership surfaces. This distinguishes a small documentation lookup from a
high-impact change that crosses Core, CLI, Web, assets, and release contracts.

## Possible future discussion path

### Phase 1: Explore routing

- Consider whether `AGENTS.md` should remain the short entry point.
- Consider adding the task routing table above or a link to its maintained
  version.
- Consider marking `docs/superpowers/` plans and specs as task-specific or
  historical.
- Consider package-owner links where a rule currently requires broad searching.

### Phase 2: Discuss a benchmark

- A future session could select 10–20 representative tasks.
- It could record gold reading sets and baseline cost vectors.
- It could measure document precision, recall, token waste, and verification
  burden.

### Phase 3: Consider documentation experiments

- Possible experiments include splitting documents when benchmark data shows
  high token waste or branching.
- Path-scoped guidance could be considered for recurring, high-cost task
  classes.
- Stale routing entries could be reviewed after confirming whether benchmark
  tasks still use them.

### Phase 4: Possible lightweight checks

Potential future checks include:

- every task class has an owner and first-document route;
- every package has an architecture owner and minimum verification command;
- historical plans are not presented as universal rules;
- changed CLI-sensitive paths have the required documentation declaration.

## Non-goals

- This document does not measure general model intelligence or coding quality.
- It does not assume that fewer opened documents always means better work.
- It does not replace code review, boundary checks, tests, or attribution checks.
- It does not recommend deleting historical plans solely because they have low
  retrieval value.
- It does not define a universal scalar score before benchmark data supports the
  weighting.

## Current discussion position

No adoption decision has been made. The vector cost profile and task routing
table are recorded here as discussion material. The concepts that seem most
worth revisiting are retrieval/token cost, navigation/branching cost,
context/dependency radius, and verification cost. A composite ARC/ARS score is
also only a future discussion topic, not a current project metric.
