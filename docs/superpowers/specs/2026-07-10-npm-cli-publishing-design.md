# npm CLI Publishing Design

## Goal

Publish the existing CLI as the public npm package `@lpc-toolkit/cli` so a
Node 22+ user can install it globally and run it from any working directory:

```bash
npm install -g @lpc-toolkit/cli
lpc-toolkit --help
```

Commands that need LPC assets must automatically obtain the release pinned to
the installed CLI version. After that first download, the same CLI version must
work offline from a verified local cache. Rendering and export must continue to
produce the required credit and license metadata.

## Confirmed Registry State

The npm organization `lpc-toolkit` exists. The publishing account is an owner
of that organization, and `@lpc-toolkit/cli` was not present in the npm
registry when this design was approved on 2026-07-10. The package can therefore
retain its current scoped name.

The installed binary remains `lpc-toolkit`; the npm scope does not change the
terminal command name.

## Scope

This work includes:

- making `packages/cli` a public, production-ready npm package
- setting the first public version to `0.1.0`
- declaring Node 22 or newer as the supported runtime
- making the CLI independent of the monorepo checkout at runtime
- lazily downloading and caching the pinned LPC asset release
- reading spritesheet PNGs directly from cached category ZIP files
- testing packaged installs on Linux, macOS, and Windows
- bootstrapping the first npm release and configuring later OIDC releases
- documenting installation, cache behavior, attribution, and troubleshooting

## Non-Goals

- Do not publish `@lpc-toolkit/core` or `@lpc-toolkit/presets` in this work.
- Do not bundle the approximately 610 MB expanded `assets/` tree in npm.
- Do not add a backend, database, authentication service, or asset CDN.
- Do not modify the read-only `upstream/` submodule.
- Do not move filesystem, network, ZIP, or Node canvas behavior into core.
- Do not automatically track the newest upstream asset release at runtime.
- Do not add an `lpc` binary alias because it conflicts with the macOS system
  command.

## Chosen Approach

Publish a small CLI package and let asset-dependent commands lazily download
the exact GitHub asset release pinned by the CLI's bundled
`asset-release.json`.

Two alternatives were rejected:

1. Bundling expanded assets in the npm package would make every CLI release
   hundreds of megabytes and couple code-only updates to asset redistribution.
2. Publishing a separate asset npm package would add package-resolution and
   compatibility machinery without reducing the asset transfer or cache work.

The chosen approach keeps npm installation small, makes rendering reproducible,
and reuses the repository's existing release manifest and checksum model.

## Package Shape

`packages/cli/package.json` will retain the name `@lpc-toolkit/cli` and expose
only this binary:

```json
{
  "bin": {
    "lpc-toolkit": "./dist/index.js"
  }
}
```

The package metadata will:

- remove `private: true`
- use version `0.1.0` for the first public release
- declare `engines.node` as `>=22`
- declare `publishConfig.access` as `public`
- include an accurate description, keywords, repository, homepage, and bugs URL
- continue declaring `GPL-3.0-or-later`
- include a CLI-specific README and the built runtime allowlist only

The repository URL must exactly match
`https://github.com/ochowei/lpc-toolkit-2026-1` because npm Trusted Publishing
uses it for provenance validation.

The existing build continues to vendor the runtime output of
`@lpc-toolkit/core` and `@lpc-toolkit/presets` under `dist/vendor`. Their
workspace dependencies remain development-only, so users do not need separate
published core or preset packages. The build also copies the root
`asset-release.json` into `dist` as the installed CLI's immutable release pin.

No dependency is added by this design. Existing runtime dependencies
`@napi-rs/canvas` and `jszip` are MIT-licensed and compatible with the
project's GPL-3.0-or-later license.

## CLI Component Boundaries

Keep the new behavior in focused CLI-owned units:

- A release-config loader reads and validates the bundled pin.
- A cache-path resolver selects the platform default or environment override.
- An asset-cache manager owns downloads, integrity checks, safe extraction,
  staging, atomic publication, and cache validation.
- Directory and ZIP asset-store implementations provide the same logical
  `exists` and `load` operations to validation and rendering.
- The Node canvas adapter loads buffers supplied by the chosen asset store.
- The command layer decides whether a command needs assets and translates
  preparation failures into the existing response format.

These units depend on core types and contracts where appropriate, but core does
not import them. Download and filesystem functions remain injectable so tests
can use temporary directories and in-memory responses instead of production
network traffic.

## Asset Resolution

Asset-dependent commands resolve their base assets in this order:

1. Use a complete `assets/` tree in the current working directory when one is
   present. This preserves the existing repository-development workflow.
2. Otherwise, use the verified cache for the release tag bundled with the CLI.
3. If that cache is missing or invalid, prepare it before running the command.

`assets_custom/` remains a working-directory overlay and is not placed in the
managed cache.

`LPC_TOOLKIT_CACHE_DIR` overrides the managed cache root for CI, automation,
and troubleshooting. Without the override, the cache follows platform
conventions:

- macOS: `~/Library/Caches/lpc-toolkit`
- Windows: `%LOCALAPPDATA%/lpc-toolkit/Cache`
- Linux and other Unix systems: `${XDG_CACHE_HOME:-~/.cache}/lpc-toolkit`

Each pinned release lives under its own tag-named directory. Upgrading the CLI
may select a new release directory, while the installed CLI version never
silently switches to a newer asset release.

## Compressed Cache Layout

The downloaded outer `lpc-runtime-zips.tar.gz` is temporary. After validating
its configured SHA-256 digest, the CLI extracts the required inner files into a
staging directory:

- `zips/*.zip`, the category archives used at render time
- expanded `sheet_definitions/`
- expanded `palette_definitions/`
- `CREDITS.csv`
- the verified `asset-manifest.json`

The category ZIP files remain compressed. The CLI does not materialize the
approximately 603 MB spritesheet PNG tree. The resulting persistent cache is
approximately 212 MB: about 205 MB of category ZIPs plus about 7 MB of
definitions, credits, and manifest data.

After the staged cache passes validation, it is atomically moved into the
tag-named final location. The outer tarball and staging directory are deleted
on success or failure. Concurrent first runs may prepare separate staging
directories; only a fully validated directory can become the final cache, and
losing processes discard their staging output after validating the winner.

The existing safe extraction rules remain mandatory. Archive entries must not
be absolute paths and must not escape their target directory. A missing
`CREDITS.csv`, manifest mismatch, checksum mismatch, or missing required ZIP
invalidates the entire staged cache.

Outer tarball extraction reuses the repository's existing dependency-free
`tar` executable approach, including listing and validating every entry before
extraction. The supported-platform smoke tests verify this prerequisite on
Linux, macOS, and Windows. If `tar` is unavailable, preparation fails before
writing the final cache and reports the missing prerequisite explicitly.

## ZIP-Backed Node Adapter

The CLI gains a Node-owned asset store that maps a core spritesheet path such
as:

```text
spritesheets/body/bodies/male/walk/light.png
```

to the `body.zip` category archive and the entry:

```text
bodies/male/walk/light.png
```

Loaded `JSZip` instances are cached in memory for the life of the process. The
adapter reads only requested PNG entries as buffers and passes those buffers to
`@napi-rs/canvas`, whose `loadImage` API accepts buffers. Validation uses the
same asset store for path-existence checks instead of calling `existsSync` on
an expanded spritesheet path.

Core contracts remain unchanged and environment-agnostic. The concrete ZIP
lookup, filesystem cache, downloads, and Node canvas integration stay inside
`packages/cli`.

## Command Data Flow

Commands that do not need assets, including help and token-only conversion,
run immediately without checking the network or preparing the cache.

An asset-dependent command follows this flow:

```text
parse command
  -> prefer complete working-directory assets
  -> load bundled release config
  -> validate the tag-specific managed cache
  -> download and atomically prepare it when absent
  -> load catalog, palettes, and custom overlays
  -> validate selections through the asset store
  -> compose through the ZIP-backed Node adapter
  -> write pixels, metadata, credits, and license artifacts transactionally
```

An existing valid cache causes no network request. Offline execution therefore
works after one successful preparation for that release tag.

## Output and Error Handling

Download progress is written to stderr. This keeps stdout machine-readable when
`--json` is active. Successful JSON responses retain the existing response
schema.

Asset preparation failures return a nonzero exit code and a focused issue code,
including distinct cases for:

- download or HTTP failure
- manifest or checksum failure
- unsafe or malformed archive content
- missing required attribution data
- cache filesystem or disk-space failure
- missing image entry in a category ZIP

Human output uses the current human-response formatter introduced by commit
`eff2cdfeb`. JSON mode emits a structured command error and never prints
progress to stdout. Error messages identify the pinned release, cache path, and
safe retry action without suggesting that users bypass integrity verification.

The CLI never falls back to a checksum-mismatched cache, a partially populated
directory, or an unpinned latest release.

## Attribution and Licensing

Attribution remains correctness-critical:

- the release manifest must include `CREDITS.csv`
- cache preparation must validate that file before publishing the cache
- catalog definitions and rendered selections continue producing core credit
  manifests
- render and ZIP outputs continue including credit and effective-license files

The automatic asset path must not introduce a rendering or export route that
omits attribution metadata.

## Verification Strategy

### Unit Tests

Cover release-config parsing, SHA-256 checks, cache hit and miss behavior,
corrupt caches, unsafe archive entries, failed staging cleanup, concurrent
preparation, category/path mapping, missing ZIP entries, and buffer image
loading.

### CLI Integration Tests

Use temporary caches and injected downloads to verify catalog, selection,
preset, and render commands without downloading the production asset release.
Cover human and JSON failures, stderr-only progress, offline cache hits,
transactional render output, and required credit artifacts.

### Package Tests

Assert the package name, public access, version, Node engine, binary, repository
metadata, files allowlist, bundled release config, and vendored core/preset
runtime. Inspect `pnpm pack` output to ensure source, tests, and configuration
files are not unintentionally published.

### Cross-Platform Smoke Tests

On GitHub-hosted Ubuntu, macOS, and Windows runners with Node 22:

1. build and pack `@lpc-toolkit/cli`
2. install the produced tarball into an isolated prefix
3. resolve the installed `lpc-toolkit` binary
4. run `lpc-toolkit --help`
5. run focused mocked-cache tests on each platform

Ubuntu additionally performs one end-to-end download of the real pinned asset
release and one minimal render. That test must verify the configured checksums,
ZIP-backed image loading, and the emitted credit and license artifacts.

Run the repository boundary check, CLI typecheck, CLI tests, and the narrowest
relevant workspace build in addition to these package checks.

## Release Workflow

The first public release bootstraps the npm package:

1. merge the version and package-readiness changes after CI passes
2. create the matching `v0.1.0` Git tag
3. sign in to npm with the organization owner account and 2FA
4. publish from `packages/cli` with `npm publish --access public`
5. verify installation from the public registry in a clean directory

After the package exists, configure its npm Trusted Publisher with:

- GitHub organization/user: `ochowei`
- repository: `lpc-toolkit-2026-1`
- workflow filename: `publish.yml`
- allowed action: `npm publish`

Subsequent version tags trigger a GitHub-hosted publishing job with
`id-token: write` and `contents: read`. The job uses Node 22.14.0 or newer and
npm 11.5.1 or newer, verifies that the tag exactly matches the package version,
runs the release checks, and publishes without a long-lived npm token. Public
publishes from the public repository receive npm provenance automatically.

The release job must stop before publication if the tag/version check, package
contents, tests, boundary check, packaged install, attribution smoke test, or
build fails.

Official npm references:

- https://docs.npmjs.com/creating-and-publishing-an-organization-scoped-package/
- https://docs.npmjs.com/using-npm/scope.html
- https://docs.npmjs.com/trusted-publishers/

## Success Criteria

The design is complete when all of the following are true:

- `npm install -g @lpc-toolkit/cli` installs the `lpc-toolkit` command on Node
  22+ across the supported desktop platforms.
- Help and token-only commands work without an asset download.
- The first asset-dependent command downloads and verifies the pinned release,
  stores category ZIPs rather than expanded spritesheets, and completes from an
  arbitrary working directory.
- Repeating the same command with the network unavailable uses the verified
  cache successfully.
- A checksum mismatch or interrupted preparation leaves no usable partial
  cache.
- Rendered output includes the required credits and effective-license metadata.
- Later tagged releases publish through npm Trusted Publishing with provenance.

## Effect of the Latest Pulled Commits

The fast-forward from `caf660728` to merge commit `6ff0376c7` introduced the
human-readable CLI formatter in `eff2cdfeb`. It changed only
`packages/cli/src/main.ts`, `packages/cli/src/response.ts`, and human-output
tests. It did not change assets, package metadata, vendoring, or release
workflows. This design integrates asset preparation errors with that formatter;
no other adjustment is required because of those commits.
