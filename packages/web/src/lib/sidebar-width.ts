export const DEFAULT_SIDEBAR_WIDTH = 400;
export const MIN_SIDEBAR_WIDTH = 320;
export const MAX_SIDEBAR_WIDTH = 640;
export const MIN_PREVIEW_WIDTH = 320;
export const SIDEBAR_SPLITTER_WIDTH = 6;
export const SIDEBAR_KEYBOARD_STEP = 16;
export const SIDEBAR_STORAGE_KEY = 'lpc.sidebar-width.v1';

export interface ReadableStorage {
  getItem(key: string): string | null;
}

export interface WritableStorage {
  setItem(key: string, value: string): void;
}

export function clampSidebarWidth(
  width: number,
  activeMax: number = MAX_SIDEBAR_WIDTH,
): number {
  const finiteMax = Number.isFinite(activeMax) ? activeMax : MAX_SIDEBAR_WIDTH;
  const renderedMax = Math.max(
    MIN_SIDEBAR_WIDTH,
    Math.min(finiteMax, MAX_SIDEBAR_WIDTH),
  );
  const finiteWidth = Number.isFinite(width) ? width : DEFAULT_SIDEBAR_WIDTH;

  return Math.min(Math.max(finiteWidth, MIN_SIDEBAR_WIDTH), renderedMax);
}

export function getRenderedSidebarMax(viewportWidth: number): number {
  return clampSidebarWidth(
    viewportWidth - MIN_PREVIEW_WIDTH - SIDEBAR_SPLITTER_WIDTH,
  );
}

export function computeSidebarWidthFromPointer(
  pointerX: number,
  containerLeft: number,
  activeMax: number,
): number {
  return clampSidebarWidth(pointerX - containerLeft, activeMax);
}

export function loadSidebarWidth(
  storage: ReadableStorage | undefined,
): number {
  if (!storage) return DEFAULT_SIDEBAR_WIDTH;

  try {
    const storedWidth = storage.getItem(SIDEBAR_STORAGE_KEY);
    if (storedWidth === null || storedWidth.trim() === '') {
      return DEFAULT_SIDEBAR_WIDTH;
    }

    const width = Number(storedWidth);
    if (
      !Number.isFinite(width) ||
      width < MIN_SIDEBAR_WIDTH ||
      width > MAX_SIDEBAR_WIDTH
    ) {
      return DEFAULT_SIDEBAR_WIDTH;
    }

    return width;
  } catch {
    return DEFAULT_SIDEBAR_WIDTH;
  }
}

export function saveSidebarWidth(
  storage: WritableStorage | undefined,
  width: number,
): void {
  if (!storage) return;

  try {
    storage.setItem(
      SIDEBAR_STORAGE_KEY,
      String(Math.round(clampSidebarWidth(width))),
    );
  } catch {
    // Persistence is best-effort.
  }
}
