/** Compares local toolkit output against upstream-rendered random cases. */
import { test, expect, type BrowserContext, type Page } from '@playwright/test';
import { diffRgba } from './helpers/pixel-diff';
import {
  MINIMAL_PARITY_CASE,
  OBSERVED_REGRESSION_CASE,
  SEEDED_RANDOM_CASES,
  type FixedHashCase,
  type SeededCase,
} from './helpers/seeded-rng';
import {
  formatErrors,
  openToolkitCase,
  openUpstreamCase,
  type ToolkitProbeSnapshot,
  type UpstreamSnapshot,
} from './helpers/parity-pages';

interface ToolkitBrowserProbe {
  readonly hash: string;
  readonly status: string;
}

interface CompareHashCase {
  readonly name: string;
  readonly hash: string;
  readonly source: string;
}

test.describe('random upstream parity', () => {
  for (const randomCase of SEEDED_RANDOM_CASES) {
    test(randomCase.name, async ({ context }) => {
      const hash = await makeSeededRandomHash(context, randomCase);
      await compareHashCase(context, {
        name: randomCase.name,
        source: `seed=${randomCase.seed}`,
        hash,
      });
    });
  }

  test(MINIMAL_PARITY_CASE.name, async ({ context }) => {
    await compareHashCase(context, MINIMAL_PARITY_CASE);
  });

  test(OBSERVED_REGRESSION_CASE.name, async ({ context }) => {
    await compareHashCase(context, OBSERVED_REGRESSION_CASE);
  });
});

async function makeSeededRandomHash(
  context: BrowserContext,
  randomCase: SeededCase,
): Promise<string> {
  const page = await context.newPage();

  try {
    await installSeededRandom(page, randomCase.seed);
    await page.goto('/?assetSource=zip&e2eProbe=1');
    await expect
      .poll(
        () =>
          page.evaluate(() => {
            const win = window as Window & {
              __LPC_E2E__?: ToolkitBrowserProbe;
            };
            return win.__LPC_E2E__?.status ?? 'missing-probe';
          }),
        {
          timeout: 60_000,
          message: `toolkit probe did not become ready before randomizing ${randomCase.name}`,
        },
      )
      .toBe('ready');

    const beforeHash = await readToolkitHash(page);
    await page.getByTitle('Randomize outfit').click();
    await page.waitForFunction(
      (previousHash: string) => {
        const win = window as Window & {
          __LPC_E2E__?: ToolkitBrowserProbe;
        };
        const probe = win.__LPC_E2E__;
        return (
          probe?.status === 'ready' &&
          probe.hash.length > 0 &&
          probe.hash !== previousHash
        );
      },
      beforeHash,
      { timeout: 60_000 },
    );

    const hash = await readToolkitHash(page);
    return hash;
  } finally {
    await page.close();
  }
}

async function installSeededRandom(page: Page, seed: number): Promise<void> {
  await page.addInitScript((seedValue: number) => {
    function mulberry32(seedNumber: number): () => number {
      let state = seedNumber >>> 0;

      return () => {
        let value = (state += 0x6d2b79f5);
        value = Math.imul(value ^ (value >>> 15), value | 1);
        value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
        return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
      };
    }

    Math.random = mulberry32(seedValue);
  }, seed);
}

async function readToolkitHash(page: Page): Promise<string> {
  return page.evaluate(() => {
    const win = window as Window & { __LPC_E2E__?: ToolkitBrowserProbe };
    const hash = win.__LPC_E2E__?.hash;
    if (!hash) {
      throw new Error('Toolkit e2e probe hash is missing.');
    }
    return hash;
  });
}

async function compareHashCase(
  context: BrowserContext,
  hashCase: FixedHashCase | CompareHashCase,
): Promise<void> {
  const toolkit = await openToolkitCase(context, hashCase.hash);
  const upstream = await openUpstreamCase(context, toolkit.snapshot.hash);

  try {
    expect(
      toolkit.errors.length,
      `toolkit captured errors:\n${formatErrorPreview(toolkit.errors)}`,
    ).toBe(0);
    expect(
      upstream.errors.length,
      `upstream captured errors:\n${formatErrorPreview(upstream.errors)}`,
    ).toBe(0);
    expect(
      toolkit.snapshot.creditsCount,
      `toolkit creditsCount must be positive for ${hashCase.name}`,
    ).toBeGreaterThan(0);
    expect(
      `${toolkit.snapshot.rgba.width}x${toolkit.snapshot.rgba.height}`,
      parityDiagnostic(hashCase, toolkit.snapshot, upstream.snapshot, []),
    ).toBe(`${upstream.snapshot.rgba.width}x${upstream.snapshot.rgba.height}`);

    const diff = diffRgba(
      decodeRgba(toolkit.snapshot.rgba.dataBase64),
      decodeRgba(upstream.snapshot.rgba.dataBase64),
      toolkit.snapshot.rgba.width,
      toolkit.snapshot.rgba.height,
    );

    expect(
      diff.mismatchCount,
      parityDiagnostic(hashCase, toolkit.snapshot, upstream.snapshot, diff.samples),
    ).toBe(0);
  } finally {
    await toolkit.page.close();
    await upstream.page.close();
  }
}

function decodeRgba(dataBase64: string): Uint8Array {
  return Buffer.from(dataBase64, 'base64');
}

function formatErrorPreview(
  errors: Parameters<typeof formatErrors>[0],
): string {
  const previewLimit = 20;
  const preview = formatErrors(errors.slice(0, previewLimit));
  if (errors.length <= previewLimit) return preview;
  return `${preview}\n... ${errors.length - previewLimit} more error(s)`;
}

function parityDiagnostic(
  hashCase: FixedHashCase | CompareHashCase,
  toolkit: ToolkitProbeSnapshot,
  upstream: UpstreamSnapshot,
  pixelSamples: ReturnType<typeof diffRgba>['samples'],
): string {
  return [
    `case=${hashCase.name}`,
    `source=${hashCase.source}`,
    `inputHash=${hashCase.hash}`,
    `canonicalHash=${toolkit.hash}`,
    `toolkitHash=${toolkit.hash}`,
    `toolkitBodyType=${toolkit.bodyType}`,
    `toolkitStatus=${toolkit.status}`,
    `toolkitDimensions=${toolkit.rgba.width}x${toolkit.rgba.height}`,
    `upstreamDimensions=${upstream.rgba.width}x${upstream.rgba.height}`,
    `toolkitLayers=${JSON.stringify(toolkit.layers)}`,
    `pixelSamples=${JSON.stringify(pixelSamples)}`,
  ].join('\n');
}
