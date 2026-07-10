import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { createRuntimeContext } from '../src/context.js';

describe('createRuntimeContext', () => {
  it('uses repo assets by default', () => {
    const cwd = path.resolve('../../');
    const context = createRuntimeContext({ cwd });

    expect(context.repoRoot).toBe(cwd);
    expect(context.assetsRoot).toBe(path.join(cwd, 'assets'));
    expect(context.customAssetsRoot).toBe(path.join(cwd, 'assets_custom'));
    expect(context.spritesheetsBaseUrl).toBe(path.join(cwd, 'assets'));
  });

  it('accepts asset root override', () => {
    const assetsRoot = path.resolve('/game/lpc-assets');
    const context = createRuntimeContext({
      cwd: path.resolve('/repo'),
      assetsRoot,
    });

    expect(context.assetsRoot).toBe(assetsRoot);
    expect(context.spritesheetsBaseUrl).toBe(assetsRoot);
  });

  it('preserves URL-like spritesheet base overrides', () => {
    const context = createRuntimeContext({
      cwd: '/repo',
      spritesheetsBaseUrl: 'https://example.com/assets',
    });

    expect(context.spritesheetsBaseUrl).toBe('https://example.com/assets');
  });
});
