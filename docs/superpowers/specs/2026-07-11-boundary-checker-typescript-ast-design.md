# Boundary Checker TypeScript AST Design

## Context

Plan 5 expanded `scripts/check-boundaries.mjs` with a dependency-free lexical
scanner. Repeated review found that JavaScript regex/division context and
dynamic-import expression boundaries cannot be handled reliably by the current
token heuristics. The repository already depends on TypeScript 5.7, so the
checker can use its parser without adding a dependency.

## Decision

Replace syntax-sensitive token scanning with the TypeScript compiler API. Parse
each `.js`, `.jsx`, `.ts`, and `.tsx` source file into a `SourceFile`, then walk
the AST to collect:

- static imports, dynamic imports, and export-from module specifiers;
- imported or re-exported `composeSelections` bindings;
- direct property access and destructuring tied to a dynamic core import;
- executable identifier references for forbidden runtime globals.

Keep filesystem traversal, package-boundary matching, rule ownership, error
messages, CLI behavior, and CI wiring unchanged. Remove the handwritten lexer
and helpers that become unused.

## Rule Semantics

- Comments, strings, template text, and regex literals are inert because they
  are not executable AST identifiers or import expressions.
- Expressions inside template substitutions remain executable and are walked.
- A concrete canvas package root and its package subpaths are forbidden.
- Component ownership rejects `composeSelections` only when it is imported,
  re-exported, accessed, or destructured from `@lpc-toolkit/core`; unrelated
  local identifiers remain legal.
- Existing boundary-aware workspace package matching and relative-path
  resolution remain authoritative.
- Parse diagnostics do not silently weaken enforcement: a file that cannot be
  parsed is reported by the checker with its path.

## Alternatives Considered

1. Continue extending the handwritten lexer. This minimizes the immediate diff
   but has already produced repeated regex/division and expression-boundary
   defects.
2. Narrow the enforced rules. This reduces parser complexity but weakens the
   approved architecture contract.
3. Use the existing TypeScript parser. This is selected because it recognizes
   the project language precisely and adds no package or license obligation.

## Verification

Use TDD. Before implementation, add fixtures covering:

- regex literals after `return`, `else`, `do`, and control-condition `)`;
- division followed by a forbidden import;
- parenthesized awaited dynamic-core property access;
- dynamic-core `.then()` callbacks with unrelated local names;
- all previously supported static, dynamic, export-from, template-expression,
  canvas-subpath, and runtime-global cases.

The change is complete when focused boundary/workflow tests, the repository
boundary checker, recursive workspace typecheck, full tests, and
`git diff --check` pass. No dependency, runtime source, asset, or `upstream/`
change is permitted.
