import { expect, type BrowserContext, type Page } from '@playwright/test';
import {
  attachConsoleCollector,
  type CapturedError,
} from './console-collector';

/** Base64-encoded RGBA capture with its canvas dimensions. */
export interface RgbaSnapshot {
  readonly width: number;
  readonly height: number;
  readonly dataBase64: string;
}

/** Local toolkit probe data captured from the test-only browser hook. */
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
  readonly rgba: RgbaSnapshot;
}

/** Upstream canvas capture used as the parity baseline. */
export interface UpstreamSnapshot {
  readonly rgba: RgbaSnapshot;
}

interface ToolkitCase {
  readonly page: Page;
  readonly errors: CapturedError[];
  readonly snapshot: ToolkitProbeSnapshot;
}

interface UpstreamCase {
  readonly page: Page;
  readonly errors: CapturedError[];
  readonly snapshot: UpstreamSnapshot;
}

interface ToolkitBrowserProbe {
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

interface UpstreamCanvasResult {
  readonly isOk: () => boolean;
  readonly value?: HTMLCanvasElement;
}

interface UpstreamCanvasRenderer {
  readonly getCanvas: () => UpstreamCanvasResult;
}

interface UpstreamImageTracker {
  readonly pending: number;
  readonly version: number;
}

const UPSTREAM_BASE_URL = 'http://127.0.0.1:5174';
const UPSTREAM_METADATA_ROUTE =
  /^http:\/\/127\.0\.0\.1:5174\/(?:index|item|layers)-metadata\.js$/;

/** Open the local toolkit, wait for its E2E probe, and capture RGBA output. */
export async function openToolkitCase(
  context: BrowserContext,
  hash: string,
): Promise<ToolkitCase> {
  const page = await context.newPage();
  const errors = attachConsoleCollector(page);

  await page.goto(`/?assetSource=local&e2eProbe=1#${hash}`);
  await expect
    .poll(
      () =>
        page.evaluate(() => {
          const win = window as Window & { __LPC_E2E__?: ToolkitBrowserProbe };
          return win.__LPC_E2E__?.status ?? 'missing-probe';
        }),
      {
        timeout: 60_000,
        message: `toolkit probe did not become ready for hash: ${hash}`,
      },
    )
    .toBe('ready');

  const snapshot = await page.evaluate(async () => {
    const win = window as Window & { __LPC_E2E__?: ToolkitBrowserProbe };
    const probe = win.__LPC_E2E__;
    if (!probe) {
      throw new Error('Toolkit e2e probe is missing.');
    }
    if (!probe.canvas) {
      throw new Error(`Toolkit e2e probe canvas is missing; status=${probe.status}.`);
    }

    const image = new Image();
    const loaded = new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error('Toolkit dataUrl image decode failed.'));
    });
    image.src = probe.canvas.dataUrl;
    await loaded;

    const canvas = document.createElement('canvas');
    canvas.width = probe.canvas.width;
    canvas.height = probe.canvas.height;
    const context2d = canvas.getContext('2d');
    if (!context2d) {
      throw new Error('Toolkit dataUrl decode canvas 2d context is missing.');
    }

    context2d.drawImage(image, 0, 0);
    const imageData = context2d.getImageData(0, 0, canvas.width, canvas.height);

    function imageDataToBase64(bytes: Uint8ClampedArray): string {
      let binary = '';
      const chunkSize = 0x8000;
      for (let offset = 0; offset < bytes.length; offset += chunkSize) {
        const chunk = bytes.subarray(offset, offset + chunkSize);
        binary += String.fromCharCode(...chunk);
      }
      return btoa(binary);
    }

    return {
      hash: probe.hash,
      bodyType: probe.bodyType,
      status: probe.status,
      creditsCount: probe.creditsCount,
      layers: probe.layers,
      rgba: {
        width: canvas.width,
        height: canvas.height,
        dataBase64: imageDataToBase64(imageData.data),
      },
    };
  });

  return { page, errors, snapshot };
}

/** Open the upstream mirror, wait for its renderer, and capture RGBA output. */
export async function openUpstreamCase(
  context: BrowserContext,
  hash: string,
): Promise<UpstreamCase> {
  const page = await context.newPage();
  const errors = attachConsoleCollector(page);

  await routeUpstreamMetadata(page);
  await page.addInitScript(() => {
    // Intercept upstream's setPaletteRecolorMode assignment and force CPU mode
    let resolvedFn: ((mode: string) => void) | null = null;
    Object.defineProperty(window, 'setPaletteRecolorMode', {
      configurable: true,
      get() {
        return resolvedFn;
      },
      set(fn) {
        resolvedFn = fn;
        if (typeof fn === 'function') {
          fn('cpu');
        }
      }
    });

    let pendingImages = 0;
    let trackerVersion = 0;
    const imageSrc = Object.getOwnPropertyDescriptor(
      HTMLImageElement.prototype,
      'src',
    );

    if (imageSrc?.set && imageSrc.get) {
      Object.defineProperty(window, '__LPC_UPSTREAM_IMAGE_TRACKER__', {
        configurable: true,
        value: {
          get pending() {
            return pendingImages;
          },
          get version() {
            return trackerVersion;
          },
        },
      });

      Object.defineProperty(HTMLImageElement.prototype, 'src', {
        configurable: true,
        enumerable: imageSrc.enumerable ?? true,
        get: imageSrc.get,
        set(value: string) {
          if (value) {
            pendingImages += 1;
            trackerVersion += 1;
            let settled = false;
            const settle = () => {
              if (settled) return;
              settled = true;
              pendingImages = Math.max(0, pendingImages - 1);
              trackerVersion += 1;
            };
            this.addEventListener('load', settle, { once: true });
            this.addEventListener('error', settle, { once: true });
          }
          imageSrc.set!.call(this, value);
        },
      });
    }
  });
  await page.goto(`${UPSTREAM_BASE_URL}/?debug=false#${hash}`);
  await expect
    .poll(
      () =>
        page.evaluate(() => {
          const win = window as Window & {
            canvasRenderer?: UpstreamCanvasRenderer;
          };
          const renderer = win.canvasRenderer;
          if (!renderer) return 'missing-renderer';
          return renderer.getCanvas().isOk() ? 'ready' : 'missing-canvas';
        }),
      {
        timeout: 60_000,
        message: `upstream canvas did not become ready for hash: ${hash}`,
      },
    )
    .toBe('ready');

  // Wait for the upstream Mithril rendering busy overlay to disappear and settle
  await page.locator('.preview-canvas-busy').waitFor({ state: 'detached', timeout: 10000 }).catch(() => {});
  await waitForUpstreamImagesIdle(page, hash);
  await waitForUpstreamCanvasStable(page, hash);

  const snapshot = await page.evaluate(() => {
    const win = window as Window & {
      canvasRenderer?: UpstreamCanvasRenderer;
    };
    const renderer = win.canvasRenderer;
    if (!renderer) {
      throw new Error('Upstream canvasRenderer is missing.');
    }

    const canvasResult = renderer.getCanvas();
    if (!canvasResult.isOk() || !canvasResult.value) {
      throw new Error('Upstream canvasRenderer.getCanvas() did not return a canvas.');
    }

    const canvas = canvasResult.value;
    const context2d = canvas.getContext('2d');
    if (!context2d) {
      throw new Error('Upstream canvas 2d context is missing.');
    }

    const imageData = context2d.getImageData(0, 0, canvas.width, canvas.height);

    function imageDataToBase64(bytes: Uint8ClampedArray): string {
      let binary = '';
      const chunkSize = 0x8000;
      for (let offset = 0; offset < bytes.length; offset += chunkSize) {
        const chunk = bytes.subarray(offset, offset + chunkSize);
        binary += String.fromCharCode(...chunk);
      }
      return btoa(binary);
    }

    return {
      rgba: {
        width: canvas.width,
        height: canvas.height,
        dataBase64: imageDataToBase64(imageData.data),
      },
    };
  });

  return { page, errors, snapshot };
}

async function waitForUpstreamImagesIdle(page: Page, hash: string): Promise<void> {
  let lastVersion = -1;
  let stablePolls = 0;

  await expect
    .poll(
      async () => {
        const tracker = await page.evaluate(() => {
          const win = window as Window & {
            __LPC_UPSTREAM_IMAGE_TRACKER__?: UpstreamImageTracker;
          };
          return win.__LPC_UPSTREAM_IMAGE_TRACKER__ ?? null;
        });

        if (!tracker) return 'missing-tracker';
        if (tracker.pending !== 0) {
          lastVersion = tracker.version;
          stablePolls = 0;
          return `pending:${tracker.pending}`;
        }
        if (tracker.version !== lastVersion) {
          lastVersion = tracker.version;
          stablePolls = 0;
          return 'settling';
        }
        stablePolls += 1;
        return stablePolls >= 2 ? 'idle' : 'settling';
      },
      {
        timeout: 60_000,
        message: `upstream images did not become idle for hash: ${hash}`,
      },
    )
    .toBe('idle');
}

async function waitForUpstreamCanvasStable(page: Page, hash: string): Promise<void> {
  let previousSignature = '';
  let stablePolls = 0;

  await expect
    .poll(
      async () => {
        const signature = await page.evaluate(() => {
          const win = window as Window & {
            canvasRenderer?: UpstreamCanvasRenderer;
          };
          const canvasResult = win.canvasRenderer?.getCanvas();
          if (!canvasResult?.isOk() || !canvasResult.value) return 'missing-canvas';

          const canvas = canvasResult.value;
          const context2d = canvas.getContext('2d');
          if (!context2d) return 'missing-context';

          const sampleY = Math.max(0, Math.floor(canvas.height * 0.84));
          const sample = context2d.getImageData(0, sampleY, canvas.width, 1).data;
          let checksum = 0;
          for (let i = 0; i < sample.length; i += 16) {
            checksum = (checksum + sample[i]! * 3 + sample[i + 1]! * 5 + sample[i + 2]! * 7 + sample[i + 3]! * 11) >>> 0;
          }
          return `${canvas.width}x${canvas.height}:${checksum}`;
        });

        if (signature !== previousSignature) {
          previousSignature = signature;
          stablePolls = 0;
          return 'settling';
        }
        stablePolls += 1;
        return stablePolls >= 2 ? 'stable' : 'settling';
      },
      {
        timeout: 60_000,
        message: `upstream canvas did not stabilize for hash: ${hash}`,
      },
    )
    .toBe('stable');
}

async function routeUpstreamMetadata(page: Page): Promise<void> {
  await page.route(UPSTREAM_METADATA_ROUTE, async (route) => {
    const basename = new URL(route.request().url()).pathname.slice(1);
    const response = await route.fetch({
      url: `${UPSTREAM_BASE_URL}/dist/${basename}`,
    });
    await route.fulfill({ response });
  });
}

/** Format captured page errors into stable assertion output. */
export function formatErrors(errors: readonly CapturedError[]): string {
  return errors
    .map(
      (error, index) =>
        `[${index}] ${error.kind}: ${error.text}${
          error.location ? `\n    @ ${error.location}` : ''
        }`,
    )
    .join('\n');
}
