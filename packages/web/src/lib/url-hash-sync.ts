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

/** History operation selected after comparing the current and next URL hash. */
export type HashWriteAction = 'replace' | 'push' | null;

/** Initial reducer state plus warnings decoded from the current URL hash. */
export interface BootstrapResult {
  readonly state: SliceState;
  readonly warnings: readonly HashWarning[];
}

/** Parsed browser hashchange result for the reducer and warning UI. */
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
 * Serialize `state` to its hash form, but collapse to `''` whenever the
 * result equals `defaultsHash`. The bootstrap reads empty hash as
 * "use defaults", so symmetrising the write side keeps the URL clean
 * when the user is at the default outfit (e.g. after Reset).
 */
export function effectiveHash(
  state: SliceState,
  defaultsHash: string,
): string {
  const s = serializeHash(toSelections(state));
  return s === defaultsHash ? '' : s;
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
  defaults: SliceState;
  dispatch: (a: SliceAction) => void;
  catalog: Catalog;
  palettes: PaletteMetadata;
  t: Translator;
  onStatus: (text: string) => void;
}): void {
  const isFirstWriteRef = useRef(true);
  const stateRef = useRef(args.state);
  const onStatusRef = useRef(args.onStatus);
  const tRef = useRef(args.t);
  const defaultsHash = serializeHash(toSelections(args.defaults));
  const defaultsHashRef = useRef(defaultsHash);
  useEffect(() => {
    stateRef.current = args.state;
  }, [args.state]);
  useEffect(() => {
    onStatusRef.current = args.onStatus;
  }, [args.onStatus]);
  useEffect(() => {
    tRef.current = args.t;
  }, [args.t]);
  useEffect(() => {
    defaultsHashRef.current = defaultsHash;
  }, [defaultsHash]);

  // Write effect: state → hash.
  useEffect(() => {
    const nextHash = effectiveHash(args.state, defaultsHash);
    const action = computeHashWrite({
      currentHash: readWindowHash(),
      nextHash,
      isFirstWrite: isFirstWriteRef.current,
    });
    isFirstWriteRef.current = false;
    if (action === null) return;
    const target =
      nextHash === ''
        ? window.location.pathname + window.location.search
        : '#' + nextHash;
    if (action === 'replace') {
      window.history.replaceState(null, '', target);
    } else {
      window.history.pushState(null, '', target);
    }
  }, [args.state.bodyType, args.state.selections, defaultsHash]);

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

      // If nothing resolved, don't wipe the current outfit; just normalize
      // the URL back to the current canonical form so junk doesn't linger.
      if (Object.keys(action.selections.items).length === 0) {
        const canonical = effectiveHash(stateRef.current, defaultsHashRef.current);
        if (canonical !== readWindowHash()) {
          const target =
            canonical === ''
              ? window.location.pathname + window.location.search
              : '#' + canonical;
          window.history.replaceState(null, '', target);
        }
        if (action.warnings.length > 0) {
          onStatusRef.current(
            tRef.current('hashSync.skipped').replace(
              '{n}',
              String(action.warnings.length),
            ),
          );
        }
        return;
      }

      // Normalize the URL to canonical form before dispatching, so the
      // subsequent write effect is a no-op (no extra pushState entry for
      // non-canonical incoming URLs).
      const canonical = serializeHash(action.selections);
      if (canonical !== readWindowHash()) {
        window.history.replaceState(null, '', '#' + canonical);
      }
      args.dispatch({ type: 'apply_selections', selections: action.selections });
      if (action.warnings.length > 0) {
        onStatusRef.current(
          tRef.current('hashSync.skipped').replace(
            '{n}',
            String(action.warnings.length),
          ),
        );
      }
    };
    window.addEventListener('hashchange', handler);
    return () => window.removeEventListener('hashchange', handler);
  }, [args.catalog, args.palettes, args.dispatch]);
}
