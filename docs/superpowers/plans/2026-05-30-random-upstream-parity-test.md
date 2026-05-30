# Random Upstream Parity Test Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an explicit Playwright parity test that renders deterministic toolkit characters and the observed regression hash against local upstream, then reports structured diagnostics and pixel mismatches.

**Architecture:** Keep parity isolated from normal e2e by adding a separate Playwright config and `test:e2e:parity` script. Add a URL-param-gated toolkit e2e probe so tests can read composed sheet metadata without affecting normal users. Use local upstream runtime as the golden source, read its exported renderer canvas through `window.canvasRenderer`, and compare same-sized RGBA buffers.

**Tech Stack:** TypeScript strict mode, pnpm workspaces, React 18, Vite, Playwright, existing `@lpc-toolkit/core` APIs. No new dependencies.

---

## File Structure

- Create `packages/web/src/lib/e2e-probe-from-url.ts`
  - Pure helper that returns whether `?e2eProbe=1` is present.
- Create `packages/web/test/e2e-probe-from-url.test.ts`
  - Vitest coverage for valid/absent/invalid probe query values.
- Modify `packages/web/src/components/layer-stack/harness.tsx`
  - When the probe is enabled, attach `window.__LPC_E2E__` with current state, canonical hash, compose status, credits count, layers, and full-sheet canvas data.
- Create `packages/web/e2e/helpers/seeded-rng.ts`
  - Deterministic RNG and fixed parity cases.
- Create `packages/web/e2e/helpers/pixel-diff.ts`
  - Strict RGBA comparison with a compact mismatch summary.
- Create `packages/web/e2e/helpers/parity-pages.ts`
  - Playwright helpers for toolkit and upstream pages.
- Create `packages/web/e2e/random-upstream-parity.spec.ts`
  - Main parity spec.
- Create `packages/web/playwright.parity.config.ts`
  - Starts toolkit Vite on `5173` and upstream Vite on `5174`.
- Modify `packages/web/package.json`
  - Add `test:e2e:parity`.

---

### Task 1: Add The Toolkit E2E Probe Flag

**Files:**
- Create: `packages/web/src/lib/e2e-probe-from-url.ts`
- Create: `packages/web/test/e2e-probe-from-url.test.ts`

- [ ] **Step 1: Write the failing unit test**

Create `packages/web/test/e2e-probe-from-url.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { e2eProbeFromUrl } from '../src/lib/e2e-probe-from-url';

describe('e2eProbeFromUrl', () => {
  it('returns true only for e2eProbe=1', () => {
    expect(e2eProbeFromUrl('?e2eProbe=1')).toBe(true);
    expect(e2eProbeFromUrl('?assetSource=local&e2eProbe=1')).toBe(true);
  });

  it('returns false when the flag is absent or invalid', () => {
    expect(e2eProbeFromUrl('')).toBe(false);
    expect(e2eProbeFromUrl('?assetSource=local')).toBe(false);
    expect(e2eProbeFromUrl('?e2eProbe=true')).toBe(false);
    expect(e2eProbeFromUrl('?e2eProbe=0')).toBe(false);
  });
});
```

- [ ] **Step 2: Run the focused test and verify it fails**

Run:

```bash
pnpm --filter @lpc-toolkit/web test -- e2e-probe-from-url.test.ts
```

Expected: FAIL because `../src/lib/e2e-probe-from-url` does not exist.

- [ ] **Step 3: Add the pure helper**

Create `packages/web/src/lib/e2e-probe-from-url.ts`:

```ts
export function e2eProbeFromUrl(search: string): boolean {
  return new URLSearchParams(search).get('e2eProbe') === '1';
}
```

- [ ] **Step 4: Run the focused test and verify it passes**

Run:

```bash
pnpm --filter @lpc-toolkit/web test -- e2e-probe-from-url.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/web/src/lib/e2e-probe-from-url.ts packages/web/test/e2e-probe-from-url.test.ts
git commit -m "test(web): add e2e probe URL flag"
```

---

### Task 2: Expose Toolkit Render Diagnostics Behind The Probe

**Files:**
- Modify: `packages/web/src/components/layer-stack/harness.tsx`

- [ ] **Step 1: Note the browser-level assertion covered by Task 5**

Task 5 adds the Playwright assertion that waits for
`window.__LPC_E2E__?.status` to become `ready`. Before this task's
implementation, that assertion fails with `missing-probe`. Keep this task scoped
to the production-gated probe and verify it with typecheck after Step 3.

Verification command after Step 3:

```bash
pnpm --filter @lpc-toolkit/web typecheck
```

Expected: PASS.

- [ ] **Step 2: Add imports and window typing**

In `packages/web/src/components/layer-stack/harness.tsx`, add imports near the existing imports:

```ts
import { e2eProbeFromUrl } from '../../lib/e2e-probe-from-url';
```

Add this type block after the imports:

```ts
interface LpcE2eProbe {
  readonly hash: string;
  readonly bodyType: string;
  readonly status: ComposedResult['status'];
  readonly creditsCount: number;
  readonly layers: readonly {
    readonly path: string;
    readonly zPos: number;
    readonly typeName: string;
  }[];
  readonly canvas: {
    readonly width: number;
    readonly height: number;
    readonly dataUrl: string;
  } | null;
}

declare global {
  interface Window {
    __LPC_E2E__?: LpcE2eProbe;
  }
}
```

- [ ] **Step 3: Attach the probe in a guarded effect**

In `LayerStackHarness`, after `const loadingProgress = ...`, add:

```ts
  const e2eProbeEnabled =
    typeof window !== 'undefined' && e2eProbeFromUrl(window.location.search);
  const canonicalHash = useMemo(
    () => serializeHash(toSelections(props.state)),
    [props.state.bodyType, props.state.selections],
  );
```

Update the existing `upstreamHref` memo to reuse `canonicalHash`:

```ts
  const upstreamHref = useMemo(
    () => buildUpstreamUrl(canonicalHash),
    [canonicalHash],
  );
```

Add this effect after `upstreamHref`:

```ts
  useEffect(() => {
    if (!e2eProbeEnabled) {
      delete window.__LPC_E2E__;
      return;
    }

    const sheet = composeResult.sheet;
    window.__LPC_E2E__ = {
      hash: canonicalHash,
      bodyType: props.state.bodyType,
      status: composeResult.status,
      creditsCount: sheet?.credits.entries.length ?? 0,
      layers:
        sheet?.layers.map((layer) => ({
          path: layer.path,
          zPos: layer.zPos,
          typeName: layer.typeName,
        })) ?? [],
      canvas:
        sheet && composeResult.status === 'ready'
          ? {
              width: sheet.width,
              height: sheet.height,
              dataUrl: sheet.canvas.toDataURL(),
            }
          : null,
    };
  }, [
    canonicalHash,
    composeResult.status,
    composeResult.sheet,
    e2eProbeEnabled,
    props.state.bodyType,
  ]);
```

- [ ] **Step 4: Run typecheck**

Run:

```bash
pnpm --filter @lpc-toolkit/web typecheck
```

Expected: PASS. If TypeScript complains about readonly layer shape, adjust the local `LpcE2eProbe.layers` type to exactly match `sheet.layers.map(...)` without using `any`.

- [ ] **Step 5: Commit**

```bash
git add packages/web/src/components/layer-stack/harness.tsx
git commit -m "test(web): expose guarded render probe"
```

---

### Task 3: Add Deterministic Case And Pixel Helpers

**Files:**
- Create: `packages/web/e2e/helpers/seeded-rng.ts`
- Create: `packages/web/e2e/helpers/pixel-diff.ts`
- Create: `packages/web/test/pixel-diff.test.ts`

- [ ] **Step 1: Write the failing pixel-diff unit test**

Create `packages/web/test/pixel-diff.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { diffRgba } from '../e2e/helpers/pixel-diff';

describe('diffRgba', () => {
  it('reports no mismatches for equal buffers', () => {
    const actual = new Uint8ClampedArray([0, 1, 2, 3, 4, 5, 6, 7]);
    const expected = new Uint8ClampedArray([0, 1, 2, 3, 4, 5, 6, 7]);

    expect(diffRgba(actual, expected, 1, 2)).toEqual({
      mismatchCount: 0,
      samples: [],
    });
  });

  it('reports mismatch count and sample coordinates', () => {
    const actual = new Uint8ClampedArray([0, 0, 0, 0, 9, 9, 9, 9]);
    const expected = new Uint8ClampedArray([0, 0, 0, 0, 1, 1, 1, 1]);

    expect(diffRgba(actual, expected, 2, 1)).toEqual({
      mismatchCount: 1,
      samples: [
        {
          x: 1,
          y: 0,
          actual: [9, 9, 9, 9],
          expected: [1, 1, 1, 1],
        },
      ],
    });
  });
});
```

- [ ] **Step 2: Run the focused test and verify it fails**

Run:

```bash
pnpm --filter @lpc-toolkit/web test -- pixel-diff.test.ts
```

Expected: FAIL because `../e2e/helpers/pixel-diff` does not exist.

- [ ] **Step 3: Add the pixel-diff helper**

Create `packages/web/e2e/helpers/pixel-diff.ts`:

```ts
export interface PixelMismatchSample {
  readonly x: number;
  readonly y: number;
  readonly actual: readonly [number, number, number, number];
  readonly expected: readonly [number, number, number, number];
}

export interface PixelDiffResult {
  readonly mismatchCount: number;
  readonly samples: readonly PixelMismatchSample[];
}

const SAMPLE_LIMIT = 10;

export function diffRgba(
  actual: ArrayLike<number>,
  expected: ArrayLike<number>,
  width: number,
  height: number,
): PixelDiffResult {
  if (actual.length !== expected.length) {
    throw new Error(
      `RGBA buffer length mismatch: actual=${actual.length} expected=${expected.length}`,
    );
  }
  if (actual.length !== width * height * 4) {
    throw new Error(
      `RGBA buffer dimensions do not match length: width=${width} height=${height} length=${actual.length}`,
    );
  }

  let mismatchCount = 0;
  const samples: PixelMismatchSample[] = [];

  for (let i = 0; i < actual.length; i += 4) {
    const same =
      actual[i] === expected[i] &&
      actual[i + 1] === expected[i + 1] &&
      actual[i + 2] === expected[i + 2] &&
      actual[i + 3] === expected[i + 3];
    if (same) continue;

    mismatchCount++;
    if (samples.length < SAMPLE_LIMIT) {
      const pixel = i / 4;
      samples.push({
        x: pixel % width,
        y: Math.floor(pixel / width),
        actual: [actual[i]!, actual[i + 1]!, actual[i + 2]!, actual[i + 3]!],
        expected: [
          expected[i]!,
          expected[i + 1]!,
          expected[i + 2]!,
          expected[i + 3]!,
        ],
      });
    }
  }

  return { mismatchCount, samples };
}
```

- [ ] **Step 4: Add deterministic case definitions**

Create `packages/web/e2e/helpers/seeded-rng.ts`:

```ts
export interface SeededCase {
  readonly name: string;
  readonly seed: number;
}

export interface FixedHashCase {
  readonly name: string;
  readonly hash: string;
  readonly source: string;
}

export const SEEDED_RANDOM_CASES: readonly SeededCase[] = [
  { name: 'seed-1', seed: 1 },
  { name: 'seed-7', seed: 7 },
  { name: 'seed-42', seed: 42 },
  { name: 'seed-99', seed: 99 },
  { name: 'seed-20260530', seed: 20260530 },
];

export const OBSERVED_REGRESSION_CASE: FixedHashCase = {
  name: 'observed-deployed-mismatch-2026-05-30',
  source: 'User-reported deployed toolkit vs upstream visual mismatch',
  hash:
    'sex=male&body=Body_Color&head=Human_Female&eyes=Cyclops_Eyes&eyebrows=Thin_Eyebrows&nose=Large_nose&ears=Big_ears&ears_inner=Side_Wolf_Ears_Skintone&beard=Medium_Beard&expression=Happy_Alt&expression_crying=Tears&bandana=Bordered_Bandana&bandana_overlay=Skull_Bandana_Overlay&updo=High_Bun&hairextr=Right_Long_Straight&hairtie_rune=Hair_Tie_Rune&facial_mask=Plain_Mask&facial_right=Right_Monocle&facial_right_trim=Right_Monocle_Frame_Color&visor=Narrow_slit_visor&arms=Armour&clothes=Shortsleeve&overalls=Overalls&armour=Legion&chainmail=Chainmail&bracers=Bracers&bauldron=Bauldron&hat=Hood&jacket=Frock_coat&jacket_collar=Frock_collar&jacket_trim=Frock_coat_lapel&vest=Vest&hat_buckle=Wizard_Hat_Buckle&hat_overlay=Bicorne_Athwart_Skull&shoes_toe=Plated_Toe&cape_trim=Cape_Trim&quiver=Quiver&charm=Pearl_Gem&bandages=Bandages&cargo=Wood&gloves=Gloves&necklace=Simple_Necklace&sash=Obi&weapon_magic_crystal=Crystal&shield_paint=Revised_Heater_Shield_Paint&wings=Bat_Wings&wings_dots=Monarch_Wings_Dots&wings_edge=Monarch_Wings_Edge&fins=Fin&furry_ears=Cat_Ears&furry_ears_skin=Cat_Ears_Skintone&tail=Wolf_Tail',
};

export function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
```

- [ ] **Step 5: Run unit tests**

Run:

```bash
pnpm --filter @lpc-toolkit/web test -- pixel-diff.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/web/e2e/helpers/seeded-rng.ts packages/web/e2e/helpers/pixel-diff.ts packages/web/test/pixel-diff.test.ts
git commit -m "test(web): add parity case helpers"
```

---

### Task 4: Add The Parity Playwright Config And Script

**Files:**
- Create: `packages/web/playwright.parity.config.ts`
- Modify: `packages/web/package.json`

- [ ] **Step 1: Add the parity config**

Create `packages/web/playwright.parity.config.ts`:

```ts
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  testMatch: /random-upstream-parity\.spec\.ts/,
  timeout: 120_000,
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: [
    {
      command: 'pnpm dev --host 127.0.0.1 --port 5173',
      url: 'http://127.0.0.1:5173',
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
      stdout: 'ignore',
      stderr: 'pipe',
    },
    {
      command: 'pnpm --dir ../../upstream dev --host 127.0.0.1 --port 5174',
      url: 'http://127.0.0.1:5174',
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
      stdout: 'ignore',
      stderr: 'pipe',
    },
  ],
});
```

- [ ] **Step 2: Add the package script**

In `packages/web/package.json`, add this script next to the existing e2e scripts:

```json
"test:e2e:parity": "playwright test -c playwright.parity.config.ts",
```

- [ ] **Step 3: Run the command and verify the expected no-test failure**

Run:

```bash
pnpm --filter @lpc-toolkit/web test:e2e:parity
```

Expected at this point: Playwright starts both servers, then exits with a no tests found message because `random-upstream-parity.spec.ts` does not exist yet. If upstream dependencies are missing, stop and report that local upstream cannot start without installing inside the read-only submodule; do not run install commands inside `upstream/`.

- [ ] **Step 4: Commit**

```bash
git add packages/web/playwright.parity.config.ts packages/web/package.json
git commit -m "test(web): add parity e2e runner"
```

---

### Task 5: Add Page Helpers And The Parity Spec

**Files:**
- Create: `packages/web/e2e/helpers/parity-pages.ts`
- Create: `packages/web/e2e/random-upstream-parity.spec.ts`

- [ ] **Step 1: Add page helper code**

Create `packages/web/e2e/helpers/parity-pages.ts`:

```ts
import type { BrowserContext, Page } from '@playwright/test';
import { expect } from '@playwright/test';
import { attachConsoleCollector, type CapturedError } from './console-collector';

export interface RgbaSnapshot {
  readonly width: number;
  readonly height: number;
  readonly data: readonly number[];
}

export interface ToolkitProbeSnapshot {
  readonly hash: string;
  readonly bodyType: string;
  readonly status: string;
  readonly creditsCount: number;
  readonly layers: readonly {
    readonly path: string;
    readonly zPos: number;
    readonly typeName: string;
  }[];
  readonly canvas: RgbaSnapshot;
}

export interface UpstreamSnapshot {
  readonly canvas: RgbaSnapshot;
}

export async function openToolkitCase(
  context: BrowserContext,
  hash: string,
): Promise<{
  readonly page: Page;
  readonly errors: CapturedError[];
  readonly snapshot: ToolkitProbeSnapshot;
}> {
  const page = await context.newPage();
  const errors = attachConsoleCollector(page);
  await page.goto(`/?assetSource=local&e2eProbe=1#${hash}`);

  await expect
    .poll(
      async () =>
        page.evaluate(() => window.__LPC_E2E__?.status ?? 'missing-probe'),
      { timeout: 45_000 },
    )
    .toBe('ready');

  const snapshot = await page.evaluate(() => {
    interface ToolkitProbe {
      readonly hash: string;
      readonly bodyType: string;
      readonly status: string;
      readonly creditsCount: number;
      readonly layers: readonly {
        readonly path: string;
        readonly zPos: number;
        readonly typeName: string;
      }[];
      readonly canvas: {
        readonly width: number;
        readonly height: number;
        readonly dataUrl: string;
      } | null;
    }
    const w = window as Window & { __LPC_E2E__?: ToolkitProbe };
    const probe = w.__LPC_E2E__;
    if (!probe || !probe.canvas) {
      throw new Error('Toolkit e2e probe did not expose a ready canvas');
    }
    const img = new Image();
    img.src = probe.canvas.dataUrl;
    return new Promise<ToolkitProbeSnapshot>((resolve, reject) => {
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = probe.canvas!.width;
        canvas.height = probe.canvas!.height;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        if (!ctx) {
          reject(new Error('2d context unavailable'));
          return;
        }
        ctx.drawImage(img, 0, 0);
        const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
        resolve({
          hash: probe.hash,
          bodyType: probe.bodyType,
          status: probe.status,
          creditsCount: probe.creditsCount,
          layers: probe.layers,
          canvas: {
            width: canvas.width,
            height: canvas.height,
            data: Array.from(data),
          },
        });
      };
      img.onerror = () => reject(new Error('Failed to decode toolkit canvas'));
    });
  });

  return { page, errors, snapshot };
}

export async function openUpstreamCase(
  context: BrowserContext,
  hash: string,
): Promise<{
  readonly page: Page;
  readonly errors: CapturedError[];
  readonly snapshot: UpstreamSnapshot;
}> {
  const page = await context.newPage();
  const errors = attachConsoleCollector(page);
  await page.goto(`http://127.0.0.1:5174/#${hash}`);

  await expect
    .poll(
      async () =>
        page.evaluate(() => {
          interface CanvasResult {
            readonly isOk: () => boolean;
          }
          interface UpstreamRenderer {
            readonly getCanvas: () => CanvasResult;
          }
          const w = window as Window & { canvasRenderer?: UpstreamRenderer };
          const renderer = w.canvasRenderer;
          if (!renderer) return 'missing-renderer';
          const result = renderer.getCanvas();
          return result.isOk() ? 'ready' : 'missing-canvas';
        }),
      { timeout: 45_000 },
    )
    .toBe('ready');

  const snapshot = await page.evaluate(() => {
    interface CanvasResult {
      readonly isErr: () => boolean;
      readonly value: HTMLCanvasElement;
    }
    interface UpstreamRenderer {
      readonly getCanvas: () => CanvasResult;
    }
    const w = window as Window & { canvasRenderer?: UpstreamRenderer };
    const renderer = w.canvasRenderer;
    if (!renderer) throw new Error('Upstream canvasRenderer missing');
    const result = renderer.getCanvas();
    if (result.isErr()) throw new Error('Upstream canvas missing');
    const canvas = result.value;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) throw new Error('Upstream 2d context unavailable');
    const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    return {
      canvas: {
        width: canvas.width,
        height: canvas.height,
        data: Array.from(data),
      },
    };
  });

  return { page, errors, snapshot };
}

export function formatErrors(errors: readonly CapturedError[]): string {
  return errors
    .map(
      (e, i) =>
        `[${i}] ${e.kind}: ${e.text}${e.location ? `\n    @ ${e.location}` : ''}`,
    )
    .join('\n');
}
```

- [ ] **Step 2: Add the parity spec**

Create `packages/web/e2e/random-upstream-parity.spec.ts`:

```ts
import { test, expect } from '@playwright/test';
import { diffRgba } from './helpers/pixel-diff';
import {
  OBSERVED_REGRESSION_CASE,
  SEEDED_RANDOM_CASES,
} from './helpers/seeded-rng';
import {
  formatErrors,
  openToolkitCase,
  openUpstreamCase,
} from './helpers/parity-pages';

test.describe('random upstream parity', () => {
  for (const seeded of SEEDED_RANDOM_CASES) {
    test(`${seeded.name} renders like upstream`, async ({ browser }) => {
      const context = await browser.newContext();
      try {
        const initial = await context.newPage();
        await initial.goto('/?assetSource=local&e2eProbe=1');
        const hash = await initial.evaluate(async (seed) => {
          interface ToolkitProbe {
            readonly hash: string;
            readonly status: string;
          }
          const w = window as Window & { __LPC_E2E__?: ToolkitProbe };
          const probeReady = async (): Promise<void> => {
            for (let i = 0; i < 300; i++) {
              if (w.__LPC_E2E__?.status === 'ready') return;
              await new Promise((resolve) => setTimeout(resolve, 100));
            }
            throw new Error('Toolkit probe did not become ready');
          };
          await probeReady();
          const beforeHash = w.__LPC_E2E__!.hash;
          const randomButton = document.querySelector<HTMLButtonElement>(
            '[title="Randomize outfit"]',
          );
          if (!randomButton) throw new Error('Randomize outfit button missing');
          const originalRandom = Math.random;
          let state = seed >>> 0;
          Math.random = () => {
            state += 0x6d2b79f5;
            let t = state;
            t = Math.imul(t ^ (t >>> 15), t | 1);
            t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
            return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
          };
          try {
            randomButton.click();
          } finally {
            Math.random = originalRandom;
          }
          for (let i = 0; i < 300; i++) {
            if (
              w.__LPC_E2E__?.status === 'ready' &&
              w.__LPC_E2E__.hash !== beforeHash
            ) {
              return w.__LPC_E2E__.hash;
            }
            await new Promise((resolve) => setTimeout(resolve, 100));
          }
          throw new Error('Randomized toolkit hash did not become ready');
        }, seeded.seed);
        await initial.close();

        await compareHashCase(context, {
          name: seeded.name,
          hash,
          source: `seed=${seeded.seed}`,
        });
      } finally {
        await context.close();
      }
    });
  }

  test(`${OBSERVED_REGRESSION_CASE.name} renders like upstream`, async ({
    browser,
  }) => {
    const context = await browser.newContext();
    try {
      await compareHashCase(context, OBSERVED_REGRESSION_CASE);
    } finally {
      await context.close();
    }
  });
});

async function compareHashCase(
  context: Parameters<typeof openToolkitCase>[0],
  testCase: { readonly name: string; readonly hash: string; readonly source: string },
): Promise<void> {
  const toolkit = await openToolkitCase(context, testCase.hash);
  const upstream = await openUpstreamCase(context, testCase.hash);

  const diagnosticHeader = [
    `case=${testCase.name}`,
    `source=${testCase.source}`,
    `hash=${testCase.hash}`,
    `toolkitHash=${toolkit.snapshot.hash}`,
    `toolkitBodyType=${toolkit.snapshot.bodyType}`,
    `toolkitLayers=${toolkit.snapshot.layers.map((l) => `${l.zPos}:${l.typeName}:${l.path}`).join('\\n')}`,
    `toolkitStatus=${toolkit.snapshot.status}`,
  ].join('\n');

  expect(toolkit.errors, `Toolkit errors:\n${diagnosticHeader}\n${formatErrors(toolkit.errors)}`).toEqual([]);
  expect(upstream.errors, `Upstream errors:\n${diagnosticHeader}\n${formatErrors(upstream.errors)}`).toEqual([]);
  expect(toolkit.snapshot.creditsCount, diagnosticHeader).toBeGreaterThan(0);
  expect(toolkit.snapshot.canvas.width, diagnosticHeader).toBe(
    upstream.snapshot.canvas.width,
  );
  expect(toolkit.snapshot.canvas.height, diagnosticHeader).toBe(
    upstream.snapshot.canvas.height,
  );

  const diff = diffRgba(
    toolkit.snapshot.canvas.data,
    upstream.snapshot.canvas.data,
    toolkit.snapshot.canvas.width,
    toolkit.snapshot.canvas.height,
  );
  expect(
    diff.mismatchCount,
    `${diagnosticHeader}\npixelSamples=${JSON.stringify(diff.samples, null, 2)}`,
  ).toBe(0);

  await toolkit.page.close();
  await upstream.page.close();
}
```

- [ ] **Step 3: Run typecheck**

Run:

```bash
pnpm --filter @lpc-toolkit/web typecheck
```

Expected: PASS. If Playwright helper code is outside the web `tsconfig` include set, run the parity test in Step 4 as the TypeScript compile check for e2e files.

- [ ] **Step 4: Run the parity test**

Run:

```bash
pnpm --filter @lpc-toolkit/web test:e2e:parity
```

Expected: The test may FAIL on the observed regression case because the user already saw a mismatch. That is acceptable for this task if the failure is a clear pixel mismatch with seed/hash/layer diagnostics and both pages render without infrastructure errors. If it fails because upstream cannot start, browser helpers cannot read canvases, or TypeScript compilation fails, fix the implementation before committing.

- [ ] **Step 5: Commit**

If the parity infrastructure runs and produces an actionable mismatch:

```bash
git add packages/web/e2e/helpers/parity-pages.ts packages/web/e2e/random-upstream-parity.spec.ts
git commit -m "test(web): compare random renders with upstream"
```

---

### Task 6: Final Verification And Notes

**Files:**
- Modify only if needed: `docs/superpowers/notes/<date>-random-upstream-parity-result.md`

- [ ] **Step 1: Run unit tests for new helpers**

Run:

```bash
pnpm --filter @lpc-toolkit/web test -- e2e-probe-from-url.test.ts pixel-diff.test.ts
```

Expected: PASS.

- [ ] **Step 2: Run web typecheck**

Run:

```bash
pnpm --filter @lpc-toolkit/web typecheck
```

Expected: PASS.

- [ ] **Step 3: Run parity e2e**

Run:

```bash
pnpm --filter @lpc-toolkit/web test:e2e:parity
```

Expected: Either PASS, or FAIL with a clear mismatch report for the observed regression hash. Infrastructure failures are not acceptable final output.

- [ ] **Step 4: Record a note only if parity fails on a real mismatch**

If Step 3 fails because toolkit and upstream pixels differ, create `docs/superpowers/notes/2026-05-30-random-upstream-parity-result.md`:

```md
# Random Upstream Parity Result

**Date:** 2026-05-30
**Command:** `pnpm --filter @lpc-toolkit/web test:e2e:parity`

## Result

The parity runner starts both local apps and reaches pixel comparison. It reports
a toolkit-vs-upstream mismatch for the observed regression hash.

## Reproduction

Run:

```bash
pnpm --filter @lpc-toolkit/web test:e2e:parity
```

The failure output includes the fixed hash, toolkit layer list, canvas
dimensions, mismatch count, and sample pixel coordinates.

## Next Step

Use the mismatch diagnostics to investigate hash parsing, layer path
resolution, draw order, and recolor handling for the reported selected items.
```

- [ ] **Step 5: Commit final note if created**

If Step 4 created a note:

```bash
git add docs/superpowers/notes/2026-05-30-random-upstream-parity-result.md
git commit -m "docs: record random upstream parity result"
```

If no note was created, do not make an empty commit.
