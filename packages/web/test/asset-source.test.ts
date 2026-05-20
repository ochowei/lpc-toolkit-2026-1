import { describe, expect, it } from 'vitest';
import {
  resolveSpriteUrlCandidates,
  UPSTREAM_SPRITESHEET_BASE_URL,
} from '../src/adapter/asset-source';

describe('resolveSpriteUrlCandidates', () => {
  it('returns a local sprite URL for local source', () => {
    expect(
      resolveSpriteUrlCandidates(
        'spritesheets/a.png',
        'http://x/app/',
        'local',
      ),
    ).toEqual(['http://x/app/spritesheets/a.png']);
  });

  it('returns an upstream sprite URL for upstream source', () => {
    expect(
      resolveSpriteUrlCandidates(
        'spritesheets/a.png',
        'http://x/app/',
        'upstream',
      ),
    ).toEqual([`${UPSTREAM_SPRITESHEET_BASE_URL}spritesheets/a.png`]);
  });

  it('returns local then upstream sprite URLs for auto source', () => {
    expect(
      resolveSpriteUrlCandidates('spritesheets/a.png', 'http://x/app/', 'auto'),
    ).toEqual([
      'http://x/app/spritesheets/a.png',
      `${UPSTREAM_SPRITESHEET_BASE_URL}spritesheets/a.png`,
    ]);
  });
});
