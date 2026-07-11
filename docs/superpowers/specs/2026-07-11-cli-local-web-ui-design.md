# CLI Local Web UI Design

## Goal

Allow a globally installed `@lpc-toolkit/cli` to launch the production Web UI
without a repository checkout:

```sh
lpc-toolkit web
```

The CLI and Web UI must share the CLI's existing verified asset cache. The npm
package includes the compiled Web application but does not duplicate the roughly
205 MB compressed art archive. The first `web` invocation downloads the pinned
asset release when the cache is absent; subsequent invocations work offline.

## Success Criteria

- `npm install -g @lpc-toolkit/cli` installs everything except the separately
  cached art release needed to run the UI.
- `lpc-toolkit web` works outside the monorepo and prepares assets through the
  same cache path and integrity checks as existing asset-dependent CLI commands.
- A valid existing cache causes no download and is usable by both rendering
  commands and the Web UI.
- The local server defaults to loopback, serves the compiled SPA and cached
  assets, preserves attribution behavior, and shuts down cleanly.
- The feature adds no runtime dependency and does not weaken package boundaries.

## Considered Approaches

### 1. Bundled SPA with cache-backed asset routes (selected)

Publish the compiled Web application inside the CLI package. A Node HTTP server
serves those static files and maps narrowly defined asset routes to the verified
CLI cache. This avoids duplicate art, reuses existing download and verification
logic, and keeps the installed command independent of Vite.

### 2. Copy cached assets into a separate Web directory

This simplifies static serving but duplicates a large asset set, requires copy
lifecycle management, and can leave stale data. It is rejected.

### 3. Expose assets through a new application API

The browser could request catalog and image data through a custom JSON/image
API. This offers flexibility but introduces an unnecessary protocol and a larger
Web refactor. It is rejected for the initial feature.

## Architecture

### Release packaging

The CLI build produces the Web production bundle as a release artifact and
places it under the CLI's published `dist` tree. The package's `files` allowlist
continues to publish only `dist` and documentation. The Web bundle is built
against the same pinned asset release configuration shipped by that CLI version.

The published package does not include sprite ZIPs. Existing license metadata
and attribution behavior remain mandatory; adding the launcher must not bypass
the `CREDITS.csv`-derived data used by Web rendering and export.

### Command boundary

`packages/cli` owns command parsing, cache preparation, HTTP serving, browser
launching, filesystem access, and process signals. Web code remains browser-only,
and `packages/core` gains no Node, HTTP, filesystem, or DOM dependency.

The `web` command calls the existing `prepareRuntimeAssets()` entry point before
listening. It consumes the returned verified runtime locations rather than
reimplementing asset discovery or validation. This gives it the same managed
cache and release identity used by CLI render commands.

### HTTP server

The server uses Node 22 built-ins. It serves:

- compiled HTML, JavaScript, CSS, fonts, and other files from the packaged Web
  distribution;
- the exact ZIP, definition, palette, manifest, index, and credit resources
  required by the Web runtime from verified runtime asset locations;
- `index.html` as an SPA fallback only for browser navigation routes.

Static and cache-backed routes use explicit roots, normalized paths, allowlisted
resource families, correct MIME types, and traversal checks. Missing files and
unsupported paths return 404. Unexpected server failures return 500 without
exposing arbitrary filesystem paths.

The server does not run Vite and does not provide hot reload.

## Command Interface

```text
lpc-toolkit web
lpc-toolkit web --port 4173
lpc-toolkit web --host 127.0.0.1
lpc-toolkit web --no-open
```

- Host defaults to `127.0.0.1`.
- Port defaults to `4173`; port `0` requests an operating-system-selected port.
- The command opens the final URL in the default browser unless `--no-open` is
  present.
- Explicit non-loopback hosts such as `0.0.0.0` are supported and produce a
  warning that the UI is reachable from other machines on the network.
- `--json` is rejected for this long-running interactive command.
- Invalid host/port values, asset preparation failures, browser-launch failures,
  and listen failures produce actionable stderr output. Fatal failures return a
  nonzero exit code.
- A browser-launch failure does not stop an otherwise healthy server; the URL is
  printed so the user can open it manually.
- Port conflicts fail explicitly rather than silently selecting another port.
- `SIGINT` and `SIGTERM` close the listener and release resources.

## Runtime Flow

1. Parse and validate `web` flags without preparing assets for help or invalid
   invocations.
2. Prepare or verify runtime assets with `prepareRuntimeAssets()`, preserving its
   progress output and checksum enforcement.
3. Resolve the packaged Web distribution relative to the installed CLI module.
4. Start the HTTP server on the requested host and port.
5. Print the actual local URL, including the assigned port when `--port 0` is
   used.
6. Open the URL unless disabled, then remain active until a termination signal
   or fatal listener error.

## Scope

The initial implementation serves the production UI and the CLI version's
pinned release. It does not add development hot reload, a backend API, auth, or
remote hosting.

Dynamic support for arbitrary `assets_custom/` definitions is excluded. The
current Web catalog is compiled by Vite, so promising runtime overlays would
require a separate catalog-loading design. Existing CLI behavior for local and
custom assets must not regress.

## Verification

- Parser and help tests cover `web`, `--port`, `--host`, `--no-open`, invalid
  values, and the unsupported `--json` combination.
- Cache orchestration tests prove that `web` uses `prepareRuntimeAssets()` and
  that a valid cache does not invoke a download path.
- HTTP tests cover packaged files, cache-backed resources, MIME types, SPA
  fallback, 404 behavior, and encoded/plain path traversal attempts.
- Lifecycle tests cover port conflicts, port `0`, browser-open success/failure,
  `--no-open`, and graceful shutdown.
- Packed-package smoke tests install the npm tarball in a temporary location,
  confirm the Web distribution is included, launch with a controlled prepared
  cache, and fetch a page plus a representative cached resource.
- Run package-scoped tests and typechecks, Web tests/build, `pnpm
  check:boundaries`, and the packed CLI smoke suite using the repository's `rtk`
  command prefix.

