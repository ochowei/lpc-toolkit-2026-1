import {
  parseHash,
  serializeHash,
  type Catalog,
  type HashWarning,
  type PaletteMetadata,
  type Selections,
} from '@lpc-toolkit/core';
import { toSelections, type SliceState } from '../slice/selection';

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
