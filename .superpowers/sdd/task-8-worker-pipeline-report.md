## Task 8 implementation evidence

### RED

Command:

```sh
rtk pnpm --filter @lpc-toolkit/web test -- asset-pack-worker-session.test.ts asset-pack-worker-protocol.test.ts
```

The first sandbox attempt was blocked by the existing `tsx` pretest IPC pipe
(`listen EPERM`). The approved rerun reached Vitest and failed as required:
both Worker suites failed to load because
`asset-pack-worker-protocol.ts` and `asset-pack-worker-session.ts` did not yet
exist; 2 failed suites, 0 tests.

### GREEN

Product commit:

```text
ef58af4c8e3676ab549360801c6322bbc840c598 feat(web): validate asset packs in a worker
```

The implementation adds the serializable protocol, the in-memory session, the
Worker entry handler, baseline digest typing, and focused tests. The session
keeps archive/source bytes private, gates oversized files before `arrayBuffer`,
rejects unsafe archives without a session, supports repair/raw-manifest mode,
enforces monotonic revisions and acknowledgement governance, validates PNG/Core
and compatibility/credit results, produces error-free previews and release
fingerprints, caches read-back formal candidates by revision, and assembles
bounded draft/formal archives without returning an unreferenced byte map.

Exact verification:

```text
rtk pnpm --filter @lpc-toolkit/web test -- asset-pack-worker-session.test.ts asset-pack-worker-protocol.test.ts
PASS — 2 files, 13 tests

rtk pnpm --filter @lpc-toolkit/web test -- asset-pack-baseline.test.ts asset-pack-worker-session.test.ts asset-pack-worker-protocol.test.ts
PASS — 3 files, 14 tests

rtk pnpm --filter @lpc-toolkit/web run typecheck
PASS

rtk pnpm check:boundaries
PASS — Architecture boundary check passed.

rtk git diff --check
PASS
```

### Scope and caveats

Changed only the six requested Task 8 product/test paths. No Task 9 files,
dependencies, assets, caches, artist workspaces, or `upstream/` content changed.
The Worker entry bootstraps its handler from the first `open` request; the
main-thread client/orchestration remains Task 9 scope. The report commit is
separate from the product commit.

## Task 8 Important finding fixes — 2026-07-23

### RED evidence

Added focused regressions for the three Important findings, then ran:

```sh
rtk pnpm --filter @lpc-toolkit/web test -- asset-pack-worker-session.test.ts asset-pack-worker-protocol.test.ts
```

The approved rerun reached Vitest and failed as required: 2 files, 19 tests,
6 failures. The failures reproduced acknowledgement injection from invalid
state, unrelated acknowledgement-origin edits, same-revision async commits,
and source reads before oversized, unsafe-path, and source-entry-limit
rejection.

### GREEN evidence

Product commit:

```text
5ea8165d2da577539bb04dbfe8a38c9b0ff4db22 fix(web): harden asset pack worker revisions
```

The fix serializes session mutations, validates acknowledgement-origin edits
against candidates computed from the current valid state and an acknowledgement-
only manifest delta, and bounds canonical source paths, `File.size`, entry
count, and total bytes before reading and before committing source bytes.

Exact verification:

```text
rtk pnpm --filter @lpc-toolkit/web test -- asset-pack-worker-session.test.ts asset-pack-worker-protocol.test.ts
PASS — 2 files, 19 tests

rtk pnpm --filter @lpc-toolkit/web run typecheck
PASS

rtk pnpm check:boundaries
PASS — Architecture boundary check passed.

rtk git diff --check
PASS
```

The report update is intentionally a separate documentation commit. No Task 9
files, dependencies, plan files, assets, caches, artist workspaces, or
`upstream/` content changed.
