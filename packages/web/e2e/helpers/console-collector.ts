import type { ConsoleMessage, Page, Request, Response } from '@playwright/test';

/** Error channels collected from Playwright page and network events. */
export type CapturedErrorKind =
  | 'console.error'
  | 'console.warn'
  | 'pageerror'
  | 'response'
  | 'requestfailed';

/** Normalized browser/page/network error captured during E2E tests. */
export type CapturedError = {
  kind: CapturedErrorKind;
  text: string;
  location?: string;
};

/**
 * Chromium auto-emits a `console.error` for every failed resource load
 * (4xx/5xx status, net::ERR_*, CORS rejection). These duplicate the
 * structured events delivered to the `response` and `requestfailed`
 * listeners. Filter them here so the application-`console` channel
 * carries only app-code emissions.
 */
const BROWSER_AUTO_RESOURCE_PATTERNS: readonly RegExp[] = [
  /^Failed to load resource: the server responded with a status of \d{3}/,
  /^Failed to load resource: net::ERR_/,
  /^Access to fetch at .* has been blocked by CORS policy/,
];

/** True when Chromium emitted a duplicate resource-load console message. */
export function isBrowserAutoConsoleText(text: string): boolean {
  return BROWSER_AUTO_RESOURCE_PATTERNS.some((re) => re.test(text));
}

/** True when a missing sprite placeholder should suppress a console message. */
export function isKnownSpriteAssetConsoleText(text: string): boolean {
  return /^Failed to load (?:image|sprite): spritesheets\/.+$/.test(text);
}

/** True for noisy WebGL readback warnings outside app behavior. */
export function isWebGlReadbackWarningText(text: string): boolean {
  return /^\[\.WebGL-[^\]]+\]GL Driver Message \(OpenGL, Performance, .*ReadPixels/.test(
    text,
  );
}

/**
 * Narrowly anchored allowlist. The only entry today is the catalog
 * data-quality warning; the root cause is in `upstream/` (a read-only
 * git submodule — see CLAUDE.md hard rule). See
 * docs/superpowers/specs/2026-05-28-e2e-noise-cleanup-design.md §3.3.
 */
interface ConsoleAllowlistEntry {
  kind: 'console.warn' | 'console.error';
  textPattern: RegExp;
  locationPattern: RegExp;
}

const APP_CONSOLE_ALLOWLIST: readonly ConsoleAllowlistEntry[] = [
  {
    // `msg.text()` from Playwright concatenates the optional array arg of
    // `console.warn(text, warnings)` into the text as Chromium's preview
    // serialization, e.g. ` [Object, Object, ...]`. The optional suffix in
    // the pattern below accommodates that without widening to arbitrary
    // trailing content.
    kind: 'console.warn',
    textPattern:
      /^\[catalog\] \d+ load warning\(s\)(?: \[Object(?:, Object)*\])?$/,
    locationPattern: /\/catalog\/load-catalog\.ts/,
  },
];

/** True when an app-console entry is intentionally allowlisted. */
export function isAllowlistedConsoleEntry(entry: {
  kind: CapturedErrorKind;
  text: string;
  location?: string;
}): boolean {
  if (entry.kind !== 'console.warn' && entry.kind !== 'console.error') {
    return false;
  }
  if (entry.location === undefined) return false;
  const location = entry.location;
  return APP_CONSOLE_ALLOWLIST.some(
    (rule) =>
      rule.kind === entry.kind &&
      rule.textPattern.test(entry.text) &&
      rule.locationPattern.test(location),
  );
}

/**
 * Sprite-asset URLs map to the `/spritesheets/` path segment in both local
 * (Vite dev) and upstream-mirror URLs. The catalog/compose layer can resolve
 * to paths that don't exist (tracked in
 * docs/superpowers/notes/2026-05-28-catalog-sprite-404-investigation.md);
 * the app handles missing sprites with a grey placeholder, not an exception,
 * so these are out-of-scope for this smoke test.
 */
export function isSpriteAssetUrl(url: string): boolean {
  return /\/spritesheets\//.test(url);
}

/** Attach collectors for console, page, response, and request failures. */
export function attachConsoleCollector(page: Page): CapturedError[] {
  const errors: CapturedError[] = [];

  page.on('console', (msg: ConsoleMessage) => {
    const type = msg.type();
    if (type !== 'error' && type !== 'warning') return;
    const text = msg.text();
    if (isBrowserAutoConsoleText(text)) return;
    if (isKnownSpriteAssetConsoleText(text)) return;
    if (type === 'warning' && isWebGlReadbackWarningText(text)) return;
    const kind: 'console.error' | 'console.warn' =
      type === 'error' ? 'console.error' : 'console.warn';
    const location = formatLocation(msg.location());
    const entry: CapturedError = {
      kind,
      text,
      ...(location !== undefined && { location }),
    };
    if (isAllowlistedConsoleEntry(entry)) return;
    errors.push(entry);
  });

  page.on('pageerror', (err: Error) => {
    const location = err.stack?.split('\n')[1]?.trim();
    errors.push({
      kind: 'pageerror',
      text: `${err.name}: ${err.message}`,
      ...(location !== undefined && { location }),
    });
  });

  page.on('response', (res: Response) => {
    const status = res.status();
    if (status < 400 || status >= 600) return;
    const url = res.url();
    if (isSpriteAssetUrl(url)) return;
    errors.push({
      kind: 'response',
      text: `HTTP ${status}`,
      location: url,
    });
  });

  page.on('requestfailed', (req: Request) => {
    const url = req.url();
    if (isSpriteAssetUrl(url)) return;
    const failure = req.failure();
    errors.push({
      kind: 'requestfailed',
      text: failure ? failure.errorText : 'request failed',
      location: url,
    });
  });

  return errors;
}

function formatLocation(loc: {
  url: string;
  lineNumber: number;
  columnNumber: number;
}): string | undefined {
  return loc.url ? `${loc.url}:${loc.lineNumber}:${loc.columnNumber}` : undefined;
}
