import { useEffect, useRef } from 'react';
import {
  parseHash,
  serializeHash,
  type Catalog,
  type HashWarning,
  type PaletteMetadata,
  type Selections,
} from '@lpc-toolkit/core';
import { toSelections, type SliceState } from '../slice/selection';
import type { SliceAction } from '../slice/selection';
import type { Translator } from '../i18n';

export type HashWriteAction = 'replace' | 'push' | null;

export interface BootstrapResult {
  readonly state: SliceState;
  readonly warnings: readonly HashWarning[];
}

export interface HashChangeAction {
  readonly shouldApply: boolean;
  readonly selections: Selections | null;
  readonly warnings: readonly HashWarning[];
}

/** Read `window.location.hash`, stripping the leading `#`. */
export function readWindowHash(): string {
  const h = window.location.hash;
  return h.startsWith('#') ? h.slice(1) : h;
}

/**
 * Compute the initial SliceState given the URL hash and the defaults the
 * app would otherwise use. Pure; caller is responsible for reading
 * `window.location.hash`.
 *
 * - empty hash → defaults, no warnings
 * - hash with at least one resolvable item → defaults with `bodyType` and
 *   `selections` replaced by the parsed values (preserves `anim`, `dir`,
 *   `zoom`, `playing`)
 * - hash where every key is unknown → defaults, warnings non-empty so
 *   the caller can surface a status message
 */
export function bootstrapStateFromHash(args: {
  rawHash: string;
  catalog: Catalog;
  palettes: PaletteMetadata;
  defaults: SliceState;
}): BootstrapResult {
  if (args.rawHash === '') {
    return { state: args.defaults, warnings: [] };
  }
  const parsed = parseHash(args.rawHash, args.catalog, args.palettes);
  if (Object.keys(parsed.selections.items).length === 0) {
    return { state: args.defaults, warnings: parsed.warnings };
  }
  return {
    state: {
      ...args.defaults,
      bodyType: parsed.selections.bodyType,
      selections: parsed.selections.items,
    },
    warnings: parsed.warnings,
  };
}

/**
 * Decide what to do when state has changed and we want to write the new
 * hash. Returns `null` when the hashes already match (no-op), `'replace'`
 * for the bootstrap-time URL normalization (no history entry), and
 * `'push'` for user-driven state changes (back-able).
 */
export function computeHashWrite(args: {
  currentHash: string;
  nextHash: string;
  isFirstWrite: boolean;
}): HashWriteAction {
  if (args.currentHash === args.nextHash) return null;
  return args.isFirstWrite ? 'replace' : 'push';
}

/**
 * Decide whether a `hashchange` event needs to update state, and what
 * to apply. Returns `shouldApply: false` when the incoming hash equals
 * what the current state would serialize to (i.e. the event was the
 * echo of our own previous write — the invariant says we never reach
 * here in practice with pushState, but the guard is cheap and makes the
 * hook robust to future history-API changes).
 */
export function computeHashChangeAction(args: {
  rawHash: string;
  currentState: SliceState;
  catalog: Catalog;
  palettes: PaletteMetadata;
}): HashChangeAction {
  const expected = serializeHash(toSelections(args.currentState));
  if (args.rawHash === expected) {
    return { shouldApply: false, selections: null, warnings: [] };
  }
  const parsed = parseHash(args.rawHash, args.catalog, args.palettes);
  return {
    shouldApply: true,
    selections: parsed.selections,
    warnings: parsed.warnings,
  };
}

/**
 * Two-way sync between SliceState and `window.location.hash`. Mount once
 * inside the harness; it:
 *
 * 1. On every state change, writes the serialized hash with `replaceState`
 *    on the first write (URL normalization, no history entry) and
 *    `pushState` thereafter (back-able).
 * 2. Listens for `hashchange` (browser back/forward, manual URL edit) and
 *    dispatches `apply_selections` to mirror the new hash into state.
 *
 * The "we just wrote this, ignore it" guard works because `pushState`
 * does not fire `hashchange` (HTML spec). The guard in
 * `computeHashChangeAction` is belt-and-braces.
 */
export function useUrlHashSync(args: {
  state: SliceState;
  dispatch: (a: SliceAction) => void;
  catalog: Catalog;
  palettes: PaletteMetadata;
  t: Translator;
  onStatus: (text: string) => void;
}): void {
  const isFirstWriteRef = useRef(true);
  const stateRef = useRef(args.state);
  useEffect(() => {
    stateRef.current = args.state;
  }, [args.state]);

  // Write effect: state → hash.
  useEffect(() => {
    const nextHash = serializeHash(toSelections(args.state));
    const action = computeHashWrite({
      currentHash: readWindowHash(),
      nextHash,
      isFirstWrite: isFirstWriteRef.current,
    });
    if (action === null) return;
    const target = '#' + nextHash;
    if (action === 'replace') {
      window.history.replaceState(null, '', target);
    } else {
      window.history.pushState(null, '', target);
    }
    isFirstWriteRef.current = false;
  }, [args.state.bodyType, args.state.selections]);

  // Listen for external hash changes (back/forward, manual edit).
  useEffect(() => {
    const handler = () => {
      const action = computeHashChangeAction({
        rawHash: readWindowHash(),
        currentState: stateRef.current,
        catalog: args.catalog,
        palettes: args.palettes,
      });
      if (!action.shouldApply || action.selections === null) return;
      args.dispatch({ type: 'apply_selections', selections: action.selections });
      if (action.warnings.length > 0) {
        args.onStatus(
          args.t('hashSync.skipped').replace('{n}', String(action.warnings.length)),
        );
      }
    };
    window.addEventListener('hashchange', handler);
    return () => window.removeEventListener('hashchange', handler);
  }, [args.catalog, args.palettes, args.dispatch, args.t, args.onStatus]);
}
