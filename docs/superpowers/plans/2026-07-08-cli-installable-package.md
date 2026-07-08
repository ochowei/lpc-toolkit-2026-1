# CLI Installable Package Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `@lpc-toolkit/cli` build into an installable terminal command named `lpc-toolkit`, supporting pnpm global link and tarball install workflows.

**Architecture:** Keep CLI runtime behavior in `packages/cli/`; this change only tightens package metadata, displayed command names, packaging contents, and documentation. `packages/core/` remains environment-agnostic, and no new dependencies are introduced.

**Tech Stack:** TypeScript strict mode, pnpm workspaces, Vitest, Node `fs/path` for package metadata tests, existing CLI entrypoint.

---

## File Structure

- Modify `packages/cli/package.json`: expose only the `lpc-toolkit` bin, clean `dist/` before build, and define package contents with `files`.
- Modify `packages/cli/src/main.ts`: update help examples from `lpc` to `lpc-toolkit`.
- Modify `packages/cli/test/smoke.test.ts`: update help expectation to the new command name.
- Create `packages/cli/test/package-metadata.test.ts`: guard the bin name and package allowlist.
- Modify `README.md`: replace the old CLI inspection command and document both install workflows.
- Do not modify `upstream/`.

## Task 1: Guard Package Metadata

**Files:**
- Create: `packages/cli/test/package-metadata.test.ts`
- Modify: `packages/cli/package.json`

- [x] **Step 1: Write the failing metadata test**

Create `packages/cli/test/package-metadata.test.ts`:

```ts
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

interface CliPackageJson {
  readonly bin?: Record<string, string>;
  readonly files?: readonly string[];
  readonly scripts?: Record<string, string>;
}

function readCliPackageJson(): CliPackageJson {
  const testDir = path.dirname(fileURLToPath(import.meta.url));
  const packageJsonPath = path.resolve(testDir, '../package.json');
  return JSON.parse(readFileSync(packageJsonPath, 'utf8')) as CliPackageJson;
}

describe('CLI package metadata', () => {
  it('exposes only the lpc-toolkit command', () => {
    const packageJson = readCliPackageJson();

    expect(packageJson.bin).toEqual({
      'lpc-toolkit': './dist/index.js',
    });
    expect(packageJson.bin).not.toHaveProperty('lpc');
  });

  it('packs only runtime artifacts and required metadata', () => {
    const packageJson = readCliPackageJson();

    expect(packageJson.files).toEqual(['dist']);
    expect(packageJson.files).not.toContain('src');
    expect(packageJson.files).not.toContain('test');
    expect(packageJson.files).not.toContain('tsconfig.json');
    expect(packageJson.files).not.toContain('tsconfig.build.json');
  });

  it('cleans dist before building package output', () => {
    const packageJson = readCliPackageJson();

    expect(packageJson.scripts?.build).toContain('node -e');
    expect(packageJson.scripts?.build).toContain('rmSync');
    expect(packageJson.scripts?.build).toContain('dist');
    expect(packageJson.scripts?.build).toContain('tsc -p tsconfig.build.json');
  });
});
```

- [x] **Step 2: Run the metadata test to verify it fails**

Run:

```bash
rtk pnpm --filter @lpc-toolkit/cli test -- package-metadata.test.ts
```

Expected: FAIL. The current `bin` still exposes `lpc`, `files` is missing, and the build script does not clean `dist/`.

- [x] **Step 3: Update `packages/cli/package.json`**

Replace the current `bin` and `scripts.build`, and add `files`:

```json
{
  "name": "@lpc-toolkit/cli",
  "version": "0.0.0",
  "private": true,
  "license": "GPL-3.0-or-later",
  "type": "module",
  "bin": {
    "lpc-toolkit": "./dist/index.js"
  },
  "files": [
    "dist"
  ],
  "scripts": {
    "build": "node -e \"require('node:fs').rmSync('dist', { recursive: true, force: true })\" && pnpm --filter @lpc-toolkit/core build && pnpm --filter @lpc-toolkit/presets build && tsc -p tsconfig.build.json",
    "typecheck": "tsc -p tsconfig.json --noEmit",
    "test": "vitest run"
  },
  "dependencies": {
    "@lpc-toolkit/core": "workspace:*",
    "@lpc-toolkit/presets": "workspace:*",
    "@napi-rs/canvas": "^1.0.0",
    "jszip": "^3.10.1"
  },
  "devDependencies": {
    "@types/node": "^25.8.0",
    "tsx": "^4.19.2"
  }
}
```

This uses Node's built-in `fs.rmSync`, so no cleanup dependency is added.

- [x] **Step 4: Run the metadata test to verify it passes**

Run:

```bash
rtk pnpm --filter @lpc-toolkit/cli test -- package-metadata.test.ts
```

Expected: PASS.

- [x] **Step 5: Commit package metadata guard**

Run:

```bash
rtk git add packages/cli/package.json packages/cli/test/package-metadata.test.ts
rtk git commit -m "test(cli): guard installable package metadata"
```

Add the implementation note under this step after committing:

```markdown
  - Commit: <hash>
  - Verification: `rtk pnpm --filter @lpc-toolkit/cli test -- package-metadata.test.ts` PASS
```

  - Implementation note: Added a Vitest guard for CLI package metadata and updated the package to expose only `lpc-toolkit`, pack `dist`, and clean `dist` before build.
  - Commit: 5b1e7581ac3d5bd5a081ac6057d1a6ff4bb6705d
  - Verification: `rtk pnpm --filter @lpc-toolkit/cli test -- package-metadata.test.ts` PASS

## Task 2: Rename Displayed CLI Command

**Files:**
- Modify: `packages/cli/test/smoke.test.ts`
- Modify: `packages/cli/src/main.ts`
- Modify: `README.md`

- [x] **Step 1: Update the help smoke test first**

In `packages/cli/test/smoke.test.ts`, change the help assertion from:

```ts
expect(writes.join('')).toContain('lpc catalog types');
```

to:

```ts
expect(writes.join('')).toContain('lpc-toolkit catalog types');
expect(writes.join('')).not.toContain('  lpc catalog types');
```

  - Implementation note: Updated the CLI help smoke assertion to require the displayed `lpc-toolkit` command and reject the stale indented `lpc` example without leaving a stale displayed literal in test source.
  - Commit: 8a48676f6a4c88943dd7eeb2c0d33899bcc49e74
  - Verification: `rtk pnpm --filter @lpc-toolkit/cli test -- smoke.test.ts` FAIL as expected before help update

- [x] **Step 2: Run the smoke test to verify it fails**

Run:

```bash
rtk pnpm --filter @lpc-toolkit/cli test -- smoke.test.ts
```

Expected: FAIL because help still displays `lpc catalog types`.

  - Implementation note: Confirmed the updated smoke assertion fails against the old displayed `lpc` help examples.
  - Commit: 8a48676f6a4c88943dd7eeb2c0d33899bcc49e74
  - Verification: `rtk pnpm --filter @lpc-toolkit/cli test -- smoke.test.ts` FAIL as expected

- [x] **Step 3: Update CLI help text**

In `packages/cli/src/main.ts`, replace the `HELP` block with:

```ts
const HELP = `lpc-toolkit CLI

Commands:
  lpc-toolkit catalog types
  lpc-toolkit catalog items --type <typeName>
  lpc-toolkit catalog item <item-id-or-type/name>
  lpc-toolkit selection validate --selection <file>
  lpc-toolkit render --selection <file> --out <dir>
  lpc-toolkit token decode --token <hash-or-token> --out <file>
  lpc-toolkit token encode --selection <file>
  lpc-toolkit preset list
  lpc-toolkit preset materialize <preset-id> --out <file>
  lpc-toolkit preset render <preset-id> --out <dir>
`;
```

  - Implementation note: Replaced all displayed command names in the CLI help block with `lpc-toolkit` while leaving argument parsing untouched.
  - Commit: 8a48676f6a4c88943dd7eeb2c0d33899bcc49e74
  - Verification: `rtk pnpm --filter @lpc-toolkit/cli test -- smoke.test.ts package-metadata.test.ts` PASS

- [x] **Step 4: Update README CLI usage**

In `README.md`, replace the current CLI inspection block:

```markdown
To build and inspect the CLI locally:

```bash
pnpm --filter @lpc-toolkit/cli build
pnpm --filter @lpc-toolkit/cli exec lpc --help
```
```

with:

````markdown
To build and inspect the CLI locally:

```bash
pnpm --filter @lpc-toolkit/cli build
node packages/cli/dist/index.js --help
```

To install the CLI for local development:

```bash
pnpm build
pnpm --filter @lpc-toolkit/cli link --global
lpc-toolkit --help
```

To verify the package as an installable tarball:

```bash
pnpm build
pnpm --filter @lpc-toolkit/cli pack --pack-destination /tmp
pnpm add -g /tmp/lpc-toolkit-cli-0.0.0.tgz
lpc-toolkit --help
```
````

Then in the `@lpc-toolkit/cli` section of `README.md`, replace the command list:

```markdown
- catalog exploration: `lpc catalog types`, `lpc catalog items --type <typeName>`
- selection validation: `lpc selection validate --selection <file>`
- token conversion: `lpc token encode --selection <file>`, `lpc token decode --token <hash-or-token> --out <file>`
- presets: `lpc preset list`, `lpc preset materialize <preset-id> --out <file>`, `lpc preset render <preset-id> --out <dir>`
- rendering: `lpc render --selection <file> --out <dir>`
```

with:

```markdown
- catalog exploration: `lpc-toolkit catalog types`, `lpc-toolkit catalog items --type <typeName>`
- selection validation: `lpc-toolkit selection validate --selection <file>`
- token conversion: `lpc-toolkit token encode --selection <file>`, `lpc-toolkit token decode --token <hash-or-token> --out <file>`
- presets: `lpc-toolkit preset list`, `lpc-toolkit preset materialize <preset-id> --out <file>`, `lpc-toolkit preset render <preset-id> --out <dir>`
- rendering: `lpc-toolkit render --selection <file> --out <dir>`
```

  - Implementation note: Updated README CLI inspection, local link, tarball verification, and package command examples to use the installable `lpc-toolkit` command.
  - Commit: 8a48676f6a4c88943dd7eeb2c0d33899bcc49e74
  - Verification: stale-example search returned no matches; `rtk pnpm --filter @lpc-toolkit/cli test -- smoke.test.ts package-metadata.test.ts` PASS

- [x] **Step 5: Search for stale user-facing `lpc` CLI examples**

Run:

```bash
rtk rg -n "exec lpc|`lpc |  lpc |lpc --help" README.md packages/cli/src packages/cli/test
```

Expected: no matches for stale displayed examples. The package metadata test may still contain the string `'lpc'` in `not.toHaveProperty('lpc')`, which is intentional and outside this search pattern.

  - Implementation note: Searched README, CLI source, and CLI tests for stale displayed `lpc` examples after the rename.
  - Commit: 8a48676f6a4c88943dd7eeb2c0d33899bcc49e74
  - Verification: ``rtk rg -n 'exec lpc|`lpc |  lpc |lpc --help' README.md packages/cli/src packages/cli/test`` returned no matches

- [x] **Step 6: Run focused CLI tests**

Run:

```bash
rtk pnpm --filter @lpc-toolkit/cli test -- smoke.test.ts package-metadata.test.ts
```

Expected: PASS.

  - Implementation note: Ran the focused CLI test command after the help/docs rename.
  - Commit: 8a48676f6a4c88943dd7eeb2c0d33899bcc49e74
  - Verification: `rtk pnpm --filter @lpc-toolkit/cli test -- smoke.test.ts package-metadata.test.ts` PASS

- [x] **Step 7: Commit displayed command rename**

Run:

```bash
rtk git add README.md packages/cli/src/main.ts packages/cli/test/smoke.test.ts
rtk git commit -m "docs(cli): use lpc-toolkit command name"
```

Add the implementation note under this step after committing:

```markdown
  - Commit: <hash>
  - Verification: `rtk pnpm --filter @lpc-toolkit/cli test -- smoke.test.ts package-metadata.test.ts` PASS
```

  - Implementation note: Created the displayed command rename implementation commit.
  - Commit: 8a48676f6a4c88943dd7eeb2c0d33899bcc49e74
  - Verification: `rtk pnpm --filter @lpc-toolkit/cli test -- smoke.test.ts package-metadata.test.ts` PASS

## Task 3: Verify Build, Pack, And Install Path

**Files:**
- Modify: `docs/superpowers/plans/2026-07-08-cli-installable-package.md`

- [x] **Step 1: Run CLI build**

Run:

```bash
rtk pnpm --filter @lpc-toolkit/cli build
```

Expected: PASS. `packages/cli/dist/index.js` exists and starts with `#!/usr/bin/env node`.

  - Implementation note: Built the CLI package and confirmed `packages/cli/dist/index.js` exists with the expected Node shebang.
  - Commit: 92e86cd28d0db3234795b7e3414cb5bb68ae4632
  - Verification: `rtk pnpm --filter @lpc-toolkit/cli build` PASS; `rtk ls -l packages/cli/dist/index.js` PASS; `rtk sed -n '1p' packages/cli/dist/index.js` returned `#!/usr/bin/env node`

- [x] **Step 2: Verify direct built CLI execution**

Run:

```bash
rtk node packages/cli/dist/index.js --help
```

Expected: PASS and stdout contains `lpc-toolkit catalog types`.

  - Implementation note: Ran the built CLI entrypoint directly through Node and confirmed the help text advertises the installable `lpc-toolkit` command.
  - Commit: 92e86cd28d0db3234795b7e3414cb5bb68ae4632
  - Verification: `rtk node packages/cli/dist/index.js --help` PASS; stdout contained `lpc-toolkit catalog types`

- [x] **Step 3: Run CLI tests**

Run:

```bash
rtk pnpm --filter @lpc-toolkit/cli test
```

Expected: PASS.

  - Implementation note: Ran the full CLI Vitest suite after the package build.
  - Commit: 92e86cd28d0db3234795b7e3414cb5bb68ae4632
  - Verification: `rtk pnpm --filter @lpc-toolkit/cli test` PASS; 13 test files and 46 tests passed

- [x] **Step 4: Pack the CLI tarball**

Run:

```bash
rtk pnpm --filter @lpc-toolkit/cli pack --pack-destination /tmp
```

Expected: PASS and output includes `/tmp/lpc-toolkit-cli-0.0.0.tgz`.

  - Implementation note: Packed the CLI package to `/tmp` and confirmed pnpm produced the expected tarball path.
  - Commit: 92e86cd28d0db3234795b7e3414cb5bb68ae4632
  - Verification: `rtk pnpm --filter @lpc-toolkit/cli pack --pack-destination /tmp` PASS; output included `/tmp/lpc-toolkit-cli-0.0.0.tgz`

- [x] **Step 5: Inspect packed contents**

Run:

```bash
rtk tar -tf /tmp/lpc-toolkit-cli-0.0.0.tgz
```

Expected: output includes:

```text
package/package.json
package/dist/index.js
```

Expected: output does not include:

```text
package/src/
package/test/
package/tsconfig.json
package/tsconfig.build.json
```

  - Implementation note: Inspected the packed tarball and confirmed it includes runtime package metadata and the executable entrypoint while excluding source, tests, and TypeScript config files.
  - Commit: 92e86cd28d0db3234795b7e3414cb5bb68ae4632
  - Verification: `rtk tar -tf /tmp/lpc-toolkit-cli-0.0.0.tgz` PASS; include check found `package/package.json` and `package/dist/index.js`; exclude check found no matches for `package/src/`, `package/test/`, `package/tsconfig.json`, or `package/tsconfig.build.json`

- [x] **Step 6: Try one global install workflow when allowed**

Prefer local development install first:

```bash
rtk pnpm add -g "$PWD/packages/cli"
rtk lpc-toolkit --help
```

Expected: `lpc-toolkit --help` exits 0 and prints `lpc-toolkit catalog types`.

If global link is blocked by sandboxing or machine configuration, try tarball install instead:

```bash
rtk pnpm add -g /tmp/lpc-toolkit-cli-0.0.0.tgz
rtk lpc-toolkit --help
```

Expected: `lpc-toolkit --help` exits 0 and prints `lpc-toolkit catalog types`.

If both global workflows are blocked, do not invent another install path. Record the blocker under this step and rely on Steps 1-5 plus direct Node execution as fallback verification.

  - Implementation note: Attempted the originally planned global workflows. The filtered global link was rejected by pnpm before linking. The tarball global install was retried with escalation after an initial sandbox write failure, then pnpm refused the install because `/Users/william/Library/pnpm/bin` is not in PATH. A final review found the single CLI tarball still depended on unpublished workspace packages, so a post-review correction vendors the built `@lpc-toolkit/core` and `@lpc-toolkit/presets` runtime output into the CLI `dist/` and verifies local-directory and single-tarball global installs in temporary PNPM_HOME directories.
  - Commit: 92e86cd28d0db3234795b7e3414cb5bb68ae4632
  - Verification: original `rtk pnpm --filter @lpc-toolkit/cli link --global` BLOCKED with `Unknown option: 'recursive'`; sandboxed `rtk pnpm add -g /tmp/lpc-toolkit-cli-0.0.0.tgz` BLOCKED with `EPERM: operation not permitted, mkdir '/Users/william/Library/pnpm/bin'`; escalated `rtk pnpm add -g /tmp/lpc-toolkit-cli-0.0.0.tgz` BLOCKED with `The configured global bin directory "/Users/william/Library/pnpm/bin" is not in PATH`; post-review temporary global install `rtk env PNPM_HOME=/tmp/lpc-toolkit-pnpm-home-cli-dir2 ... pnpm add -g /Users/william/gitRepo/lpc-toolkit-2026-1/packages/cli --global-dir /tmp/lpc-toolkit-pnpm-global-cli-dir2` PASS and `lpc-toolkit --help` PASS; post-review temporary tarball install `rtk env PNPM_HOME=/tmp/lpc-toolkit-pnpm-home-cli-tgz2 ... pnpm add -g /tmp/lpc-toolkit-cli-0.0.0.tgz --global-dir /tmp/lpc-toolkit-pnpm-global-cli-tgz2` PASS and `lpc-toolkit --help` PASS

- [x] **Step 7: Run boundary check**

Run:

```bash
rtk pnpm check:boundaries
```

Expected: PASS. This change touches CLI and README only, but the repository rules request boundary verification for architecture-sensitive areas.

  - Implementation note: Ran the repository architecture boundary check after CLI packaging verification.
  - Commit: 92e86cd28d0db3234795b7e3414cb5bb68ae4632
  - Verification: `rtk pnpm check:boundaries` PASS

- [x] **Step 8: Commit final verification note if the plan file was updated**

If implementation notes were added to this plan file, commit them:

```bash
rtk git add docs/superpowers/plans/2026-07-08-cli-installable-package.md
rtk git commit -m "docs: record cli install verification"
```

Add the implementation note under this step after committing:

```markdown
  - Commit: <hash>
  - Verification: build PASS; direct CLI help PASS; CLI tests PASS; pack PASS; pack contents PASS; boundary check PASS; global install PASS or documented blocker
```

  - Implementation note: Recorded Task 3 verification results, including the sandbox blocker for global install, in this plan file.
  - Commit: 92e86cd28d0db3234795b7e3414cb5bb68ae4632
  - Verification: build PASS; direct CLI help PASS; CLI tests PASS; pack PASS; pack contents PASS; boundary check PASS; original global install BLOCKED by pnpm global bin PATH configuration and documented; post-review temporary local-directory and tarball global installs PASS

## Post-Review Fix: Self-Contained CLI Tarball

Final review found that the CLI tarball was not actually self-installable
because the packed manifest rewrote workspace dependencies to unpublished
`@lpc-toolkit/core@0.0.0` and `@lpc-toolkit/presets@0.0.0` registry
dependencies.

- [x] Vendor workspace runtime output into CLI package output
  - Implementation note: Added `packages/cli/scripts/vendor-workspace-deps.mjs`, updated the CLI build to copy built core/presets output into `packages/cli/dist/vendor/@lpc-toolkit`, rewrote compiled runtime imports to relative vendored imports, and moved workspace packages from CLI runtime dependencies to devDependencies.
  - Commit: ffd9f3fee4cc0331e9a2269b389678bb3ef15263
  - Verification: `rtk env CI=true pnpm --filter @lpc-toolkit/cli build` PASS; `rtk node packages/cli/dist/index.js --help` PASS

- [x] Verify single CLI tarball install
  - Implementation note: Packed the corrected CLI package and installed `/tmp/lpc-toolkit-cli-0.0.0.tgz` into a temporary PNPM_HOME/global-dir, then ran the installed `lpc-toolkit --help` shim successfully.
  - Commit: ffd9f3fee4cc0331e9a2269b389678bb3ef15263
  - Verification: `rtk env CI=true pnpm --filter @lpc-toolkit/cli pack --pack-destination /tmp --json` PASS; `rtk env PNPM_HOME=/tmp/lpc-toolkit-pnpm-home-cli-tgz2 ... pnpm add -g /tmp/lpc-toolkit-cli-0.0.0.tgz --global-dir /tmp/lpc-toolkit-pnpm-global-cli-tgz2` PASS; `rtk env PNPM_HOME=/tmp/lpc-toolkit-pnpm-home-cli-tgz2 ... lpc-toolkit --help` PASS

- [x] Verify local directory global install
  - Implementation note: Replaced the invalid filtered global link workflow with a local directory install using the absolute CLI package path, verified in a temporary PNPM_HOME/global-dir.
  - Commit: ffd9f3fee4cc0331e9a2269b389678bb3ef15263
  - Verification: `rtk env PNPM_HOME=/tmp/lpc-toolkit-pnpm-home-cli-dir2 ... pnpm add -g /Users/william/gitRepo/lpc-toolkit-2026-1/packages/cli --global-dir /tmp/lpc-toolkit-pnpm-global-cli-dir2` PASS; `rtk env PNPM_HOME=/tmp/lpc-toolkit-pnpm-home-cli-dir2 ... lpc-toolkit --help` PASS
