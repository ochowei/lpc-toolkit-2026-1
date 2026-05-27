import { describe, expect, it } from 'vitest';
import {
  isAllowlistedConsoleEntry,
  isBrowserAutoConsoleText,
  isSpriteAssetUrl,
} from '../e2e/helpers/console-collector';

describe('isBrowserAutoConsoleText', () => {
  it('matches HTTP 4xx/5xx auto-emit', () => {
    expect(
      isBrowserAutoConsoleText(
        'Failed to load resource: the server responded with a status of 404 ()',
      ),
    ).toBe(true);
    expect(
      isBrowserAutoConsoleText(
        'Failed to load resource: the server responded with a status of 503 ()',
      ),
    ).toBe(true);
  });

  it('matches net::ERR_* auto-emit', () => {
    expect(
      isBrowserAutoConsoleText('Failed to load resource: net::ERR_FAILED'),
    ).toBe(true);
    expect(
      isBrowserAutoConsoleText(
        'Failed to load resource: net::ERR_INSUFFICIENT_RESOURCES',
      ),
    ).toBe(true);
  });

  it('matches the CORS-policy auto-emit', () => {
    expect(
      isBrowserAutoConsoleText(
        "Access to fetch at 'https://example.com/a.png' from origin 'http://localhost:5173' has been blocked by CORS policy: ...",
      ),
    ).toBe(true);
  });

  it('does not match application-level error text', () => {
    expect(isBrowserAutoConsoleText('TypeError: foo is undefined')).toBe(false);
    expect(isBrowserAutoConsoleText('[catalog] 3 load warning(s)')).toBe(false);
    expect(isBrowserAutoConsoleText('Failed to load resource')).toBe(false);
  });
});

describe('isAllowlistedConsoleEntry', () => {
  it('matches the catalog warning with the canonical text shape and location', () => {
    expect(
      isAllowlistedConsoleEntry({
        kind: 'console.warn',
        text: '[catalog] 35 load warning(s)',
        location: 'http://localhost:5173/src/catalog/load-catalog.ts:50:12',
      }),
    ).toBe(true);
  });

  it('matches the catalog warning with the Chromium array-preview suffix', () => {
    expect(
      isAllowlistedConsoleEntry({
        kind: 'console.warn',
        text: '[catalog] 35 load warning(s) [Object, Object, Object, Object, Object]',
        location: 'http://localhost:5173/src/catalog/load-catalog.ts:50:12',
      }),
    ).toBe(true);
  });

  it('rejects the catalog text with extra trailing content', () => {
    expect(
      isAllowlistedConsoleEntry({
        kind: 'console.warn',
        text: '[catalog] 35 load warning(s) extra',
        location: 'http://localhost:5173/src/catalog/load-catalog.ts:50:12',
      }),
    ).toBe(false);
  });

  it('rejects a different catalog warning shape', () => {
    expect(
      isAllowlistedConsoleEntry({
        kind: 'console.warn',
        text: '[catalog] palette X missing',
        location: 'http://localhost:5173/src/catalog/load-catalog.ts:50:12',
      }),
    ).toBe(false);
  });

  it('rejects matching text from a different location', () => {
    expect(
      isAllowlistedConsoleEntry({
        kind: 'console.warn',
        text: '[catalog] 35 load warning(s)',
        location: 'http://localhost:5173/src/some-other-file.ts:1:1',
      }),
    ).toBe(false);
  });

  it('rejects console.error even when text shape matches', () => {
    expect(
      isAllowlistedConsoleEntry({
        kind: 'console.error',
        text: '[catalog] 35 load warning(s)',
        location: 'http://localhost:5173/src/catalog/load-catalog.ts:50:12',
      }),
    ).toBe(false);
  });

  it('rejects when location is missing', () => {
    expect(
      isAllowlistedConsoleEntry({
        kind: 'console.warn',
        text: '[catalog] 35 load warning(s)',
      }),
    ).toBe(false);
  });
});

describe('isSpriteAssetUrl', () => {
  it('matches paths containing /spritesheets/', () => {
    expect(isSpriteAssetUrl('http://localhost:5173/spritesheets/body/x.png')).toBe(true);
    expect(
      isSpriteAssetUrl(
        'https://liberatedpixelcup.github.io/Universal-LPC-Spritesheet-Character-Generator/spritesheets/hat/y.png',
      ),
    ).toBe(true);
  });

  it('does not match non-sprite URLs', () => {
    expect(isSpriteAssetUrl('http://localhost:5173/src/catalog/load-catalog.ts')).toBe(false);
    expect(isSpriteAssetUrl('http://localhost:5173/index.html')).toBe(false);
    expect(isSpriteAssetUrl('http://localhost:5173/api/data.json')).toBe(false);
  });
});
