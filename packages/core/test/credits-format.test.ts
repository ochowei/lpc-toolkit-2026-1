import { describe, expect, it } from 'vitest';
import { creditsToTxt } from '../src/credits-format.js';
import type { CreditsManifest } from '../src/types.js';

const SAMPLE: CreditsManifest = {
  entries: [
    {
      file: 'body/bodies/male',
      notes: '',
      authors: ['Alice', 'Bob'],
      licenses: ['CC-BY-SA 3.0', 'GPL 3.0'],
      urls: ['https://example.com/a'],
    },
    {
      file: 'head/faces',
      notes: 'sample notes',
      authors: ['Carol'],
      licenses: ['CC0'],
      urls: ['https://example.com/b', 'https://example.com/c'],
    },
  ],
  resolvedPaths: [
    'body/bodies/male/walk.png',
    'head/faces/male/blush/walk.png',
  ],
  licenses: ['CC-BY-SA 3.0', 'GPL 3.0', 'CC0'],
};

describe('creditsToTxt', () => {
  it('matches upstream creditsToTxt format byte-for-byte', () => {
    const out = creditsToTxt(SAMPLE, 'walk');
    const expected =
      'body/bodies/male/walk.png\n' +
      '\t- Licenses:\n\t\t- CC-BY-SA 3.0\n\t\t- GPL 3.0\n' +
      '\t- Authors:\n\t\t- Alice\n\t\t- Bob\n' +
      '\t- Links:\n\t\t- https://example.com/a\n\n' +
      'head/faces/male/blush/walk.png\n' +
      '\t- Note: sample notes\n' +
      '\t- Licenses:\n\t\t- CC0\n' +
      '\t- Authors:\n\t\t- Carol\n' +
      '\t- Links:\n\t\t- https://example.com/b\n\t\t- https://example.com/c\n\n';
    expect(out).toBe(expected);
  });

  it('falls back to entry.file + /<anim>.png when resolvedPaths is empty', () => {
    const manifest: CreditsManifest = { ...SAMPLE, resolvedPaths: [] };
    const out = creditsToTxt(manifest, 'walk');
    expect(out.startsWith('body/bodies/male/walk.png\n')).toBe(true);
    expect(out).toContain('head/faces/walk.png\n');
  });

  it('returns empty string for empty manifest', () => {
    const out = creditsToTxt(
      { entries: [], resolvedPaths: [], licenses: [] },
      'walk',
    );
    expect(out).toBe('');
  });
});
