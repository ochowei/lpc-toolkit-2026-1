import { useCallback, useRef, useState } from 'react';
import type { Catalog, ComposedSheet, Selections } from '@lpc-toolkit/core';
import type { LabelTranslator, Translator } from '../i18n';
import type { CustomOverlay } from '../lib/custom-overlay';
import {
  exportCharacterArtifact,
  freezeCharacterExportInput,
  type CharacterExportInput,
  type CharacterExportKind,
} from '../lib/character-export';
import { isMissingCreditsError } from '../lib/spritesheet-export';
import type { ZipExportKind } from '../lib/zip-export';
import type { ComposedResult } from './use-composed-character';

export type { ZipExportKind } from '../lib/zip-export';

export interface ExportRunningState {
  readonly kind: CharacterExportKind;
  readonly progress: number;
}

export interface UseCharacterExportResult {
  readonly disabled: boolean;
  readonly disabledReasonKey: 'download.loading' | 'download.failed';
  readonly running: ExportRunningState | null;
  readonly downloadBundle: () => Promise<void>;
  readonly downloadCreditsTxt: () => Promise<void>;
  readonly downloadCreditsCsv: () => Promise<void>;
  readonly downloadZip: (kind: ZipExportKind) => Promise<void>;
}

interface UseCharacterExportArgs {
  readonly result: ComposedResult;
  readonly anim: string;
  readonly selections: Selections;
  readonly catalog: Catalog;
  readonly composeSingleItem: CharacterExportInput['composeSingleItem'];
  readonly composeSingleItemLayer: CharacterExportInput['composeSingleItemLayer'];
  readonly customOverlay: CustomOverlay | null;
  readonly tl: LabelTranslator;
  readonly t: Translator;
  readonly setOpen: (open: boolean) => void;
  readonly onStatus: (status: { kind: 'info' | 'error'; text: string }) => void;
}

/** Expose exports only after composition has settled for the current inputs. */
export function readyExportSheet(result: ComposedResult): ComposedSheet | null {
  return result.status === 'ready' ? result.sheet : null;
}

/** Synchronous exclusion gate for export callbacks invoked in one render turn. */
export class ExportExecutionGate {
  running = false;

  tryStart(): boolean {
    if (this.running) return false;
    this.running = true;
    return true;
  }

  finish(): void {
    this.running = false;
  }
}

/** Run one task at a time and always release the gate for a later retry. */
export async function runGuardedExport<T>(
  gate: ExportExecutionGate,
  task: () => Promise<T>,
): Promise<T | undefined> {
  if (!gate.tryStart()) return undefined;
  try {
    return await task();
  } finally {
    gate.finish();
  }
}

/** Map export failures to user-facing copy without exposing implementation errors. */
export function downloadErrorTranslationKey(
  error: unknown,
): 'download.noCredits' | 'download.failed' {
  return isMissingCreditsError(error)
    ? 'download.noCredits'
    : 'download.failed';
}

/** Own browser character-export state and async lifecycle. */
export function useCharacterExport({
  result,
  anim,
  selections,
  catalog,
  composeSingleItem,
  composeSingleItemLayer,
  customOverlay,
  tl,
  t,
  setOpen,
  onStatus,
}: UseCharacterExportArgs): UseCharacterExportResult {
  const gateRef = useRef<ExportExecutionGate>();
  if (!gateRef.current) gateRef.current = new ExportExecutionGate();
  const [running, setRunning] = useState<ExportRunningState | null>(null);
  const sheet = readyExportSheet(result);

  const run = useCallback(async (kind: CharacterExportKind): Promise<void> => {
    await runGuardedExport(gateRef.current!, async () => {
      const readySheet = readyExportSheet(result);
      if (!readySheet) return;

      const frozenInput = freezeCharacterExportInput({
        sheet: readySheet,
        selections,
        catalog,
        anim,
        composeSingleItem,
        composeSingleItemLayer,
        customOverlay,
        itemLabel: (item) => tl.catalogItemName(item),
      });
      let active = true;
      setRunning({ kind, progress: 0 });
      try {
        await exportCharacterArtifact(kind, frozenInput, {
          onProgress: (progress) => {
            if (active) setRunning({ kind, progress });
          },
        });
        onStatus({ kind: 'info', text: t('download.done') });
        setOpen(false);
      } catch (error) {
        console.error('Character export failed:', error);
        onStatus({ kind: 'error', text: t(downloadErrorTranslationKey(error)) });
      } finally {
        active = false;
        setRunning(null);
      }
    });
  }, [anim, catalog, composeSingleItem, composeSingleItemLayer, customOverlay,
    onStatus, result, selections, setOpen, t, tl]);

  return {
    disabled: sheet === null,
    disabledReasonKey: result.status === 'error' ? 'download.failed' : 'download.loading',
    running,
    downloadBundle: () => run('bundle'),
    downloadCreditsTxt: () => run('creditsTxt'),
    downloadCreditsCsv: () => run('creditsCsv'),
    downloadZip: (kind) => run(kind),
  };
}
