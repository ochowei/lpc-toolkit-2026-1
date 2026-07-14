# LPC Toolkit Codex Plugin Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a repository-hosted Codex plugin that any user with a compatible `@lpc-toolkit/cli` installation can install and use for reliable, attributed LPC character authoring.

**Architecture:** Keep `@lpc-toolkit/cli` as the only execution and product-logic layer. Add a lightweight plugin under `plugins/lpc-toolkit/` that bundles one character-authoring skill, a deterministic CLI compatibility check, command-contract references, and install metadata; expose it through the repository marketplace without adding MCP, hooks, or a second CLI implementation.

**Tech Stack:** Codex plugin manifest and marketplace JSON, Agent Skills Markdown/YAML, Node.js 22 built-ins, Vitest for CLI contract coverage, pnpm 9, strict TypeScript, SVG presentation assets.

## Global Constraints

- Invoke the `plugin-creator` skill before Task 1 because this work creates a Codex plugin; use it to validate the required plugin shape, then keep the exact repository paths and behavior defined in this plan.
- Use Node.js 22 or newer and pnpm 9; prefix every repository terminal command with `rtk`.
- Add no dependency. If a discovered requirement truly needs one, stop and ask first, state its license, and update the approved design before proceeding.
- Keep the plugin in this monorepo under `plugins/lpc-toolkit/`; do not create another repository.
- Keep `@lpc-toolkit/cli` external to the plugin. The plugin must not install, vendor, wrap, or duplicate it.
- Support CLI versions `>=0.1.3-alpha-1 <0.2.0` in plugin version `0.1.0`.
- Do not add MCP servers, apps, hooks, backend services, authentication, or authorization.
- Do not modify, initialize, or require `upstream/`.
- Every preview, render, bundle, or export workflow must verify metadata plus TXT and CSV attribution artifacts.
- Treat `--allow-partial` as opt-in behavior requiring an explicit user reason.
- Keep `packages/core/` environment-agnostic and run `rtk pnpm check:boundaries` before handoff.
- After every completed task, check its plan items, add an implementation note, record the related full commit hash, and record every exact verification command with PASS or FAIL.

---

## File Structure

- Create `.agents/plugins/marketplace.json`: repository marketplace catalog exposing the plugin.
- Create `plugins/lpc-toolkit/.codex-plugin/plugin.json`: required plugin manifest and install-surface metadata.
- Create `plugins/lpc-toolkit/assets/icon.svg`: compact plugin icon.
- Create `plugins/lpc-toolkit/assets/logo.svg`: larger plugin logo.
- Create `plugins/lpc-toolkit/skills/character-authoring/SKILL.md`: focused Codex workflow and safety rules.
- Create `plugins/lpc-toolkit/skills/character-authoring/agents/openai.yaml`: skill display metadata and implicit-invocation policy.
- Create `plugins/lpc-toolkit/skills/character-authoring/scripts/check-cli.mjs`: deterministic external CLI presence/version check.
- Create `plugins/lpc-toolkit/skills/character-authoring/references/compatibility.md`: supported-version and recovery policy.
- Create `plugins/lpc-toolkit/skills/character-authoring/references/cli-workflow.md`: exact agent workflow and JSON command examples.
- Create `plugins/lpc-toolkit/skills/character-authoring/references/cli-contract.json`: machine-readable command examples consumed by tests.
- Create `plugins/lpc-toolkit/test/check-cli.test.mjs`: Node unit tests for compatibility logic.
- Create `scripts/verify-codex-plugin.mjs`: repository-local manifest, path, and forbidden-component verifier.
- Create `scripts/verify-codex-plugin.test.mjs`: Node unit tests for the verifier.
- Create `packages/cli/test/plugin-contract.test.ts`: validates every plugin command example against the CLI parser and command specification.
- Modify `package.json`: add `verify:plugin` and include it in the common `verify` gate.
- Modify `README.md`: document beta marketplace and plugin installation.
- Modify `packages/cli/README.md`: document the CLI prerequisite and Codex plugin installation.
- Modify `docs/ARCHITECTURE.md`: record plugin/skill ownership and the external-CLI boundary.
- Modify `docs/ENGINEERING.md`: own plugin checks and CI mapping.
- Modify `packages/cli/test/package-metadata.test.ts`: lock CLI README installation guidance.
- Modify `packages/web/test/readme-architecture-docs.test.ts`: lock root docs, engineering, and architecture ownership.
- Modify `.github/workflows/ci.yml`: include plugin paths in change detection for the CLI package job.
- Modify this plan after each task to record checkbox, implementation, commit, and verification evidence.

### Task 1: Add The Installable Plugin And Repository Marketplace

**Files:**
- Create: `.agents/plugins/marketplace.json`
- Create: `plugins/lpc-toolkit/.codex-plugin/plugin.json`
- Create: `plugins/lpc-toolkit/assets/icon.svg`
- Create: `plugins/lpc-toolkit/assets/logo.svg`
- Create: `plugins/lpc-toolkit/skills/character-authoring/SKILL.md`
- Create: `plugins/lpc-toolkit/skills/character-authoring/agents/openai.yaml`
- Create: `scripts/verify-codex-plugin.mjs`
- Create: `scripts/verify-codex-plugin.test.mjs`

**Interfaces:**
- Consumes: Codex plugin manifest and marketplace formats; the installed `lpc-toolkit` binary name.
- Produces: plugin id `lpc-toolkit`, marketplace id `lpc-toolkit`, skill id `lpc-character-authoring`, and exported `validatePluginRepository(repoRoot): string[]` for structural tests.

- [x] **Step 1: Invoke the plugin authoring workflow**

Invoke `$plugin-creator` for a local repository plugin named `lpc-toolkit` with one bundled skill and a repository marketplace entry. Do not accept generated MCP, app, hook, dependency, or separate-repository files. Compare its required manifest fields with the exact files below.

  - Implementation: Used the repository-local plugin-creator scaffold with only skill, asset, and marketplace components; confirmed MCP, app, hook, dependency, and separate-repository components are absent.

- [x] **Step 2: Write the failing verifier tests**

  - Implementation: Added structural fixture coverage for the intended lightweight plugin and forbidden MCP, app, and hook components.

Create `scripts/verify-codex-plugin.test.mjs`:

```js
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { validatePluginRepository } from './verify-codex-plugin.mjs';

function write(root, relativePath, contents) {
  const target = path.join(root, relativePath);
  mkdirSync(path.dirname(target), { recursive: true });
  writeFileSync(target, contents);
}

function validFixture() {
  const root = mkdtempSync(path.join(os.tmpdir(), 'lpc-plugin-verifier-'));
  write(root, '.agents/plugins/marketplace.json', JSON.stringify({
    name: 'lpc-toolkit',
    plugins: [{
      name: 'lpc-toolkit',
      source: { source: 'local', path: './plugins/lpc-toolkit' },
      policy: { installation: 'AVAILABLE', authentication: 'ON_INSTALL' },
      category: 'Developer Tools',
    }],
  }));
  write(root, 'plugins/lpc-toolkit/.codex-plugin/plugin.json', JSON.stringify({
    name: 'lpc-toolkit',
    version: '0.1.0',
    description: 'Create attributed LPC characters with the installed CLI.',
    license: 'GPL-3.0-or-later',
    skills: './skills/',
    interface: {
      composerIcon: './assets/icon.svg',
      logo: './assets/logo.svg',
    },
  }));
  write(root, 'plugins/lpc-toolkit/skills/character-authoring/SKILL.md', `---\nname: lpc-character-authoring\ndescription: Create LPC characters.\n---\n`);
  write(root, 'plugins/lpc-toolkit/assets/icon.svg', '<svg xmlns="http://www.w3.org/2000/svg"/>\n');
  write(root, 'plugins/lpc-toolkit/assets/logo.svg', '<svg xmlns="http://www.w3.org/2000/svg"/>\n');
  return root;
}

test('accepts the intended lightweight plugin structure', () => {
  const root = validFixture();
  try {
    assert.deepEqual(validatePluginRepository(root), []);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('rejects forbidden MCP, app, and hook components', () => {
  const root = validFixture();
  try {
    write(root, 'plugins/lpc-toolkit/.mcp.json', '{}\n');
    write(root, 'plugins/lpc-toolkit/.app.json', '{}\n');
    write(root, 'plugins/lpc-toolkit/hooks/hooks.json', '{}\n');
    assert.deepEqual(validatePluginRepository(root), [
      'plugins/lpc-toolkit/.mcp.json is forbidden in the first plugin version.',
      'plugins/lpc-toolkit/.app.json is forbidden in the first plugin version.',
      'plugins/lpc-toolkit/hooks is forbidden in the first plugin version.',
    ]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
```

- [x] **Step 3: Run the verifier test to confirm RED**

Run:

```sh
rtk node --test scripts/verify-codex-plugin.test.mjs
```

Expected: FAIL because `scripts/verify-codex-plugin.mjs` does not exist.

  - Verification: `rtk node --test scripts/verify-codex-plugin.test.mjs` FAIL as expected with `ERR_MODULE_NOT_FOUND` for `scripts/verify-codex-plugin.mjs`.

- [x] **Step 4: Implement the structural verifier**

  - Implementation: Added `validatePluginRepository(repoRoot)` plus the executable repository validation entry point.

Create `scripts/verify-codex-plugin.mjs`:

```js
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

function readJson(target, errors, label) {
  try {
    return JSON.parse(readFileSync(target, 'utf8'));
  } catch (error) {
    errors.push(`${label} must contain valid JSON: ${error instanceof Error ? error.message : String(error)}`);
    return undefined;
  }
}

function requireFile(root, relativePath, errors) {
  if (!existsSync(path.join(root, relativePath))) errors.push(`${relativePath} is missing.`);
}

export function validatePluginRepository(repoRoot) {
  const errors = [];
  const pluginRelative = 'plugins/lpc-toolkit';
  const pluginRoot = path.join(repoRoot, pluginRelative);
  const manifestPath = path.join(pluginRoot, '.codex-plugin/plugin.json');
  const marketplacePath = path.join(repoRoot, '.agents/plugins/marketplace.json');

  requireFile(repoRoot, `${pluginRelative}/.codex-plugin/plugin.json`, errors);
  requireFile(repoRoot, '.agents/plugins/marketplace.json', errors);
  if (errors.length > 0) return errors;

  const manifest = readJson(manifestPath, errors, 'plugin manifest');
  const marketplace = readJson(marketplacePath, errors, 'repository marketplace');
  if (!manifest || !marketplace) return errors;

  if (manifest.name !== 'lpc-toolkit') errors.push('plugin manifest name must be lpc-toolkit.');
  if (manifest.version !== '0.1.0') errors.push('plugin manifest version must be 0.1.0.');
  if (manifest.license !== 'GPL-3.0-or-later') errors.push('plugin manifest license must be GPL-3.0-or-later.');
  if (manifest.skills !== './skills/') errors.push('plugin manifest skills must point to ./skills/.');

  const skillRoot = path.join(pluginRoot, String(manifest.skills ?? ''));
  const skillFiles = existsSync(skillRoot)
    ? readdirSync(skillRoot, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => path.join(skillRoot, entry.name, 'SKILL.md'))
      .filter(existsSync)
    : [];
  if (skillFiles.length !== 1) errors.push('plugin must contain exactly one bundled skill.');

  for (const field of ['composerIcon', 'logo']) {
    const relative = manifest.interface?.[field];
    if (typeof relative !== 'string' || !existsSync(path.join(pluginRoot, relative))) {
      errors.push(`plugin interface ${field} must point to an existing asset.`);
    }
  }

  if (marketplace.name !== 'lpc-toolkit') errors.push('marketplace name must be lpc-toolkit.');
  const entries = Array.isArray(marketplace.plugins) ? marketplace.plugins : [];
  const entry = entries.find((candidate) => candidate?.name === 'lpc-toolkit');
  if (!entry) {
    errors.push('marketplace must expose the lpc-toolkit plugin.');
  } else {
    if (entry.source?.source !== 'local' || entry.source?.path !== './plugins/lpc-toolkit') {
      errors.push('marketplace plugin source must be ./plugins/lpc-toolkit.');
    }
    if (entry.policy?.installation !== 'AVAILABLE') errors.push('marketplace installation policy must be AVAILABLE.');
    if (entry.policy?.authentication !== 'ON_INSTALL') errors.push('marketplace authentication policy must be ON_INSTALL.');
  }

  for (const relativePath of ['.mcp.json', '.app.json', 'hooks']) {
    if (existsSync(path.join(pluginRoot, relativePath))) {
      errors.push(`${pluginRelative}/${relativePath} is forbidden in the first plugin version.`);
    }
  }
  return errors;
}

const currentFile = fileURLToPath(import.meta.url);
if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  const repoRoot = path.resolve(path.dirname(currentFile), '..');
  const errors = validatePluginRepository(repoRoot);
  if (errors.length > 0) {
    process.stderr.write(`${errors.map((error) => `- ${error}`).join('\n')}\n`);
    process.exitCode = 1;
  } else {
    process.stdout.write('Codex plugin structure is valid.\n');
  }
}
```

- [x] **Step 5: Add the manifest, marketplace, assets, and initial skill**

  - Implementation: Added plugin and marketplace metadata, both SVG presentation assets, and the single character-authoring skill with OpenAI interface metadata.

Create `.agents/plugins/marketplace.json`:

```json
{
  "name": "lpc-toolkit",
  "interface": {
    "displayName": "LPC Toolkit Plugins"
  },
  "plugins": [
    {
      "name": "lpc-toolkit",
      "source": {
        "source": "local",
        "path": "./plugins/lpc-toolkit"
      },
      "policy": {
        "installation": "AVAILABLE",
        "authentication": "ON_INSTALL"
      },
      "category": "Developer Tools"
    }
  ]
}
```

Create `plugins/lpc-toolkit/.codex-plugin/plugin.json`:

```json
{
  "name": "lpc-toolkit",
  "version": "0.1.0",
  "description": "Create, edit, preview, and render attributed LPC characters through the installed LPC Toolkit CLI.",
  "author": {
    "name": "LPC Toolkit maintainers",
    "url": "https://github.com/ochowei/lpc-toolkit-2026-1"
  },
  "homepage": "https://github.com/ochowei/lpc-toolkit-2026-1#command-line-interface",
  "repository": "https://github.com/ochowei/lpc-toolkit-2026-1",
  "license": "GPL-3.0-or-later",
  "keywords": ["lpc", "sprites", "characters", "game-assets", "cli"],
  "skills": "./skills/",
  "interface": {
    "displayName": "LPC Toolkit",
    "shortDescription": "Create attributed LPC characters with the CLI",
    "longDescription": "Guide Codex through catalog search, character editing, validation, visual preview, and attributed sprite rendering with the installed LPC Toolkit CLI.",
    "developerName": "LPC Toolkit maintainers",
    "category": "Developer Tools",
    "capabilities": ["Read", "Write"],
    "websiteURL": "https://github.com/ochowei/lpc-toolkit-2026-1",
    "defaultPrompt": [
      "Create an LPC character from the farmer preset and help me refine the outfit.",
      "Change my LPC character's hair, preview it, and render an attributed ZIP bundle."
    ],
    "brandColor": "#315B3A",
    "composerIcon": "./assets/icon.svg",
    "logo": "./assets/logo.svg"
  }
}
```

Create `plugins/lpc-toolkit/assets/icon.svg`:

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" role="img" aria-label="LPC Toolkit">
  <rect width="64" height="64" rx="12" fill="#315B3A"/>
  <rect x="20" y="10" width="24" height="16" fill="#F2C38B"/>
  <rect x="16" y="26" width="32" height="22" fill="#D8E7C5"/>
  <rect x="10" y="30" width="8" height="16" fill="#F2C38B"/>
  <rect x="46" y="30" width="8" height="16" fill="#F2C38B"/>
  <rect x="20" y="48" width="9" height="10" fill="#6B4933"/>
  <rect x="35" y="48" width="9" height="10" fill="#6B4933"/>
  <rect x="24" y="16" width="4" height="4" fill="#243029"/>
  <rect x="36" y="16" width="4" height="4" fill="#243029"/>
</svg>
```

Create `plugins/lpc-toolkit/assets/logo.svg`:

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 96" role="img" aria-label="LPC Toolkit">
  <rect width="320" height="96" rx="16" fill="#F4F0E4"/>
  <rect x="18" y="14" width="68" height="68" rx="12" fill="#315B3A"/>
  <rect x="40" y="24" width="24" height="16" fill="#F2C38B"/>
  <rect x="34" y="40" width="36" height="24" fill="#D8E7C5"/>
  <rect x="40" y="64" width="10" height="12" fill="#6B4933"/>
  <rect x="56" y="64" width="10" height="12" fill="#6B4933"/>
  <text x="104" y="48" fill="#243029" font-family="ui-monospace, monospace" font-size="28" font-weight="700">LPC Toolkit</text>
  <text x="104" y="70" fill="#315B3A" font-family="ui-sans-serif, sans-serif" font-size="14">Attributed character authoring</text>
</svg>
```

Create `plugins/lpc-toolkit/skills/character-authoring/SKILL.md`:

```markdown
---
name: lpc-character-authoring
description: Use when creating, editing, validating, previewing, or rendering LPC characters through the installed lpc-toolkit CLI. Do not use for unrelated image editing or non-LPC sprites.
---

# LPC Character Authoring

Use `lpc-toolkit` as the only source of catalog, selection, validation, render,
and attribution behavior.

1. Run `lpc-toolkit --version`. If the executable is missing, stop and provide
   the documented npm installation command; never install it silently.
2. Use `--json` for every agent-consumed command that supports it.
3. Start from a named character or explicit `--selection` file, never both.
4. Search narrowly by character type and query before selecting an exact item.
5. Apply one edit, validate, and resolve structured errors before continuing.
6. Preview and inspect the returned PNG when visual review is available.
7. Render only after validation succeeds.
8. Verify metadata, credits TXT, and credits CSV before reporting success.

Do not bypass cache integrity, modify `upstream/`, suppress attribution, or use
`--allow-partial` unless the user explicitly accepts partial output.
```

Create `plugins/lpc-toolkit/skills/character-authoring/agents/openai.yaml`:

```yaml
interface:
  display_name: "LPC Character Authoring"
  short_description: "Create and render attributed LPC characters"
  default_prompt: "Create an LPC character, preview it, and render the requested attributed artifacts."
policy:
  allow_implicit_invocation: true
```

- [x] **Step 6: Run focused verification**

Run:

```sh
rtk node --test scripts/verify-codex-plugin.test.mjs
rtk node scripts/verify-codex-plugin.mjs
rtk git diff --check
```

Expected: PASS; the verifier prints `Codex plugin structure is valid.`

  - Verification: `rtk node --test scripts/verify-codex-plugin.test.mjs` PASS (2 tests).
  - Verification: `rtk node scripts/verify-codex-plugin.mjs` PASS (`Codex plugin structure is valid.`).
  - Verification: `rtk git diff --check` PASS.
  - Verification: `rtk env PYTHONPATH=/tmp/lpc-plugin-validator-pyyaml python3 /Users/william/.codex/skills/.system/plugin-creator/scripts/validate_plugin.py plugins/lpc-toolkit` PASS.
  - Verification: `rtk env PYTHONPATH=/tmp/lpc-plugin-validator-pyyaml python3 /Users/william/.codex/skills/.system/skill-creator/scripts/quick_validate.py plugins/lpc-toolkit/skills/character-authoring` PASS.
  - Verification: `rtk pnpm verify` PASS (core 171, presets 3, CLI 301 with 1 skipped, web 680 with 1 skipped; existing missing-asset/catalog warning noise only).

- [x] **Step 7: Commit and record Task 1 evidence**

```sh
rtk git add .agents/plugins/marketplace.json plugins/lpc-toolkit scripts/verify-codex-plugin.mjs scripts/verify-codex-plugin.test.mjs docs/superpowers/plans/2026-07-14-lpc-toolkit-codex-plugin.md
rtk git commit -m "feat(plugin): scaffold LPC Toolkit Codex plugin"
```

Update this task with the full commit hash, a short implementation note, and the exact PASS/FAIL results before committing.

  - Commit: b5da568231c2b8c2099769e463c9d2a636515b32
  - Implementation: The repository now exposes installable plugin id `lpc-toolkit`, marketplace id `lpc-toolkit`, and bundled skill id `lpc-character-authoring`, guarded by structural tests and validation.
  - Review fix commit: 3f03cc7b66cc736add8670b09ac7d03408732c30
  - Review fix: Require explicit request or acceptance plus a stated reason recorded in the workflow before using `--allow-partial`; lock the requirement with a static regression assertion.
  - Review fix RED: `rtk node --test scripts/verify-codex-plugin.test.mjs` FAIL as expected (2 passed, 1 failed) because the existing skill text did not require or record a reason.
  - Review fix verification: `rtk node --test scripts/verify-codex-plugin.test.mjs` PASS (3 tests).
  - Review fix verification: `rtk node scripts/verify-codex-plugin.mjs` PASS (`Codex plugin structure is valid.`).
  - Review fix verification: `rtk env PYTHONPATH=/tmp/lpc-plugin-validator-pyyaml python3 /Users/william/.codex/skills/.system/skill-creator/scripts/quick_validate.py plugins/lpc-toolkit/skills/character-authoring` PASS.
  - Review fix verification: `rtk env PYTHONPATH=/tmp/lpc-plugin-validator-pyyaml python3 /Users/william/.codex/skills/.system/plugin-creator/scripts/validate_plugin.py plugins/lpc-toolkit` PASS.
  - Review fix verification: `rtk git diff --check` PASS.

### Task 2: Add Deterministic CLI Compatibility Checking

**Files:**
- Create: `plugins/lpc-toolkit/skills/character-authoring/scripts/check-cli.mjs`
- Create: `plugins/lpc-toolkit/skills/character-authoring/references/compatibility.md`
- Create: `plugins/lpc-toolkit/test/check-cli.test.mjs`
- Modify: `plugins/lpc-toolkit/skills/character-authoring/SKILL.md`

**Interfaces:**
- Consumes: external `lpc-toolkit --version` stdout.
- Produces: `SUPPORTED_CLI`, `compareSemver(left, right)`, `evaluateVersion(output)`, and `checkCli({ binary, versionArgs, spawn })`; command JSON with `ok`, `installedVersion`, `supportedRange`, `errors`.

- [x] **Step 1: Write failing compatibility tests**

  - Implementation: Added Node test coverage for stable/prerelease ordering, the exact supported range, lower/upper range rejection, and missing executable handling.

Create `plugins/lpc-toolkit/test/check-cli.test.mjs`:

```js
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  SUPPORTED_CLI,
  checkCli,
  compareSemver,
  evaluateVersion,
} from '../skills/character-authoring/scripts/check-cli.mjs';

test('orders stable and prerelease semantic versions', () => {
  assert.equal(compareSemver('0.1.3-alpha-1', '0.1.3'), -1);
  assert.equal(compareSemver('0.1.3', '0.1.3'), 0);
  assert.equal(compareSemver('0.1.4', '0.1.3'), 1);
});

test('accepts the supported beta CLI range', () => {
  assert.deepEqual(SUPPORTED_CLI, {
    min: '0.1.3-alpha-1',
    maxExclusive: '0.2.0',
  });
  assert.deepEqual(evaluateVersion('0.1.3-alpha-1\n'), {
    ok: true,
    installedVersion: '0.1.3-alpha-1',
    supportedRange: '>=0.1.3-alpha-1 <0.2.0',
    errors: [],
  });
});

test('rejects older and next-minor CLI versions', () => {
  assert.equal(evaluateVersion('0.1.2').errors[0].code, 'cli_version_unsupported');
  assert.equal(evaluateVersion('0.2.0').errors[0].code, 'cli_version_unsupported');
});

test('reports a missing executable without throwing', () => {
  const result = checkCli({
    binary: 'lpc-toolkit',
    spawn: () => ({ error: Object.assign(new Error('missing'), { code: 'ENOENT' }) }),
  });
  assert.equal(result.ok, false);
  assert.equal(result.errors[0].code, 'cli_not_found');
});
```

- [x] **Step 2: Run compatibility tests to confirm RED**

Run:

```sh
rtk node --test plugins/lpc-toolkit/test/check-cli.test.mjs
```

Expected: FAIL because `check-cli.mjs` does not exist.

  - Verification: `rtk node --test plugins/lpc-toolkit/test/check-cli.test.mjs` FAIL as expected with `ERR_MODULE_NOT_FOUND` for `skills/character-authoring/scripts/check-cli.mjs`.

- [x] **Step 3: Implement compatibility checking**

  - Implementation: Added the deterministic checker with exported `SUPPORTED_CLI`, `compareSemver`, `evaluateVersion`, and `checkCli`, structured JSON results, and supported range `>=0.1.3-alpha-1 <0.2.0`.

Create `plugins/lpc-toolkit/skills/character-authoring/scripts/check-cli.mjs`:

```js
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export const SUPPORTED_CLI = Object.freeze({
  min: '0.1.3-alpha-1',
  maxExclusive: '0.2.0',
});

const VERSION = /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?$/u;
const supportedRange = `>=${SUPPORTED_CLI.min} <${SUPPORTED_CLI.maxExclusive}`;

function parseSemver(input) {
  const match = VERSION.exec(input.trim());
  if (!match) throw new Error(`Invalid semantic version: ${input}`);
  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
    prerelease: match[4]?.split('.') ?? [],
  };
}

function comparePrerelease(left, right) {
  if (left.length === 0 && right.length === 0) return 0;
  if (left.length === 0) return 1;
  if (right.length === 0) return -1;
  const length = Math.max(left.length, right.length);
  for (let index = 0; index < length; index++) {
    const a = left[index];
    const b = right[index];
    if (a === undefined) return -1;
    if (b === undefined) return 1;
    if (a === b) continue;
    const aNumber = /^\d+$/u.test(a) ? Number(a) : undefined;
    const bNumber = /^\d+$/u.test(b) ? Number(b) : undefined;
    if (aNumber !== undefined && bNumber !== undefined) return Math.sign(aNumber - bNumber);
    if (aNumber !== undefined) return -1;
    if (bNumber !== undefined) return 1;
    return a.localeCompare(b);
  }
  return 0;
}

export function compareSemver(leftInput, rightInput) {
  const left = parseSemver(leftInput);
  const right = parseSemver(rightInput);
  for (const key of ['major', 'minor', 'patch']) {
    if (left[key] !== right[key]) return Math.sign(left[key] - right[key]);
  }
  return comparePrerelease(left.prerelease, right.prerelease);
}

function failure(code, message, installedVersion = null) {
  return {
    ok: false,
    installedVersion,
    supportedRange,
    errors: [{ code, message }],
  };
}

export function evaluateVersion(output) {
  const installedVersion = output.trim();
  try {
    const supported = compareSemver(installedVersion, SUPPORTED_CLI.min) >= 0
      && compareSemver(installedVersion, SUPPORTED_CLI.maxExclusive) < 0;
    return supported
      ? { ok: true, installedVersion, supportedRange, errors: [] }
      : failure('cli_version_unsupported', `Installed lpc-toolkit ${installedVersion} is outside ${supportedRange}.`, installedVersion);
  } catch {
    return failure('cli_version_invalid', `Could not parse lpc-toolkit version output: ${installedVersion || '(empty)'}.`);
  }
}

export function checkCli({
  binary = process.env.LPC_TOOLKIT_BIN ?? 'lpc-toolkit',
  versionArgs = ['--version'],
  spawn = spawnSync,
} = {}) {
  const result = spawn(binary, versionArgs, { encoding: 'utf8', shell: false });
  if (result.error) {
    return failure(
      result.error.code === 'ENOENT' ? 'cli_not_found' : 'cli_check_failed',
      result.error.code === 'ENOENT'
        ? 'lpc-toolkit is not installed or is not on PATH.'
        : `Failed to run lpc-toolkit --version: ${result.error.message}`,
    );
  }
  if (result.status !== 0) {
    return failure('cli_check_failed', `lpc-toolkit --version exited with status ${result.status}.`);
  }
  return evaluateVersion(result.stdout ?? '');
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  const nodeEntry = process.env.LPC_TOOLKIT_NODE_ENTRY;
  const result = nodeEntry
    ? checkCli({
        binary: process.execPath,
        versionArgs: [path.resolve(nodeEntry), '--version'],
      })
    : checkCli();
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  if (!result.ok) process.exitCode = 1;
}
```

- [x] **Step 4: Document compatibility and update the skill preflight**

  - Implementation: Documented compatibility recovery behavior and replaced the skill preflight with the structured checker while preserving the reviewed explicit request/acceptance, stated-reason, and workflow-recording requirements for `--allow-partial`.

Create `plugins/lpc-toolkit/skills/character-authoring/references/compatibility.md`:

```markdown
# CLI Compatibility

Plugin version `0.1.0` supports `@lpc-toolkit/cli >=0.1.3-alpha-1 <0.2.0`.

Before any character operation, resolve this skill's directory and run:

```sh
node scripts/check-cli.mjs
```

Interpret the JSON result:

- `cli_not_found`: stop and ask the user to install the public CLI with
  `npm install -g @lpc-toolkit/cli`; do not install it automatically.
- `cli_version_unsupported`: report the installed version and supported range,
  then ask the user to upgrade or use a compatible plugin version.
- `cli_version_invalid` or `cli_check_failed`: show the structured message and
  stop because the command contract cannot be trusted.

Node.js 22 or newer is required by the CLI. Plugin and CLI versions are
independent; update this file, the checker constants, tests, and release notes
together when the supported range changes.
```

Replace step 1 of `SKILL.md` with:

```markdown
1. Read `references/compatibility.md`, resolve this skill directory, and run
   `node scripts/check-cli.mjs`. Continue only when its JSON result has
   `ok: true`; never install or upgrade the CLI silently.
```

- [x] **Step 5: Run focused verification**

```sh
rtk node --test plugins/lpc-toolkit/test/check-cli.test.mjs
rtk node --test scripts/verify-codex-plugin.test.mjs
rtk node scripts/verify-codex-plugin.mjs
rtk git diff --check
```

Expected: PASS.

  - Verification: `rtk node --test plugins/lpc-toolkit/test/check-cli.test.mjs` PASS (4 tests).
  - Verification: `rtk node --test scripts/verify-codex-plugin.test.mjs` PASS (3 tests).
  - Verification: `rtk node scripts/verify-codex-plugin.mjs` PASS (`Codex plugin structure is valid.`).
  - Verification: `rtk env PYTHONPATH=/tmp/lpc-plugin-validator-pyyaml python3 /Users/william/.codex/skills/.system/skill-creator/scripts/quick_validate.py plugins/lpc-toolkit/skills/character-authoring` PASS (`Skill is valid!`).
  - Verification: `rtk env PYTHONPATH=/tmp/lpc-plugin-validator-pyyaml python3 /Users/william/.codex/skills/.system/plugin-creator/scripts/validate_plugin.py plugins/lpc-toolkit` PASS.
  - Verification: `rtk git diff --check` PASS.
  - Verification: `rtk pnpm verify` FAIL in the restricted sandbox because `tsx` could not create its IPC socket (`listen EPERM`); the same command was rerun outside the sandbox.
  - Verification: `rtk pnpm verify` PASS outside the sandbox (core 171, presets 3, CLI 301 with 1 skipped, web 680 with 1 skipped; existing missing-asset/catalog warning noise only).

- [x] **Step 6: Commit and record Task 2 evidence**

```sh
rtk git add plugins/lpc-toolkit docs/superpowers/plans/2026-07-14-lpc-toolkit-codex-plugin.md
rtk git commit -m "feat(plugin): check compatible CLI versions"
```

Update this task with the full commit hash, implementation note, and exact verification results before committing.

  - Commit: 792d7224bb4d27aaf1dd413b2c2a1bd8cd2e839b
  - Implementation: Plugin version `0.1.0` now performs a deterministic external CLI presence/version preflight and stops on missing, malformed, failed, or unsupported CLI results before character operations.
  - Review fix commit: 82f482008fea8a1c34f9d64b1a568206240d66e3
  - Review fix implementation: Replaced locale-sensitive prerelease ordering with deterministic code-unit ordering and strictly rejected leading-zero core identifiers, empty prerelease identifiers, and leading-zero numeric prerelease identifiers while preserving the exports, JSON contract, and supported range.
  - Review fix RED: `rtk node --test plugins/lpc-toolkit/test/check-cli.test.mjs` FAIL as expected (3 passed, 2 failed): uppercase prerelease ordering returned `1` instead of `-1`, and malformed versions were accepted.
  - Review fix GREEN: `rtk node --test plugins/lpc-toolkit/test/check-cli.test.mjs` PASS (5 tests).
  - Review fix verification: `rtk node --test scripts/verify-codex-plugin.test.mjs` PASS (3 tests).
  - Review fix verification: `rtk node scripts/verify-codex-plugin.mjs` PASS (`Codex plugin structure is valid.`).
  - Review fix verification: `rtk env PYTHONPATH=/tmp/lpc-plugin-validator-pyyaml python3 /Users/william/.codex/skills/.system/skill-creator/scripts/quick_validate.py plugins/lpc-toolkit/skills/character-authoring` PASS (`Skill is valid!`).
  - Review fix verification: `rtk env PYTHONPATH=/tmp/lpc-plugin-validator-pyyaml python3 /Users/william/.codex/skills/.system/plugin-creator/scripts/validate_plugin.py plugins/lpc-toolkit` PASS.
  - Review fix verification: `rtk git diff --check` PASS.
  - Arbitrary-precision review fix commit: 1fc340bef9cb6960c2b106d429e6fa541ef1a79a
  - Arbitrary-precision review fix implementation: Removed `Number()` conversion from valid numeric core and prerelease identifiers; canonical numeric strings now compare exactly by length and then deterministic code-unit order without dependencies or contract changes.
  - Arbitrary-precision review fix RED: `rtk node --test plugins/lpc-toolkit/test/check-cli.test.mjs` FAIL as expected (5 passed, 2 failed): both core and prerelease comparisons returned `0` instead of `-1` for `9007199254740992` versus `9007199254740993`.
  - Arbitrary-precision review fix GREEN: `rtk node --test plugins/lpc-toolkit/test/check-cli.test.mjs` PASS (7 tests).
  - Arbitrary-precision review fix verification: `rtk node --test scripts/verify-codex-plugin.test.mjs` PASS (3 tests).
  - Arbitrary-precision review fix verification: `rtk node scripts/verify-codex-plugin.mjs` PASS (`Codex plugin structure is valid.`).
  - Arbitrary-precision review fix verification: `rtk env PYTHONPATH=/tmp/lpc-plugin-validator-pyyaml python3 /Users/william/.codex/skills/.system/skill-creator/scripts/quick_validate.py plugins/lpc-toolkit/skills/character-authoring` PASS (`Skill is valid!`).
  - Arbitrary-precision review fix verification: `rtk env PYTHONPATH=/tmp/lpc-plugin-validator-pyyaml python3 /Users/william/.codex/skills/.system/plugin-creator/scripts/validate_plugin.py plugins/lpc-toolkit` PASS.
  - Arbitrary-precision review fix verification: `rtk git diff --check` PASS.

### Task 3: Define And Test The Agent Character Workflow

**Files:**
- Create: `plugins/lpc-toolkit/skills/character-authoring/references/cli-workflow.md`
- Create: `plugins/lpc-toolkit/skills/character-authoring/references/cli-contract.json`
- Create: `packages/cli/test/plugin-contract.test.ts`
- Modify: `plugins/lpc-toolkit/skills/character-authoring/SKILL.md`

**Interfaces:**
- Consumes: `parseArgs`, `validateCommandOptions`, `helpForCommand`, the current CLI JSON command surface.
- Produces: schema `lpc-toolkit.codex-plugin.cli-contract.v1` containing `id`, `argv`, and `machineReadable` for every command the skill relies on.

- [x] **Step 1: Write the failing CLI/plugin contract test**

  - Implementation: Added the versioned plugin command inventory contract test against the real CLI parser, generated help, and option validator.

Create `packages/cli/test/plugin-contract.test.ts`:

```ts
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { parseArgs } from '../src/args.js';
import { helpForCommand, validateCommandOptions } from '../src/command-spec.js';

interface PluginCommand {
  readonly id: string;
  readonly argv: readonly string[];
  readonly machineReadable: boolean;
}

interface PluginContract {
  readonly schema: string;
  readonly commands: readonly PluginCommand[];
}

const here = path.dirname(fileURLToPath(import.meta.url));
const contractPath = path.resolve(
  here,
  '../../../plugins/lpc-toolkit/skills/character-authoring/references/cli-contract.json',
);
const contract = JSON.parse(readFileSync(contractPath, 'utf8')) as PluginContract;

describe('Codex plugin CLI contract', () => {
  it('uses the versioned contract schema', () => {
    expect(contract.schema).toBe('lpc-toolkit.codex-plugin.cli-contract.v1');
    expect(contract.commands.map(({ id }) => id)).toEqual([
      'version',
      'preset-list',
      'character-create',
      'character-show',
      'character-search',
      'character-set',
      'character-remove',
      'character-validate',
      'character-preview',
      'character-render',
    ]);
  });

  it.each(contract.commands.filter(({ id }) => id !== 'version'))(
    'keeps $id aligned with generated CLI options',
    ({ argv, machineReadable }) => {
      const parsed = parseArgs(argv);
      expect(validateCommandOptions(parsed)).toBeUndefined();
      expect(helpForCommand(parsed.command)).toContain(
        `lpc-toolkit ${parsed.command.join(' ')}`,
      );
      if (machineReadable) expect(parsed.flags.get('json')).toBe(true);
    },
  );
});
```

- [x] **Step 2: Run the contract test to confirm RED**

```sh
rtk pnpm --filter @lpc-toolkit/cli test -- plugin-contract.test.ts
```

Expected: FAIL because `cli-contract.json` does not exist.

  - Verification: `rtk pnpm --filter @lpc-toolkit/cli test -- plugin-contract.test.ts` FAIL as expected with `ENOENT` for the intentionally absent `cli-contract.json`.

- [x] **Step 3: Add the machine-readable command contract**

  - Implementation: Added schema `lpc-toolkit.codex-plugin.cli-contract.v1` with the ten exact command examples and machine-readable flags used by the skill.

Create `plugins/lpc-toolkit/skills/character-authoring/references/cli-contract.json`:

```json
{
  "schema": "lpc-toolkit.codex-plugin.cli-contract.v1",
  "commands": [
    { "id": "version", "argv": ["--version"], "machineReadable": false },
    { "id": "preset-list", "argv": ["preset", "list", "--json"], "machineReadable": true },
    { "id": "character-create", "argv": ["character", "create", "hero", "--selection", "hero.json", "--preset", "farmer", "--json"], "machineReadable": true },
    { "id": "character-show", "argv": ["character", "show", "--selection", "hero.json", "--json"], "machineReadable": true },
    { "id": "character-search", "argv": ["character", "search", "--selection", "hero.json", "--type", "hair", "--query", "braid", "--json"], "machineReadable": true },
    { "id": "character-set", "argv": ["character", "set", "--selection", "hero.json", "--type", "hair", "--item", "hair_braid", "--recolor", "lpcr.brown", "--json"], "machineReadable": true },
    { "id": "character-remove", "argv": ["character", "remove", "--selection", "hero.json", "--type", "hair", "--json"], "machineReadable": true },
    { "id": "character-validate", "argv": ["character", "validate", "--selection", "hero.json", "--json"], "machineReadable": true },
    { "id": "character-preview", "argv": ["character", "preview", "--selection", "hero.json", "--out", "preview", "--json"], "machineReadable": true },
    { "id": "character-render", "argv": ["character", "render", "--selection", "hero.json", "--out", "rendered", "--animation", "walk", "--bundle", "zip", "--json"], "machineReadable": true }
  ]
}
```

- [x] **Step 4: Write the exact CLI workflow reference**

  - Implementation: Added the create, narrow search/edit, validation, attributed preview, and attributed final-render workflow, then linked it and the tested command inventory from the skill after compatibility preflight. Human-authorized correctness correction: `character create` requires a name and may use `--selection` solely as its output path; every other character command must not receive both locators. Preserved the existing explicit acceptance, stated reason, recorded reason, warnings, and skipped-layer requirements for `--allow-partial`.

Create `plugins/lpc-toolkit/skills/character-authoring/references/cli-workflow.md`:

```markdown
# Character Authoring Workflow

Use an explicit selection path when the user has not asked for repository-local
named character storage. Never pass both a name and `--selection`.

## Create

```sh
lpc-toolkit preset list --json
lpc-toolkit character create hero --selection hero.json --preset farmer --json
```

## Search And Edit

Search one type with a narrow text query. Read the returned `itemId`, variants,
recolors, animations, and licenses before editing.

```sh
lpc-toolkit character search --selection hero.json --type hair --query braid --json
lpc-toolkit character set --selection hero.json --type hair --item hair_braid --recolor lpcr.brown --json
lpc-toolkit character validate --selection hero.json --json
```

Use `character remove` only for a currently selected type. Resolve one
structured error at a time, using `details.suggestions` and `details.available`.

## Preview And Iterate

```sh
lpc-toolkit character preview --selection hero.json --out preview --json
```

Require `ok: true`. Open the returned preview artifact when local image viewing
is available. Confirm that preview metadata, credits TXT, and credits CSV are
present before describing the preview as successful.

## Final Render

```sh
lpc-toolkit character render --selection hero.json --out rendered --animation walk --bundle zip --json
```

Require `ok: true`, inspect warnings, and verify the artifact list includes the
requested pixels plus metadata, credits TXT, and credits CSV. Use
`--allow-partial` only after the user explicitly accepts skipped layers or
animations; report every returned warning and skipped layer.

## Output Discipline

- Use `--json` for agent-consumed commands.
- Keep stdout parseable; asset progress belongs on stderr.
- Refine broad search queries instead of dumping the whole catalog.
- Do not hand-edit generated output or bypass CLI validation.
- Do not modify or initialize `upstream/`.
```

Append to `SKILL.md` after the compatibility preflight:

```markdown
Read `references/cli-workflow.md` before authoring. Treat
`references/cli-contract.json` as the tested inventory of commands this skill
may rely on. Use the narrowest applicable command and preserve its JSON output
until validation and attribution checks are complete.
```

- [x] **Step 5: Run focused tests and typecheck**

```sh
rtk pnpm --filter @lpc-toolkit/cli test -- plugin-contract.test.ts command-spec.test.ts
rtk pnpm --filter @lpc-toolkit/cli run typecheck
rtk node --test plugins/lpc-toolkit/test/check-cli.test.mjs scripts/verify-codex-plugin.test.mjs
rtk node scripts/verify-codex-plugin.mjs
rtk git diff --check
```

Expected: PASS.

  - Verification: `rtk pnpm --filter @lpc-toolkit/cli test -- plugin-contract.test.ts` PASS (10 tests).
  - Verification: `rtk pnpm --filter @lpc-toolkit/cli test -- plugin-contract.test.ts command-spec.test.ts` PASS (26 tests).
  - Verification: `rtk pnpm --filter @lpc-toolkit/cli run typecheck` PASS.
  - Verification: `rtk node --test plugins/lpc-toolkit/test/check-cli.test.mjs scripts/verify-codex-plugin.test.mjs` PASS (10 tests).
  - Verification: `rtk node scripts/verify-codex-plugin.mjs` PASS (`Codex plugin structure is valid.`).
  - Verification: `rtk env PYTHONPATH=/tmp/lpc-plugin-validator-pyyaml python3 /Users/william/.codex/skills/.system/skill-creator/scripts/quick_validate.py plugins/lpc-toolkit/skills/character-authoring` PASS (`Skill is valid!`).
  - Verification: `rtk env PYTHONPATH=/tmp/lpc-plugin-validator-pyyaml python3 /Users/william/.codex/skills/.system/plugin-creator/scripts/validate_plugin.py plugins/lpc-toolkit` PASS.
  - Verification: `rtk git diff --check` PASS.

- [x] **Step 6: Commit and record Task 3 evidence**

  - Commit: `fdafccde29ce38be977c200275b09a728a12e9bf`
  - Implementation: Committed the four Task 3 implementation files separately from this plan evidence.

```sh
rtk git add plugins/lpc-toolkit packages/cli/test/plugin-contract.test.ts docs/superpowers/plans/2026-07-14-lpc-toolkit-codex-plugin.md
rtk git commit -m "feat(plugin): define tested character workflow"
```

Update this task with the full commit hash, implementation note, and exact verification results before committing.

### Task 4: Integrate Documentation, Verification, And CI Ownership

**Files:**
- Modify: `package.json`
- Modify: `README.md`
- Modify: `packages/cli/README.md`
- Modify: `docs/ARCHITECTURE.md`
- Modify: `docs/ENGINEERING.md`
- Modify: `packages/cli/test/package-metadata.test.ts`
- Modify: `packages/web/test/readme-architecture-docs.test.ts`
- Modify: `.github/workflows/ci.yml`

**Interfaces:**
- Consumes: plugin id `lpc-toolkit`, marketplace id `lpc-toolkit`, repository `ochowei/lpc-toolkit-2026-1`, `verify-codex-plugin.mjs`, and Node plugin tests.
- Produces: root command `rtk pnpm verify:plugin`; documented beta install flow and architecture/CI ownership.

- [ ] **Step 1: Write failing documentation contract assertions**

Add this test to `packages/cli/test/package-metadata.test.ts`:

```ts
it('documents the optional Codex plugin installation', () => {
  const readme = readCliReadme();
  expect(readme).toContain('codex plugin marketplace add ochowei/lpc-toolkit-2026-1');
  expect(readme).toContain('codex plugin add lpc-toolkit@lpc-toolkit');
  expect(readme).toContain('requires an installed compatible `lpc-toolkit` CLI');
  expect(readme).not.toContain('automatically installs the CLI');
});
```

Add this block to `packages/web/test/readme-architecture-docs.test.ts`:

```ts
describe('Codex plugin documentation contract', () => {
  it('documents installation, ownership, and verification', () => {
    for (const phrase of [
      'codex plugin marketplace add ochowei/lpc-toolkit-2026-1',
      'codex plugin add lpc-toolkit@lpc-toolkit',
    ]) expect(readme).toContain(phrase);

    for (const phrase of [
      '`plugins/lpc-toolkit/`',
      'external `lpc-toolkit` executable',
      'does not duplicate CLI product logic',
    ]) expect(architecture).toContain(phrase);

    for (const phrase of [
      '`rtk pnpm verify:plugin`',
      'Codex plugin structure and skill contracts',
    ]) expect(engineering).toContain(phrase);
  });
});
```

- [ ] **Step 2: Run documentation tests to confirm RED**

```sh
rtk pnpm --filter @lpc-toolkit/cli test -- package-metadata.test.ts
rtk pnpm --filter @lpc-toolkit/web test -- readme-architecture-docs.test.ts
```

Expected: FAIL because the plugin installation and ownership text is absent.

- [ ] **Step 3: Add the root verification command**

In `package.json`, add:

```json
"verify:plugin": "node --test plugins/lpc-toolkit/test/check-cli.test.mjs scripts/verify-codex-plugin.test.mjs && node scripts/verify-codex-plugin.mjs"
```

Change `verify` to:

```json
"verify": "pnpm --filter @lpc-toolkit/web prepare-assets && pnpm verify:upstream-pin && pnpm check:boundaries && pnpm verify:plugin && pnpm typecheck && pnpm -r test"
```

- [ ] **Step 4: Document consumer installation**

Add a `### Codex Plugin` subsection after the CLI quick start in both
`README.md` and `packages/cli/README.md`. Use this exact command block:

```sh
codex plugin marketplace add ochowei/lpc-toolkit-2026-1
codex plugin add lpc-toolkit@lpc-toolkit
```

State all of the following directly below it:

- The plugin requires an installed compatible `lpc-toolkit` CLI and does not automatically install the CLI.
- Beta users add the repository marketplace once, then install or enable the plugin.
- Restart the ChatGPT desktop app or start a new Codex task if the newly installed skill is not visible.
- Public Plugins Directory distribution can later remove the marketplace-add step.
- The plugin guides Codex through JSON search/edit/validate/preview/render and preserves metadata plus TXT/CSV credits.

- [ ] **Step 5: Document architecture and engineering ownership**

Add a `### Codex Plugin` subsection after the CLI package section of
`docs/ARCHITECTURE.md` with this contract:

```markdown
### `plugins/lpc-toolkit/`

`plugins/lpc-toolkit/` is a Codex distribution and workflow layer around the
external `lpc-toolkit` executable. It owns plugin installation metadata, one
focused character-authoring skill, compatibility checks, and command workflow
references. It does not duplicate CLI product logic, read asset caches on its
own, or own catalog, selection, validation, rendering, or attribution rules.

The plugin may invoke the public CLI and inspect returned artifact paths. It
must not import CLI source, add Node runtime behavior to core, suppress credit
artifacts, install the CLI silently, or introduce MCP/apps/hooks without a new
approved design.
```

Update `docs/ENGINEERING.md`:

- Add `rtk pnpm verify:plugin` to Canonical Commands with purpose `Validate Codex plugin structure and skill contracts.`
- Add a `### Codex plugin` change-specific section listing:

```sh
rtk pnpm verify:plugin
rtk pnpm --filter @lpc-toolkit/cli test -- plugin-contract.test.ts
```

- Add `verify:plugin` as stage 4 of Common Verification Gate and renumber the existing typecheck/test stages.
- State in CI Mapping that `Unit tests` includes Codex plugin structure and skill contracts through `pnpm verify`.

- [ ] **Step 6: Include plugin changes in CLI package change detection**

In `.github/workflows/ci.yml`, add these paths under the existing `cli:` filter:

```yaml
              - 'plugins/lpc-toolkit/**'
              - '.agents/plugins/marketplace.json'
              - 'scripts/verify-codex-plugin.mjs'
              - 'scripts/verify-codex-plugin.test.mjs'
```

- [ ] **Step 7: Run focused verification**

```sh
rtk pnpm verify:plugin
rtk pnpm --filter @lpc-toolkit/cli test -- package-metadata.test.ts plugin-contract.test.ts
rtk pnpm --filter @lpc-toolkit/web test -- readme-architecture-docs.test.ts
rtk pnpm --filter @lpc-toolkit/cli run typecheck
rtk pnpm --filter @lpc-toolkit/web run typecheck
rtk pnpm check:boundaries
rtk git diff --check
```

Expected: PASS.

- [ ] **Step 8: Commit and record Task 4 evidence**

```sh
rtk git add package.json README.md packages/cli/README.md docs/ARCHITECTURE.md docs/ENGINEERING.md packages/cli/test/package-metadata.test.ts packages/web/test/readme-architecture-docs.test.ts .github/workflows/ci.yml docs/superpowers/plans/2026-07-14-lpc-toolkit-codex-plugin.md
rtk git commit -m "docs(plugin): publish Codex installation workflow"
```

Update this task with the full commit hash, implementation note, and exact verification results before committing.

### Task 5: Verify A Clean Marketplace Installation And Complete The Gate

**Files:**
- Modify: `docs/superpowers/plans/2026-07-14-lpc-toolkit-codex-plugin.md`

**Interfaces:**
- Consumes: local repository marketplace, Codex plugin CLI, built `lpc-toolkit` CLI, common repository verification gate.
- Produces: recorded clean-install, command workflow, attribution, and full verification evidence.

- [ ] **Step 1: Run the complete repository gate**

```sh
rtk pnpm verify
rtk pnpm build
rtk git diff --check
```

Expected: PASS. The build warning about the existing Web JSZip static/dynamic import split may remain known noise; no new warning is accepted without investigation.

- [ ] **Step 2: Test the local marketplace with an isolated Codex home**

Reserve one plan-owned temporary path and fail instead of reusing unknown state:

```sh
rtk node -e "const fs=require('node:fs');const p='/tmp/lpc-toolkit-codex-plugin-smoke-home';if(fs.existsSync(p))throw new Error(p+' already exists')"
```

Then run:

```sh
rtk env CODEX_HOME=/tmp/lpc-toolkit-codex-plugin-smoke-home codex plugin marketplace add . --json
rtk env CODEX_HOME=/tmp/lpc-toolkit-codex-plugin-smoke-home codex plugin marketplace list --json
rtk env CODEX_HOME=/tmp/lpc-toolkit-codex-plugin-smoke-home codex plugin list --available --marketplace lpc-toolkit --json
rtk env CODEX_HOME=/tmp/lpc-toolkit-codex-plugin-smoke-home codex plugin add lpc-toolkit@lpc-toolkit --json
rtk env CODEX_HOME=/tmp/lpc-toolkit-codex-plugin-smoke-home codex plugin list --json
```

Expected: every command exits zero; the marketplace list contains `lpc-toolkit`, the available list exposes the plugin, the add response reports success, and the final list reports the plugin installed and enabled. After recording results, remove only this plan-owned directory:

```sh
rtk node -e "require('node:fs').rmSync('/tmp/lpc-toolkit-codex-plugin-smoke-home',{recursive:true,force:true})"
```

- [ ] **Step 3: Run the compatibility checker against the built CLI**

```sh
rtk env LPC_TOOLKIT_NODE_ENTRY=packages/cli/dist/index.js node plugins/lpc-toolkit/skills/character-authoring/scripts/check-cli.mjs
```

Expected JSON: `ok: true`, installed version `0.1.3-alpha-1`, supported range `>=0.1.3-alpha-1 <0.2.0`. `LPC_TOOLKIT_NODE_ENTRY` is a test-only path through the same checker; normal plugin use resolves the installed `lpc-toolkit` executable.

- [ ] **Step 4: Exercise the plugin-documented character flow in temporary output**

Use the built CLI entrypoint and paths under `/tmp`:

```sh
rtk node packages/cli/dist/index.js character create plugin-smoke --selection /tmp/lpc-plugin-smoke.json --preset farmer --json
rtk node packages/cli/dist/index.js character search --selection /tmp/lpc-plugin-smoke.json --type hair --query braid --json
rtk node packages/cli/dist/index.js character set --selection /tmp/lpc-plugin-smoke.json --type hair --item hair_braid --recolor lpcr.brown --json
rtk node packages/cli/dist/index.js character validate --selection /tmp/lpc-plugin-smoke.json --json
rtk node packages/cli/dist/index.js character preview --selection /tmp/lpc-plugin-smoke.json --out /tmp/lpc-plugin-preview --json
rtk node packages/cli/dist/index.js character render --selection /tmp/lpc-plugin-smoke.json --out /tmp/lpc-plugin-render --animation walk --bundle zip --json
```

Expected: each response has `ok: true`. Preview and render outputs contain PNG pixels, metadata JSON, credits TXT, and credits CSV; render also contains the requested animation and ZIP. Run outside the sandbox only if the verified cache is inaccessible, using the narrowest required approval.

- [ ] **Step 5: Record final evidence in this plan**

Under this task, add one concise implementation note describing the observed
marketplace installation and attributed end-to-end result, the full hash of the
implementation commit verified by this task, and one verification line per
command group with its exact observed command and PASS or FAIL result. Do not
claim public Plugins Directory availability; this task verifies the repository
marketplace beta only.

- [ ] **Step 6: Commit final plan bookkeeping**

```sh
rtk git add docs/superpowers/plans/2026-07-14-lpc-toolkit-codex-plugin.md
rtk git commit -m "docs(plugin): record Codex plugin verification"
```

Record the bookkeeping commit hash in the final response.

## Self-Review

- Spec coverage: Tasks 1–5 cover repository plugin structure, one bundled skill, external CLI ownership, compatibility checking, exact JSON workflow, attribution safeguards, beta marketplace distribution, docs, CI mapping, clean installation, and end-to-end verification.
- Scope: The plan creates no MCP server, app, hook, dependency, backend, separate repository, automatic installer, batch generator, natural-language planner, or game-engine importer.
- Type and interface consistency: plugin id, marketplace id, paths, CLI range, compatibility result fields, and command-contract schema are identical in all tasks.
- Attribution: skill instructions, workflow reference, documentation tests, architecture text, and smoke verification all require metadata plus TXT/CSV credits.
- Completeness: every implementation value is fixed; Task 5 records observed hashes and command results directly during execution.
