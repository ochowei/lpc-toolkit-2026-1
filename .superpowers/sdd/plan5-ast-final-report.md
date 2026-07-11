# Plan 5 AST Final Report

- Focused boundary/workflow tests: PASS (2 files, 79 tests; 71 boundary and 8 workflow/package tests)
- Full tests: PASS (108 files, 932 passed, 1 skipped)
- Boundary checker: PASS
- Recursive workspace typecheck: PASS (4 projects: core, presets, CLI, web)
- Diff check: PASS
- Scope audit: PASS (`894277f67..HEAD` contains only the AST checker, boundary tests, and plan/evidence files; no manifests, lockfile, runtime source, assets, or `upstream/` changes)
- Final review: pending until reviewer response

The full and focused test commands required an out-of-sandbox rerun because
the `tsx` pretest IPC socket was denied by the sandbox. Both required reruns
exited `0`. The intentional CLI asset-store skip remains reported as skipped.
The untracked user file `docs/README-ARCHITECTURE-AUDIT.tmp.md` was preserved.
