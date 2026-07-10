import type { ComposedSheet } from '@lpc-toolkit/core';
import { describe, expect, it } from 'vitest';
import type { ComposedResult } from '../src/hooks/use-composed-character';
import { readyDownloadSheet } from '../src/components/layer-stack/popovers/download-popover';

describe('readyDownloadSheet', () => {
  it('does not expose a retained sheet while replacement composition is loading', () => {
    const priorSheet = {} as ComposedSheet;
    const result: ComposedResult = {
      status: 'loading',
      progress: 0.5,
      sheet: priorSheet,
      animation: null,
      error: null,
    };

    expect(readyDownloadSheet(result)).toBeNull();
  });
});
