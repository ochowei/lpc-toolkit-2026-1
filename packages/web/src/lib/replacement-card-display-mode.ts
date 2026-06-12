export const REPLACEMENT_CARD_DISPLAY_MODES = [
  'stacked',
  'overlay',
  'hidden',
] as const;

export type ReplacementCardDisplayMode =
  (typeof REPLACEMENT_CARD_DISPLAY_MODES)[number];

export const DEFAULT_REPLACEMENT_CARD_DISPLAY_MODE:
  ReplacementCardDisplayMode = 'overlay';

export const REPLACEMENT_CARD_DISPLAY_MODE_STORAGE_KEY =
  'lpc.replacement-card-display-mode.v1';

export interface ReadableReplacementCardModeStorage {
  getItem(key: string): string | null;
}

export interface WritableReplacementCardModeStorage {
  setItem(key: string, value: string): void;
}

export function parseReplacementCardDisplayMode(
  value: unknown,
): ReplacementCardDisplayMode {
  return typeof value === 'string' &&
    REPLACEMENT_CARD_DISPLAY_MODES.includes(
      value as ReplacementCardDisplayMode,
    )
    ? (value as ReplacementCardDisplayMode)
    : DEFAULT_REPLACEMENT_CARD_DISPLAY_MODE;
}

export function loadReplacementCardDisplayMode(
  storage: ReadableReplacementCardModeStorage | undefined,
): ReplacementCardDisplayMode {
  if (!storage) return DEFAULT_REPLACEMENT_CARD_DISPLAY_MODE;
  try {
    return parseReplacementCardDisplayMode(
      storage.getItem(REPLACEMENT_CARD_DISPLAY_MODE_STORAGE_KEY),
    );
  } catch {
    return DEFAULT_REPLACEMENT_CARD_DISPLAY_MODE;
  }
}

export function saveReplacementCardDisplayMode(
  storage: WritableReplacementCardModeStorage | undefined,
  mode: ReplacementCardDisplayMode,
): void {
  if (!storage) return;
  try {
    storage.setItem(REPLACEMENT_CARD_DISPLAY_MODE_STORAGE_KEY, mode);
  } catch {
    // Persistence is best-effort.
  }
}
