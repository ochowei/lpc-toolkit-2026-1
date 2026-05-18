import { describe, expect, it } from 'vitest';
import { resolveSpriteUrl } from '../src/adapter/browser-canvas-adapter';

describe('resolveSpriteUrl', () => {
  it('resolves a core sprite path against the document base', () => {
    expect(
      resolveSpriteUrl('spritesheets/body/bodies/male/walk.png', 'http://x/'),
    ).toBe('http://x/spritesheets/body/bodies/male/walk.png');
  });

  it('resolves under a sub-path base', () => {
    expect(
      resolveSpriteUrl('spritesheets/a.png', 'http://x/app/'),
    ).toBe('http://x/app/spritesheets/a.png');
  });
});
