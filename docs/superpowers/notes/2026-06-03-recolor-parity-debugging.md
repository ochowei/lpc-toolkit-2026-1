# LPC Toolkit Parity Debugging Progress

## 1. Current Work Status

- **Branch**: `feature/issue-40-jszip`
- **Issue**: Playwright E2E parity test failed on `seed-99` with 30,092 mismatching pixels.
- **Goal**: Bring dynamic recoloring logic in line with upstream to ensure exact pixel parity.

---

## 2. Root Cause Analysis (`seed-99` Mismatch)

The item **Kettle helm** (`hat_helmet_kettle.json`) has a secondary recolor slot:
- `color_1` (primary): material `metal`, no `type_name` (defaults to item's type name `hat`).
- `color_2` (secondary): material `cloth`, `type_name`: `"hat_secondary"`, base: `"brown"`.

### Upstream vs. Local Resolution:
1. **Selections**: In `seed-99`, the selection is `hat=Kettle_helm_ceramic`. There is no explicit user selection for `hat_secondary`.
2. **Upstream Behavior**:
   - `getMultiRecolors` resolves selections and returns `recolors` map: `{ "hat": "ceramic" }` (without `"hat_secondary"`).
   - During rendering, the app iterates through all recolor definitions (`metal` and `cloth`).
   - For `cloth` (Kettle Inner), since no selection is found, it calls `getTargetPalette("cloth", undefined)`.
   - `parseRecolorKey(undefined)` defaults to the material's base key: `"white"` (from `meta_cloth.json`).
   - Thus, it maps the template's brown colors to `white`.
3. **Local Behavior (Before Fix)**:
   - Our `makeResolvePalette` implementation checked `if (!key) continue;` when a recolor slot was not selected.
   - For the cloth layer, since `key` was `undefined`, we skipped generating a palette swap mapping.
   - The Kettle Inner rendered using raw brown pixels from the template PNG, while upstream rendered it as white, leading to the visual parity mismatch.

---

## 3. Code Modifications Applied

We edited [recolor-resolve.ts](file:///Users/william/gitRepo/lpc-toolkit-2026-1/packages/core/src/recolor-resolve.ts):
- Updated `getTargetPalette` to support `string | null | undefined` target colors.
- In `makeResolvePalette`, we now resolve target colors for unselected slots using their material's default/base target palette (matching upstream's fallback behavior) instead of skipping them.

---

## 4. Next Steps (How to Resume)

When resuming this task, execute the following commands in order:

### Step 1: Run Core Package Unit Tests
Verify that our logic changes do not break any existing core composition or resolution unit tests:
```bash
pnpm --filter @lpc-toolkit/core test
```

### Step 2: Run Web Package Unit Tests
Verify that all unit tests in the React app (including loaders and integration tests) pass:
```bash
pnpm --filter @lpc-toolkit/web test
```

### Step 3: Run Playwright Parity Test for `seed-99`
Confirm that our fix successfully solves the parity mismatch on `seed-99`:
```bash
pnpm --filter @lpc-toolkit/web test:e2e:parity -g "seed-99"
```

### Step 4: Run Full E2E & Parity Suite
If `seed-99` passes, run the full verification suites:
```bash
# Run all standard smoke/integration E2E tests
pnpm --filter @lpc-toolkit/web test:e2e

# Run all 100 seeded parity test cases
pnpm --filter @lpc-toolkit/web test:e2e:parity
```

### Step 5: Commit & Finalize
Once all tests are completely green:
1. Stage the modified files:
   ```bash
   git add packages/core/src/recolor-resolve.ts
   ```
2. Commit the fix:
   ```bash
   git commit -m "fix(core): resolve unselected secondary recolors to material default base"
   ```
3. Stage and commit any outstanding UI adapter changes if they are fully verified.
