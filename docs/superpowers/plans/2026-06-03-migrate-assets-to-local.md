# Migrate LPC Assets to Local Repository Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate sheet definitions, palette definitions, spritesheets, and credits from the `upstream/` submodule to a local `assets/` directory at the repository root, update loaders and unit tests to read from it, and keep the submodule strictly for Playwright E2E parity tests.

**Architecture:** Copy files using local OS commands. Update Vite globs and path constants in Web assets loaders and test suites to point to `/assets/...`. Ensure Playwright E2E parity test config is unchanged to continue booting the upstream dev server for pixel-by-pixel comparisons.

---

### Task 1: Copy Assets from Submodule to Local `/assets/`

**Files:**
- Create: `assets/sheet_definitions/`
- Create: `assets/palette_definitions/`
- Create: `assets/spritesheets/`
- Create: `assets/CREDITS.csv`

- [ ] **Step 1: Create local directory structure and copy files**

Run the following commands to create the target directories and copy the source assets from the `upstream/` submodule:
```bash
mkdir -p assets
cp -R upstream/sheet_definitions assets/
cp -R upstream/palette_definitions assets/
cp -R upstream/spritesheets assets/
cp upstream/CREDITS.csv assets/
```

- [ ] **Step 2: Verify copied asset sizes and file counts**

Run:
```bash
du -sh assets/sheet_definitions assets/palette_definitions assets/spritesheets assets/CREDITS.csv && find assets/sheet_definitions -name "*.json" | wc -l && find assets/spritesheets -name "*.png" | wc -l
```
Expected output:
- `assets/sheet_definitions`: ~3.0M (767 json files)
- `assets/palette_definitions`: ~100K-300K
- `assets/spritesheets`: ~603M (145452 png files)
- `assets/CREDITS.csv`: ~4.0M

- [ ] **Step 3: Commit the new assets folder**

Run:
```bash
git add assets/
git commit -m "chore: copy assets from upstream submodule to local assets folder"
```

---

### Task 2: Update Web Core Assets Loaders

**Files:**
- Modify: `packages/web/src/catalog/load-catalog.ts`
- Modify: `packages/web/src/catalog/load-palettes.ts`
- Modify: `packages/web/test/load-catalog.test.ts`
- Modify: `packages/web/test/load-palettes.test.ts`

- [ ] **Step 1: Update web tests for normalize key helpers**

Modify [packages/web/test/load-catalog.test.ts](file:///Users/william/gitRepo/lpc-toolkit-2026-1/packages/web/test/load-catalog.test.ts#L29-L36):
```typescript
describe('normalizeUpstreamKey', () => {
  it('strips the vite glob prefix preceding assets/sheet_definitions/', () => {
    expect(
      normalizeUpstreamKey(
        '../../../../assets/sheet_definitions/headwear/hats/magic/hat_magic_large.json',
      ),
    ).toBe('headwear/hats/magic/hat_magic_large.json');
  });
// ...
```

Modify [packages/web/test/load-palettes.test.ts](file:///Users/william/gitRepo/lpc-toolkit-2026-1/packages/web/test/load-palettes.test.ts#L28-L35):
```typescript
describe('normalizePaletteKey', () => {
  it('strips the vite glob prefix preceding assets/palette_definitions/', () => {
    expect(
      normalizePaletteKey(
        '../../../../assets/palette_definitions/body/body_ulpc.json',
      ),
    ).toBe('body/body_ulpc.json');
  });
// ...
```

- [ ] **Step 2: Run tests to verify failure**

Run:
```bash
pnpm --filter @lpc-toolkit/web test
```
Expected: Tests for `normalizeUpstreamKey` and `normalizePaletteKey` fail.

- [ ] **Step 3: Implement path changes in loaders**

Modify [packages/web/src/catalog/load-catalog.ts](file:///Users/william/gitRepo/lpc-toolkit-2026-1/packages/web/src/catalog/load-catalog.ts#L17-L25) and [load-catalog.ts:L59-L68](file:///Users/william/gitRepo/lpc-toolkit-2026-1/packages/web/src/catalog/load-catalog.ts#L59-L68):
```typescript
const ASSETS_PREFIX = 'assets/sheet_definitions/';

// Vite's `import.meta.glob` keys are relative to this file
// (e.g. `../../../../assets/sheet_definitions/headwear/...`). Strip that
// leading noise so `sourcePath` reflects the path inside the assets root.
export function normalizeUpstreamKey(key: string): string {
  const idx = key.lastIndexOf(ASSETS_PREFIX);
  return idx >= 0 ? key.slice(idx + ASSETS_PREFIX.length) : key;
}
```
And:
```typescript
export function loadCatalogFromUpstream(): Catalog {
  const mods = import.meta.glob<ItemDefinition>(
    '../../../../assets/sheet_definitions/**/*.json',
    { eager: true, import: 'default' },
  );
  const records: Record<FilePath, ItemDefinition> = {};
  for (const [key, def] of Object.entries(mods)) {
    records[normalizeUpstreamKey(key)] = def;
  }
```

Modify [packages/web/src/catalog/load-palettes.ts](file:///Users/william/gitRepo/lpc-toolkit-2026-1/packages/web/src/catalog/load-palettes.ts#L19-L29) and [load-palettes.ts:L38-L52](file:///Users/william/gitRepo/lpc-toolkit-2026-1/packages/web/src/catalog/load-palettes.ts#L38-L52):
```typescript
const ASSETS_PREFIX = 'assets/palette_definitions/';

/**
 * Strip the Vite glob prefix preceding `assets/palette_definitions/` so a
 * record key reflects the path inside the assets root (keeps load
 * warnings readable).
 */
export function normalizePaletteKey(key: string): string {
  const idx = key.lastIndexOf(ASSETS_PREFIX);
  return idx >= 0 ? key.slice(idx + ASSETS_PREFIX.length) : key;
}
```
And:
```typescript
export function loadPalettesFromUpstream(): PaletteMetadata {
  const mods = import.meta.glob<unknown>(
    '../../../../assets/palette_definitions/**/*.json',
    { eager: true, import: 'default' },
  );
// ...
  const records: Record<string, unknown> = {};
  for (const [key, json] of Object.entries(mods)) {
    records[normalizePaletteKey(key)] = json;
  }
```

- [ ] **Step 4: Run tests to verify pass**

Run:
```bash
pnpm --filter @lpc-toolkit/web test
```
Expected: All web unit tests pass.

- [ ] **Step 5: Commit changes**

Run:
```bash
git add packages/web/src/catalog/load-catalog.ts packages/web/src/catalog/load-palettes.ts packages/web/test/load-catalog.test.ts packages/web/test/load-palettes.test.ts
git commit -m "feat: update web catalog and palette loaders to read from local assets/"
```

---

### Task 3: Update Core Test Paths

**Files:**
- Modify: `packages/core/test/catalog.test.ts`
- Modify: `packages/core/test/compose.test.ts`
- Modify: `packages/core/test/credits.test.ts`
- Modify: `packages/core/test/hash.test.ts`
- Modify: `packages/core/test/palettes.test.ts`
- Modify: `packages/core/test/recolor-resolve.test.ts`
- Modify: `packages/core/test/helpers/node-canvas-adapter.ts`

- [ ] **Step 1: Replace path references from upstream/ to assets/ in core test files**

Modify the base paths in the test files:
- In `packages/core/test/catalog.test.ts`:
  Change `const upstreamRoot = path.join(here, '../../../upstream/sheet_definitions');` to `const upstreamRoot = path.join(here, '../../../assets/sheet_definitions');`.
- In `packages/core/test/compose.test.ts`:
  Change `const upstreamRoot = path.join(here, '../../../upstream/sheet_definitions');` to `const upstreamRoot = path.join(here, '../../../assets/sheet_definitions');`.
  Change `const upstreamBase = path.join(here, '../../../upstream');` to `const upstreamBase = path.join(here, '../../../assets');`.
- In `packages/core/test/credits.test.ts`:
  Change `const upstreamRoot = path.join(here, '../../../upstream/sheet_definitions');` to `const upstreamRoot = path.join(here, '../../../assets/sheet_definitions');`.
- In `packages/core/test/hash.test.ts`:
  Change `const upstreamBase = path.join(here, '../../../upstream');` to `const upstreamBase = path.join(here, '../../../assets');`.
- In `packages/core/test/palettes.test.ts`:
  Change `const paletteRoot = path.join(here, '../../../upstream/palette_definitions');` to `const paletteRoot = path.join(here, '../../../assets/palette_definitions');`.
- In `packages/core/test/recolor-resolve.test.ts`:
  Change `const upstreamBase = path.join(here, '../../../upstream');` to `const upstreamBase = path.join(here, '../../../assets');`.
- In `packages/core/test/helpers/node-canvas-adapter.ts`:
  Change comment and references to point to `assets/` instead of `upstream/`.

- [ ] **Step 2: Run core unit tests**

Run:
```bash
pnpm --filter @lpc-toolkit/core test
```
Expected: All core tests pass.

- [ ] **Step 3: Commit changes**

Run:
```bash
git add packages/core/test/
git commit -m "test: update core tests to load definitions and sprites from local assets/"
```

---

### Task 4: Update Web Scripts

**Files:**
- Modify: `packages/web/scripts/copy-spritesheets.ts`
- Modify: `packages/web/scripts/gen-i18n-data.ts`

- [ ] **Step 1: Update copy-spritesheets.ts paths**

Modify [packages/web/scripts/copy-spritesheets.ts](file:///Users/william/gitRepo/lpc-toolkit-2026-1/packages/web/scripts/copy-spritesheets.ts#L30-L33):
```typescript
const sheetDefsDir = path.join(repoRoot, 'assets/sheet_definitions');
const spritesSrc = path.join(repoRoot, 'assets/spritesheets');
const spritesDest = path.join(here, '../public/spritesheets');
```
And update the error logs:
```typescript
if (!existsSync(sheetDefsDir) || !existsSync(spritesSrc)) {
  console.error(
    '[copy-sprites] assets/ not found. Run copy commands first',
  );
  process.exit(1);
}
```

- [ ] **Step 2: Update gen-i18n-data.ts paths**

Modify [packages/web/scripts/gen-i18n-data.ts](file:///Users/william/gitRepo/lpc-toolkit-2026-1/packages/web/scripts/gen-i18n-data.ts#L25):
```typescript
const sheetDefsDir = path.join(repoRoot, 'assets/sheet_definitions');
```
And update the error logs:
```typescript
if (!existsSync(sheetDefsDir)) {
  console.error(
    '[gen-i18n] assets/sheet_definitions not found.',
  );
  process.exit(1);
}
```

- [ ] **Step 3: Run gen-i18n script**

Run:
```bash
pnpm --filter @lpc-toolkit/web gen-i18n
```
Expected: Output lists asset names and categories without error.

- [ ] **Step 4: Run copy-sprites script**

Run:
```bash
pnpm --filter @lpc-toolkit/web copy-sprites
```
Expected: Slices ~28.8 MB of sprites into `packages/web/public/spritesheets/` from `assets/spritesheets/`.

- [ ] **Step 5: Run Playwright E2E tests**

Run:
```bash
pnpm --filter @lpc-toolkit/web test:e2e
```
Expected: Playwright UI tests pass successfully.

- [ ] **Step 6: Commit changes**

Run:
```bash
git add packages/web/scripts/copy-spritesheets.ts packages/web/scripts/gen-i18n-data.ts
git commit -m "chore: update web utility scripts to read from local assets/"
```

---

### Task 5: Run Playwright Parity Tests

**Files:**
- None (verification task)

- [ ] **Step 1: Run local pixel-by-pixel parity tests**

Run:
```bash
pnpm --filter @lpc-toolkit/web test:e2e:parity
```
Expected: Playwright parity tests boot both servers and succeed with zero failures, confirming pixel parity.

- [ ] **Step 2: Run all workspace tests**

Run:
```bash
pnpm test
```
Expected: All tests in all workspaces pass.
