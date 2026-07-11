import type { ComposedSheet } from '@lpc-toolkit/core';
import { describe, expect, it } from 'vitest';
import type { ComposedResult } from '../src/hooks/use-composed-character';
import {
  ExportExecutionGate,
  readyExportSheet,
  runGuardedExport,
} from '../src/hooks/use-character-export';

describe('readyExportSheet', () => {
  it('does not expose a retained sheet while replacement composition is loading', () => {
    const priorSheet = {} as ComposedSheet;
    const result: ComposedResult = {
      status: 'loading',
      progress: 0.5,
      sheet: priorSheet,
      animation: null,
      error: null,
    };

    expect(readyExportSheet(result)).toBeNull();
  });
});

describe('ExportExecutionGate', () => {
  it('rejects a second synchronous start until the first run finishes', () => {
    const gate = new ExportExecutionGate();

    expect(gate.tryStart()).toBe(true);
    expect(gate.tryStart()).toBe(false);
    gate.finish();
    expect(gate.tryStart()).toBe(true);
  });
});

describe('runGuardedExport', () => {
  it('releases the gate after failure so a later export can retry', async () => {
    const gate = new ExportExecutionGate();

    await expect(
      runGuardedExport(gate, async () => {
        throw new Error('export failed');
      }),
    ).rejects.toThrow('export failed');
    expect(gate.running).toBe(false);

    await expect(runGuardedExport(gate, async () => 'done')).resolves.toBe('done');
  });
});
