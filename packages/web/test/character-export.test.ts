import type {
  CanvasAdapter,
  Catalog,
  CanvasLike,
  ComposedSheet,
  CreditsManifest,
  ItemDefinition,
  Selections,
} from '@lpc-toolkit/core';
import { describe, expect, it, vi } from 'vitest';
import type { CustomOverlay } from '../src/lib/custom-overlay';
import {
  exportCharacterArtifact,
  freezeCharacterExportInput,
  type CharacterExportInput,
  type CharacterExportOptions,
} from '../src/lib/character-export';
import type { ExportContext, ZipExportKind } from '../src/lib/zip-export';

const credits: CreditsManifest = {
  entries: [{
    file: 'body/bodies/male',
    notes: '',
    authors: ['Test Artist'],
    licenses: ['GPL 3.0'],
    urls: [],
  }],
  resolvedPaths: ['body/bodies/male/walk.png'],
  licenses: ['GPL 3.0'],
};

function makeSheet(): ComposedSheet {
  return {
    canvas: {} as CanvasLike,
    width: 832,
    height: 3456,
    selections: { bodyType: 'male', items: {} },
    credits,
    layers: [],
    animations: ['walk'],
  };
}

function makeInput(overrides: Partial<CharacterExportInput> = {}): CharacterExportInput {
  return {
    sheet: makeSheet(),
    selections: {
      bodyType: 'male',
      items: { body: { typeName: 'body', name: 'male', variant: 'light' } },
    },
    catalog: { byItemId: new Map() } as unknown as Catalog,
    anim: 'walk',
    composeSingleItem: async () => makeSheet(),
    composeSingleItemLayer: async () => makeSheet(),
    customOverlay: null,
    itemLabel: (item: ItemDefinition) => item.name,
    ...overrides,
  };
}

function makeOptions() {
  const download = vi.fn<(blob: Blob, filename: string) => void>();
  const zipBlob = new Blob(['zip']);
  const calls: Record<ZipExportKind, ReturnType<typeof vi.fn<(ctx: ExportContext) => Promise<Blob>>>> = {
    byAnimation: vi.fn(async () => zipBlob),
    byItem: vi.fn(async () => zipBlob),
    byAnimItem: vi.fn(async () => zipBlob),
    byFrame: vi.fn(async () => zipBlob),
  };
  const options: CharacterExportOptions = {
    createAdapter: () => ({}) as CanvasAdapter,
    download,
    timestamp: () => '2026-07-11T00-00-00',
    zipExporters: calls,
    onProgress: vi.fn(),
  };
  return { options, download, calls, zipBlob };
}

describe('freezeCharacterExportInput', () => {
  it('clones selections and overlay metadata while retaining immutable references', () => {
    const image = {} as CustomOverlay['image'];
    const overlay: CustomOverlay = {
      fileName: 'cape.png', objectUrl: 'blob:cape', image,
      width: 832, height: 3456, zPos: 70,
    };
    const input = makeInput({ customOverlay: overlay });

    const frozen = freezeCharacterExportInput(input);

    expect(frozen).not.toBe(input);
    expect(frozen.selections).not.toBe(input.selections);
    expect(frozen.selections.items).not.toBe(input.selections.items);
    expect(frozen.selections.items.body).not.toBe(input.selections.items.body);
    expect(frozen.customOverlay).not.toBe(overlay);
    expect(frozen.customOverlay?.image).toBe(image);
    expect(frozen.sheet).toBe(input.sheet);
    expect(frozen.catalog).toBe(input.catalog);
    expect(frozen.composeSingleItem).toBe(input.composeSingleItem);
    expect(frozen.itemLabel).toBe(input.itemLabel);
  });
});

describe('exportCharacterArtifact', () => {
  it.each([
    ['creditsTxt', 'credits.txt', 'text/plain'],
    ['creditsCsv', 'credits.csv', 'text/csv'],
  ] as const)('downloads %s with its exact filename and type', async (kind, filename, type) => {
    const { options, download } = makeOptions();

    await exportCharacterArtifact(kind, makeInput(), options);

    expect(download).toHaveBeenCalledOnce();
    expect(download).toHaveBeenCalledWith(expect.any(Blob), filename);
    expect(download.mock.calls[0]![0].type).toBe(type);
  });

  it('downloads the spritesheet bundle with its exact filename', async () => {
    const { options, download } = makeOptions();
    const sheet: ComposedSheet = {
      ...makeSheet(),
      canvas: {
        toBlob: (callback: BlobCallback) => callback(new Blob(['png'])),
      } as unknown as CanvasLike,
    };

    await exportCharacterArtifact('bundle', makeInput({ sheet }), options);

    expect(download).toHaveBeenCalledWith(
      expect.any(Blob),
      'character-spritesheet-with-credits.zip',
    );
  });

  it.each([
    ['byAnimation', 'animations'],
    ['byItem', 'item_spritesheets'],
    ['byAnimItem', 'item_animations'],
    ['byFrame', 'individual_frames'],
  ] as const)('routes %s to its exporter and exact frozen filename', async (kind, segment) => {
    const { options, download, calls, zipBlob } = makeOptions();
    const input = makeInput();

    await exportCharacterArtifact(kind, input, options);

    expect(calls[kind]).toHaveBeenCalledWith(expect.objectContaining({
      sheet: input.sheet,
      catalog: input.catalog,
      anim: input.anim,
      composeSingleItem: input.composeSingleItem,
      composeSingleItemLayer: input.composeSingleItemLayer,
      customOverlay: input.customOverlay,
      itemLabel: input.itemLabel,
    }));
    const context = calls[kind].mock.calls[0]![0];
    expect(context.selections).not.toBe(input.selections);
    expect(context.selections).toEqual(input.selections);
    expect(download).toHaveBeenCalledWith(
      zipBlob,
      `lpc_male_${segment}_2026-07-11T00-00-00.zip`,
    );
  });

  it('keeps an in-flight export on its invocation snapshot', async () => {
    let resolveExport!: (blob: Blob) => void;
    const pending = new Promise<Blob>((resolve) => { resolveExport = resolve; });
    const { options, calls, download, zipBlob } = makeOptions();
    calls.byFrame.mockImplementation(async () => pending);
    const mutableSelection = {
      typeName: 'body', name: 'male', variant: 'light',
    };
    const mutableSelections = {
      bodyType: 'male', items: { body: mutableSelection },
    };
    const selections: Selections = mutableSelections;
    const first = exportCharacterArtifact('byFrame', makeInput({ selections }), options);

    mutableSelections.bodyType = 'female';
    mutableSelection.variant = 'dark';
    makeInput({ selections: { bodyType: 'teen', items: {} } });
    resolveExport(zipBlob);
    await first;

    expect(calls.byFrame.mock.calls[0]![0].selections).toEqual({
      bodyType: 'male',
      items: {
        body: { typeName: 'body', name: 'male', variant: 'light' },
      },
    });
    expect(download).toHaveBeenCalledWith(
      zipBlob,
      'lpc_male_individual_frames_2026-07-11T00-00-00.zip',
    );
  });

  it('propagates bundle encoder errors without a partial download', async () => {
    const { options, download } = makeOptions();
    const sheet: ComposedSheet = {
      ...makeSheet(),
      canvas: {
        toBlob: (callback: BlobCallback) => callback(null),
      } as unknown as CanvasLike,
    };

    await expect(exportCharacterArtifact('bundle', makeInput({ sheet }), options))
      .rejects.toThrow('toBlob returned null');
    expect(download).not.toHaveBeenCalled();
  });

  it('propagates ZIP exporter errors without a partial download', async () => {
    const { options, calls, download } = makeOptions();
    calls.byItem.mockRejectedValue(new Error('ZIP failed'));

    await expect(exportCharacterArtifact('byItem', makeInput(), options))
      .rejects.toThrow('ZIP failed');
    expect(download).not.toHaveBeenCalled();
  });
});
