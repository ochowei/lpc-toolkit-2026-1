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
    const context = createRuntimeContext({
      cwd: '/repo',
      assetsRoot: '/game/lpc-assets',
    });

    expect(context.assetsRoot).toBe('/game/lpc-assets');
    expect(context.spritesheetsBaseUrl).toBe('/game/lpc-assets');
  });
});
