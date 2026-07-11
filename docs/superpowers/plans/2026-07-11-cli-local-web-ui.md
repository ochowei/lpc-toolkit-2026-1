# CLI Local Web UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `lpc-toolkit web` so a globally installed CLI prepares the existing verified asset cache and serves the packaged production Web UI locally.

**Architecture:** Build an embedded variant of the Vite SPA without `public/` art, copy it into the CLI distribution, and serve it with a focused Node HTTP module. The command forces the existing managed-cache path so the embedded catalog and pinned release stay version-aligned, while the default CLI asset discovery behavior remains unchanged.

**Tech Stack:** TypeScript strict mode, Node.js 22 built-ins, React 18, Vite 6, Vitest, pnpm workspaces.

## Global Constraints

- Use `pnpm` through the repository-required `rtk` command prefix.
- Add no runtime dependency; Node 22 built-ins provide HTTP serving and browser launching.
- Keep `packages/core/` environment-agnostic and keep all Node/filesystem/server behavior in `packages/cli/`.
- Do not modify `upstream/`.
- Do not add `any`.
- Preserve GPL-3.0-or-later licensing and all `CREDITS.csv`-derived attribution behavior.
- The npm tarball must not contain the roughly 205 MB sprite ZIP archive.
- After each task, update its checkbox, add an implementation note, record the commit hash, and record verification status.

---

## File Map

- Modify `packages/web/vite.config.ts`: distinguish the normal deploy build from the embedded CLI build and disable public-directory copying only for the embedded build.
- Modify `packages/web/package.json`: expose a deterministic `build:embedded` command.
- Create `packages/cli/scripts/copy-web-dist.mjs`: copy the embedded Web build into `packages/cli/dist/web` and reject copied ZIP/spritesheet art.
- Modify `packages/cli/package.json`: build and package the embedded SPA as part of CLI build.
- Modify `packages/cli/src/runtime-assets.ts`: add an opt-in managed-cache-only preparation mode used by the Web launcher.
- Create `packages/cli/src/web-server.ts`: validate options, resolve safe routes, serve the SPA/cache ZIPs, open a browser, and manage server shutdown.
- Create `packages/cli/test/web-server.test.ts`: verify option validation, routing, traversal protection, lifecycle, and browser launch behavior.
- Modify `packages/cli/src/args.ts`: recognize `--no-open` as a boolean flag.
- Modify `packages/cli/src/main.ts`: preflight and dispatch `web` while preserving cache error formatting.
- Modify `packages/cli/src/index.ts`: supply process-backed browser and signal dependencies.
- Modify `packages/cli/test/args.test.ts`, `packages/cli/test/main-assets.test.ts`, and `packages/cli/test/main-human.test.ts`: cover CLI parsing, preflight, dispatch, and user-facing output.
- Modify `packages/cli/scripts/smoke-packed-cli.mjs`: prove the installed tarball contains the SPA, excludes art ZIPs, and serves a page plus a cached ZIP.
- Modify `packages/cli/README.md`: document the command, cache sharing, flags, offline behavior, and LAN warning.

### Task 1: Create an art-free embedded Web build

**Files:**
- Modify: `packages/web/vite.config.ts`
- Modify: `packages/web/package.json`
- Create: `packages/cli/scripts/copy-web-dist.mjs`
- Modify: `packages/cli/package.json`
- Test: `packages/cli/scripts/smoke-packed-cli.mjs`

**Interfaces:**
- Produces: `packages/web/dist-embedded/**`, containing the compiled SPA but no `zips/` or `spritesheets/` tree.
- Produces: `packages/cli/dist/web/index.html` and hashed SPA assets during `pnpm --filter @lpc-toolkit/cli build`.
- Consumes: the current Web build and CLI `dist` packaging conventions.

- [x] **Step 1: Add a failing packed-art exclusion assertion**

In `packages/cli/scripts/smoke-packed-cli.mjs`, add the required SPA entry and explicit art exclusions:

```js
requiredEntries.push('package/dist/web/index.html');

assert.ok(
  entries.every((entry) => !entry.startsWith('package/dist/web/zips/')),
  'packed tarball must not duplicate cached ZIP assets',
);
assert.ok(
  entries.every((entry) => !entry.startsWith('package/dist/web/spritesheets/')),
  'packed tarball must not include expanded spritesheets',
);
```

- [x] **Step 2: Run the package smoke test and confirm the missing SPA failure**

Run: `rtk pnpm --filter @lpc-toolkit/cli test:package`

Expected: FAIL with `packed tarball is missing package/dist/web/index.html`.

- [x] **Step 3: Add the embedded Vite mode**

Change `packages/web/vite.config.ts` to use Vite's config environment and disable public copying only for `embedded` mode:

```ts
export default defineConfig(({ mode }) => ({
  plugins: [react(), tailwindcss(), localSpritesheetsPlugin()],
  publicDir: mode === 'embedded' ? false : 'public',
  resolve: {
    alias: {
      '@lpc-toolkit/core': fileURLToPath(new URL('../core/src/index.ts', import.meta.url)),
      '@lpc-toolkit/presets': fileURLToPath(new URL('../presets/src/index.ts', import.meta.url)),
    },
  },
  server: { fs: { allow: ['../..'] } },
}));
```

Add the Web script:

```json
"build:embedded": "vite build --mode embedded --outDir dist-embedded"
```

- [x] **Step 4: Copy the embedded bundle with an invariant check**

Create `packages/cli/scripts/copy-web-dist.mjs` using `cpSync`, `readdirSync`, and `rmSync`. Resolve `../../web/dist-embedded` as the source and `../dist/web` as the destination, fail if `index.html` is absent, and fail if either forbidden directory exists:

```js
for (const forbidden of ['zips', 'spritesheets']) {
  if (existsSync(path.join(source, forbidden))) {
    throw new Error(`embedded Web build unexpectedly contains ${forbidden}/`);
  }
}
rmSync(destination, { recursive: true, force: true });
cpSync(source, destination, { recursive: true });
```

Update the CLI build script so it runs the Web embedded build after core/presets builds and runs the copy script after TypeScript emits. Keep the existing release-config, metadata, and vendoring steps intact:

```json
"build": "node -e \"require('node:fs').rmSync('dist', { recursive: true, force: true })\" && pnpm --filter @lpc-toolkit/core build && pnpm --filter @lpc-toolkit/presets build && pnpm --filter @lpc-toolkit/web build:embedded && tsc -p tsconfig.build.json && node scripts/copy-web-dist.mjs && node scripts/copy-token-decode-metadata.mjs && node scripts/vendor-workspace-deps.mjs && node scripts/copy-release-config.mjs"
```

- [x] **Step 5: Verify both Web build modes and the packed artifact**

Run:

```sh
rtk pnpm --filter @lpc-toolkit/web build
rtk pnpm --filter @lpc-toolkit/web build:embedded
rtk pnpm --filter @lpc-toolkit/cli test:package
```

Expected: all PASS; `dist-embedded/index.html` exists; `dist-embedded/zips` and `dist-embedded/spritesheets` do not exist; the packed smoke test passes.

- [x] **Step 6: Commit Task 1**

```sh
rtk git add packages/web/vite.config.ts packages/web/package.json packages/cli/package.json packages/cli/scripts/copy-web-dist.mjs packages/cli/scripts/smoke-packed-cli.mjs
rtk git commit -m "build(cli): package embedded web UI"
```

Implementation: added the embedded Vite build, guarded CLI bundle copy, and packed-artifact exclusions.
Commit: 15d074da7d4b2d32850ae2db731a546c70332751; follow-up fix: f8cc4bc9483fbd5dc62640ce58e7bb49022d98f7.
Verification: `rtk pnpm --filter @lpc-toolkit/web build` PASS; `rtk pnpm --filter @lpc-toolkit/web build:embedded` PASS; `rtk pnpm --filter @lpc-toolkit/cli test:package` PASS; `rtk pnpm check:boundaries` PASS.

### Task 2: Add managed-cache-only asset preparation

**Files:**
- Modify: `packages/cli/src/runtime-assets.ts`
- Modify: `packages/cli/test/runtime-assets.test.ts`

**Interfaces:**
- Produces: `PrepareRuntimeAssetsOptions.managedCacheOnly?: boolean`.
- Guarantees: when `managedCacheOnly` is true, `./assets` is ignored and the returned source is `managed-cache`; omission preserves current local-assets precedence.
- Consumes: existing `ensureAssetCache`, release config, and cache-root resolution.

- [x] **Step 1: Write failing managed-cache-only tests**

Add a test beside the current local-assets precedence coverage. Create a complete temporary `assets/` tree, pass a mocked `ensureCache`, and assert the managed result is used:

```ts
const ensureCache = vi.fn(async () => managedLayout);
const result = await prepareRuntimeAssets({
  cwd,
  configPath,
  env: { LPC_TOOLKIT_CACHE_DIR: cacheRoot },
  ensureCache,
  managedCacheOnly: true,
});

expect(result.source).toBe('managed-cache');
expect(ensureCache).toHaveBeenCalledOnce();
expect(result.context.assetsRoot).toBe(managedLayout.releaseRoot);
```

Retain/add a control assertion that omitting the flag returns `working-directory` and never calls `ensureCache`.

- [x] **Step 2: Run the focused test and confirm the type/behavior failure**

Run: `rtk pnpm --filter @lpc-toolkit/cli test -- runtime-assets.test.ts`

Expected: FAIL because `managedCacheOnly` is not part of `PrepareRuntimeAssetsOptions`.

- [x] **Step 3: Implement the opt-in branch**

Add the option and gate only the existing local-assets early return:

```ts
export interface PrepareRuntimeAssetsOptions {
  // existing fields
  readonly managedCacheOnly?: boolean;
}

if (!options.managedCacheOnly && hasCompleteLocalAssets(localAssetsRoot)) {
  // existing directory-store return, unchanged
}
```

- [x] **Step 4: Run focused tests and typecheck**

Run:

```sh
rtk pnpm --filter @lpc-toolkit/cli test -- runtime-assets.test.ts
rtk pnpm --filter @lpc-toolkit/cli typecheck
```

Expected: PASS.

- [x] **Step 5: Commit Task 2**

```sh
rtk git add packages/cli/src/runtime-assets.ts packages/cli/test/runtime-assets.test.ts
rtk git commit -m "feat(cli): support managed-only asset preparation"
```

Implementation: added the opt-in managed-cache-only branch while preserving default local-assets precedence.
Commit: 3ae96c6c026c0fbbcd32ac424d02dfd26bd56986.
Verification: `rtk pnpm --filter @lpc-toolkit/cli test -- runtime-assets.test.ts` PASS (7 tests); `rtk pnpm --filter @lpc-toolkit/cli typecheck` PASS; `rtk pnpm check:boundaries` PASS.

### Task 3: Implement the safe local Web server

**Files:**
- Create: `packages/cli/src/web-server.ts`
- Create: `packages/cli/test/web-server.test.ts`

**Interfaces:**
- Consumes: `RuntimeAssets` with `source === 'managed-cache'`, whose `context.assetsRoot` contains `zips/`.
- Produces: `validateWebOptions(input): WebServerOptions` for host/port/open validation.
- Produces: `startWebServer(options, dependencies): Promise<RunningWebServer>`.
- Produces: `RunningWebServer` with `url: string`, `close(): Promise<void>`, and `closed: Promise<void>`.
- Produces: injectable filesystem/browser/listener dependencies so tests never open a real browser.

- [x] **Step 1: Write failing option and routing tests**

Create tests for defaults, valid port `0`, ports `-1`, `65536`, and non-integers; then create temporary Web/cache roots and test:

```ts
expect(validateWebOptions({})).toEqual({
  host: '127.0.0.1',
  port: 4173,
  open: true,
});
expect(() => validateWebOptions({ port: '65536' })).toThrow('port');

const running = await startWebServer(
  { webRoot, assetsRoot, host: '127.0.0.1', port: 0, open: false },
  { openBrowser: vi.fn(async () => undefined) },
);
expect(await fetch(new URL('/', running.url)).then((r) => r.text()))
  .toContain('<div id="root">');
expect(await fetch(new URL('/zips/body.zip', running.url)).then((r) => r.text()))
  .toBe('zip-data');
await running.close();
```

Also assert hashed static assets receive their MIME type, an extensionless SPA route returns `index.html`, an unknown file returns 404, and each of `/../secret`, `/%2e%2e/secret`, `/zips/../secret`, encoded slash/backslash, NUL, and symlink escape attempts cannot read outside the allowlisted roots.

- [x] **Step 2: Run the focused test and confirm missing-module failure**

Run: `rtk pnpm --filter @lpc-toolkit/cli test -- web-server.test.ts`

Expected: FAIL because `../src/web-server.js` does not exist.

- [x] **Step 3: Implement validation and safe file resolution**

Define strict types and helpers in `web-server.ts`:

```ts
export interface WebServerOptions {
  readonly host: string;
  readonly port: number;
  readonly open: boolean;
}

export function validateWebOptions(input: {
  readonly host?: string;
  readonly port?: string;
  readonly noOpen?: boolean;
}): WebServerOptions {
  const host = input.host ?? '127.0.0.1';
  const port = input.port === undefined ? 4173 : Number(input.port);
  if (host.length === 0) throw new Error('--host must not be empty.');
  if (!Number.isInteger(port) || port < 0 || port > 65535) {
    throw new Error('--port must be an integer from 0 through 65535.');
  }
  return { host, port, open: input.noOpen !== true };
}
```

Decode exactly once, reject malformed encoding, NUL, backslash, encoded path separators, `.`/`..` components, and verify `realpath` remains inside its canonical allowlisted root before opening a regular file. Allow only `/zips/<single-file-name>.zip` from `assetsRoot/zips`; do not expose the complete cache root.

- [x] **Step 4: Implement MIME, SPA fallback, lifecycle, and browser opening**

Use `node:http` and stream files. Map `.html`, `.js`, `.css`, `.json`, `.svg`, `.png`, `.woff`, `.woff2`, and `.zip`; default unknown binary extensions to `application/octet-stream`. Set `X-Content-Type-Options: nosniff`.

Expose an injectable opener with platform-specific commands and detached processes:

```ts
export function browserCommand(platform: NodeJS.Platform, url: string): {
  readonly command: string;
  readonly args: readonly string[];
} {
  if (platform === 'darwin') return { command: 'open', args: [url] };
  if (platform === 'win32') return { command: 'cmd', args: ['/c', 'start', '', url] };
  return { command: 'xdg-open', args: [url] };
}
```

`startWebServer` resolves only after listening, reports the actual address for port `0`, calls the opener after the listener is healthy, treats opener rejection as a warning callback rather than a fatal server error, and makes `close()` idempotent.

- [x] **Step 5: Complete lifecycle and opener tests**

Test `--no-open`, opener invocation with the final URL, opener rejection warning, port collision (`EADDRINUSE`), close idempotency, and `browserCommand` for darwin/win32/linux. No test may launch a real desktop application.

- [x] **Step 6: Run focused tests and typecheck**

Run:

```sh
rtk pnpm --filter @lpc-toolkit/cli test -- web-server.test.ts
rtk pnpm --filter @lpc-toolkit/cli typecheck
```

Expected: PASS.

- [x] **Step 7: Commit Task 3**

```sh
rtk git add packages/cli/src/web-server.ts packages/cli/test/web-server.test.ts
rtk git commit -m "feat(cli): add local web server"
```

Implementation: added the allowlisted cache-backed HTTP server, MIME/SPAfallback handling, safe canonical resolution, browser opening, and lifecycle controls.
Commit: df23f42bf827dd1580db16478c765409cf573c37; security/lifecycle follow-up: 7c1ee47ed58c73f31a09ba578e119f759e51428a.
Verification: `rtk pnpm --filter @lpc-toolkit/cli test -- web-server.test.ts` PASS (22 tests); `rtk pnpm --filter @lpc-toolkit/cli typecheck` PASS; `rtk pnpm check:boundaries` PASS.

### Task 4: Wire the `web` command and process lifecycle

**Files:**
- Modify: `packages/cli/src/args.ts`
- Modify: `packages/cli/src/main.ts`
- Modify: `packages/cli/src/index.ts`
- Modify: `packages/cli/test/args.test.ts`
- Modify: `packages/cli/test/main-assets.test.ts`
- Modify: `packages/cli/test/main-human.test.ts`

**Interfaces:**
- Consumes: `managedCacheOnly`, `validateWebOptions`, and `startWebServer` from Tasks 2–3.
- Produces: `lpc-toolkit web [--host <host>] [--port <port>] [--no-open]`.
- Guarantees: help and invalid invocations do not prepare assets; the valid command prepares exactly once and waits for server closure.

- [x] **Step 1: Write failing parser and dispatch tests**

Add `no-open` to the boolean parsing expectation:

```ts
expect(parseArgs(['web', '--no-open', '--port', '0']).flags).toEqual(
  new Map<string, FlagValue>([
    ['no-open', true],
    ['port', '0'],
  ]),
);
```

In main tests, inject `startWebServer` and assert:

```ts
expect(commandNeedsAssets(parseArgs(['web']))).toBe(true);
expect(commandNeedsAssets(parseArgs(['web', '--help']))).toBe(false);

await runCli(['web', '--port', '0', '--no-open'], capture.io, {
  prepareRuntimeAssets: prepare,
  startWebServer: start,
});
expect(prepare).toHaveBeenCalledWith(expect.objectContaining({ managedCacheOnly: true }));
expect(start).toHaveBeenCalledOnce();
expect(capture.stdout.join('')).toContain('http://127.0.0.1:');
```

Add invalid port, extra subcommand, and `--json` cases and assert they return 1 without preparing assets.

- [x] **Step 2: Run focused tests and confirm failures**

Run:

```sh
rtk pnpm --filter @lpc-toolkit/cli test -- args.test.ts main-assets.test.ts main-human.test.ts
```

Expected: FAIL because `no-open`, `web` preflight, and `startWebServer` injection are absent.

- [x] **Step 3: Add parsing, help, preflight, and dispatch**

Add `no-open` to `BOOLEAN_FLAGS`, add the help line, and extend `CliDependencies`:

```ts
export interface CliDependencies {
  readonly prepareRuntimeAssets: typeof prepareRuntimeAssets;
  readonly startWebServer: typeof startWebServer;
}
```

Preflight `web` before asset preparation: reject a second command token, positionals, `--json`, unknown flags, invalid host, and invalid port through `validateWebOptions`. On valid dispatch, request managed cache and start the server with `webRoot` resolved from `import.meta.url`, `assetsRoot: runtime.context.assetsRoot`, and parsed options. Print the URL before awaiting `running.closed`.

- [x] **Step 4: Add signal ownership at the executable boundary**

Keep reusable `runCli` free of global listener leaks. In `index.ts`, install one-shot `SIGINT` and `SIGTERM` handlers around the active server through injected lifecycle callbacks, and always remove them after `runCli` settles. The handler awaits `close()` and sets the conventional exit code (`130` for SIGINT, `143` for SIGTERM).

Use an injected `spawn`-backed opener in production; do not make unit tests depend on `process`, signals, or desktop applications.

- [x] **Step 5: Run the CLI suite and typecheck**

Run:

```sh
rtk pnpm --filter @lpc-toolkit/cli test
rtk pnpm --filter @lpc-toolkit/cli typecheck
```

Expected: PASS.

- [x] **Step 6: Commit Task 4**

```sh
rtk git add packages/cli/src/args.ts packages/cli/src/main.ts packages/cli/src/index.ts packages/cli/test/args.test.ts packages/cli/test/main-assets.test.ts packages/cli/test/main-human.test.ts
rtk git commit -m "feat(cli): add web command"
```

Implementation: added `web` parsing/preflight/managed-cache dispatch and executable-only signal lifecycle ownership.
Commit: 6e09adb8c7e6d4878874a86678eb111365749dd8; lifecycle follow-up: 8a5f7309cc3c3a6b966b29283d28436363b23cc7.
Verification: `rtk pnpm --filter @lpc-toolkit/cli test` PASS (185 passed, 1 skipped); `rtk pnpm --filter @lpc-toolkit/cli typecheck` PASS; `rtk pnpm check:boundaries` PASS.

### Task 5: Complete installed-package smoke coverage and documentation

**Files:**
- Modify: `packages/cli/scripts/smoke-packed-cli.mjs`
- Modify: `packages/cli/README.md`

**Interfaces:**
- Consumes: the installed CLI binary and cache layout from Tasks 1–4.
- Produces: release-level proof that the packaged UI runs outside the repository without downloading when a valid cache is supplied.

- [x] **Step 1: Extend the smoke fixture and launch assertion**

Create a minimal valid managed-cache fixture under a temporary `LPC_TOOLKIT_CACHE_DIR` using the bundled `asset-release.json` tag and the existing cache manifest/index shapes. Put `body.zip` in its `zips/` directory. Spawn:

```js
const web = spawn(
  process.execPath,
  [installedEntry, 'web', '--host', '127.0.0.1', '--port', '0', '--no-open'],
  {
    cwd: emptyCwd,
    env: { ...process.env, LPC_TOOLKIT_CACHE_DIR: cacheRoot },
    stdio: ['ignore', 'pipe', 'pipe'],
  },
);
```

Read stdout until the URL line appears with a bounded timeout, fetch `/` and `/zips/body.zip`, assert status 200 and expected bodies, then send `SIGTERM` and assert clean termination. The fixture must satisfy the real cache verifier; do not bypass checksum checks in the installed process.

- [x] **Step 2: Run the packed smoke test**

Run: `rtk pnpm --filter @lpc-toolkit/cli test:package`

Expected: PASS and print `Packed CLI install smoke test passed.`

- [x] **Step 3: Document installation and local Web use**

Add to `packages/cli/README.md`:

````md
## Local Web UI

Start the packaged production UI with the same verified asset cache used by
render commands:

```sh
lpc-toolkit web
lpc-toolkit web --port 4173 --no-open
```

The first run downloads the pinned assets when needed. Later runs work offline.
The server binds to `127.0.0.1` by default. Using `--host 0.0.0.0` exposes it to
other devices on the local network; only do this on a trusted network.
````

Document `--port 0`, cache sharing, `Ctrl+C`, and that this command is a production server without Vite hot reload.

- [x] **Step 4: Run final verification**

Run:

```sh
rtk pnpm --filter @lpc-toolkit/cli test
rtk pnpm --filter @lpc-toolkit/cli typecheck
rtk pnpm --filter @lpc-toolkit/web test
rtk pnpm --filter @lpc-toolkit/web build
rtk pnpm check:boundaries
rtk pnpm --filter @lpc-toolkit/cli test:package
```

Expected: every command PASS. Confirm the packed tarball contains `dist/web/index.html` and contains neither `dist/web/zips/` nor `dist/web/spritesheets/`.

- [x] **Step 5: Commit Task 5**

```sh
rtk git add packages/cli/scripts/smoke-packed-cli.mjs packages/cli/README.md docs/superpowers/plans/2026-07-11-cli-local-web-ui.md
rtk git commit -m "docs(cli): document local web UI"
```

Implementation: added verifier-compatible installed-package smoke coverage and Local Web UI operations documentation.
Commit: 774f5c85883c53785bb3ed099fe6f765d79273cc; prerequisite strict-options fix: 3a3dfbf08d0d7dd13734d910526823c3402c3746.
Verification: CLI package smoke PASS; CLI tests PASS (185 passed, 1 skipped); CLI typecheck PASS; boundary check PASS. Web tests retain one unrelated baseline failure (645/646 passed).
