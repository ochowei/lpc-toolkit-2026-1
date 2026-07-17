import { readFileSync } from 'node:fs';
import {
  createCatalog,
  type PaletteMetadata,
  type SelectionDocumentImportContext,
  type Selections,
} from '@lpc-toolkit/core';
import { describe, expect, it, vi } from 'vitest';
import {
  createLatestCharacterDocumentImporter,
  type ReadCharacterDocumentSelections,
} from '../src/lib/character-document-import';
import {
  copySelectionLink,
  copySelectionToken,
} from '../src/lib/selection-sharing';

const context: SelectionDocumentImportContext = {
  catalog: createCatalog({}).catalog,
  palettes: { materials: {}, versions: {} } satisfies PaletteMetadata,
};

const firstSelections: Selections = { bodyType: 'male', items: {} };
const latestSelections: Selections = { bodyType: 'female', items: {} };

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

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
    expect(source).not.toMatch(/JSON\.parse|new Blob|navigator\.clipboard|window\.location/);
    expect(source).toContain('saveCharacterDocument');
    expect(source).toContain('useLatestCharacterDocumentImporter');
    expect(source).toContain('copySelectionToken');
    expect(source).toContain('copySelectionLink');
    expect(source).toContain('dispatchRef.current');
    expect(source).toMatch(
      /decodeSelectionToken\(\s*paste\.trim\(\),\s*catalog,\s*palettes,\s*\)/,
    );
    expect(source.match(/onClick=/g)).toHaveLength(5);
  });
});

describe('selection sharing browser boundary', () => {
  it('copies tokens and canonical share links through an injected clipboard', async () => {
    const writeText = vi.fn<(text: string) => Promise<void>>(async () => undefined);
    const clipboard = { writeText };

    await copySelectionToken('token-value', clipboard);
    await copySelectionLink(
      latestSelections,
      clipboard,
      { origin: 'https://example.test', pathname: '/compose' },
    );

    expect(writeText).toHaveBeenNthCalledWith(1, 'token-value');
    expect(writeText).toHaveBeenNthCalledWith(
      2,
      'https://example.test/compose#sex=female',
    );
  });
});

describe('latest character-document import', () => {
  it('does not report success or close when applying the candidate is rejected', async () => {
    const read = vi.fn<ReadCharacterDocumentSelections>(async () => firstSelections);
    const importLatest = createLatestCharacterDocumentImporter(read);
    const onApplied = vi.fn();
    const onRejected = vi.fn();

    const result = await importLatest({
      file: { text: async () => '{}' },
      context,
      apply: () => false,
      onApplied,
      onRejected,
      onFailed: vi.fn(),
    });

    expect(result).toBe('rejected');
    expect(onApplied).not.toHaveBeenCalled();
    expect(onRejected).toHaveBeenCalledOnce();
  });

  it('lets only the newest in-flight import dispatch or update status', async () => {
    const firstRead = deferred<Selections>();
    const latestRead = deferred<Selections>();
    const read = vi.fn<ReadCharacterDocumentSelections>()
      .mockReturnValueOnce(firstRead.promise)
      .mockReturnValueOnce(latestRead.promise);
    const importLatest = createLatestCharacterDocumentImporter(read);
    const apply = vi.fn<(selections: Selections) => boolean>(() => true);
    const firstApplied = vi.fn();
    const firstRejected = vi.fn();
    const firstFailed = vi.fn();
    const latestApplied = vi.fn();

    const first = importLatest({
      file: { text: async () => 'first' },
      context,
      apply,
      onApplied: firstApplied,
      onRejected: firstRejected,
      onFailed: firstFailed,
    });
    const latest = importLatest({
      file: { text: async () => 'latest' },
      context,
      apply,
      onApplied: latestApplied,
      onRejected: vi.fn(),
      onFailed: vi.fn(),
    });

    latestRead.resolve(latestSelections);
    await expect(latest).resolves.toBe('applied');
    firstRead.resolve(firstSelections);
    await expect(first).resolves.toBe('stale');

    expect(apply).toHaveBeenCalledOnce();
    expect(apply).toHaveBeenCalledWith(latestSelections);
    expect(latestApplied).toHaveBeenCalledOnce();
    expect(firstApplied).not.toHaveBeenCalled();
    expect(firstRejected).not.toHaveBeenCalled();
    expect(firstFailed).not.toHaveBeenCalled();
  });
});
