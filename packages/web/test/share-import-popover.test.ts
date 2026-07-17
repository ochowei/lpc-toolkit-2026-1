import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('ShareImportPopover boundaries', () => {
  it('keeps ShareImportPopover presentation-only and exposes five actions', () => {
    const source = readFileSync(
      new URL(
        '../src/components/layer-stack/popovers/share-import-popover.tsx',
        import.meta.url,
      ),
      'utf8',
    );

    expect(source).not.toMatch(/from ['"].*adapter/);
    expect(source).not.toMatch(/JSON\.parse|new Blob/);
    expect(source).toContain('saveCharacterDocument');
    expect(source).toContain('importCharacterDocument');
    expect(source.match(/onClick=/g)).toHaveLength(5);
  });
});
