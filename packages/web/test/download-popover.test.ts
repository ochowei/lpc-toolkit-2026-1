import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('DownloadPopover boundaries', () => {
  it('is presentation-only and exposes all seven action controls', () => {
    const source = readFileSync(
      new URL('../src/components/layer-stack/popovers/download-popover.tsx', import.meta.url),
      'utf8',
    );

    expect(source).not.toMatch(/from ['"]@lpc-toolkit\/core['"]/);
    expect(source).not.toMatch(/from ['"].*\/(?:adapter|lib\/(?:character-export|spritesheet-export|zip-export|download))['"]/);
    expect(source.match(/onClick=/g)).toHaveLength(8);
  });
});
