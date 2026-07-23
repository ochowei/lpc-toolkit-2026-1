import { useEffect } from 'react';

export const UNSAVED_WORK_CONFIRM_MESSAGE = 'Leave the asset pack workbench and discard unsaved work?';

export type NavigationBlocker = () => boolean;

export interface UnsavedWorkGuardEvent {
  readonly preventDefault: () => void;
  returnValue: string | undefined;
}

export interface UnsavedWorkGuardOptions {
  readonly currentRevision: number;
  readonly latestDownloadedRevision?: number;
  readonly confirmNavigation?: (message: string) => boolean;
  readonly registerBlocker?: (blocker: NavigationBlocker) => () => void;
}

export interface UnsavedWorkGuardController {
  readonly isUnsaved: boolean;
  readonly confirmNavigation: NavigationBlocker;
  readonly beforeUnload: (event: UnsavedWorkGuardEvent) => void;
}

export function createUnsavedWorkGuard(options: Omit<UnsavedWorkGuardOptions, 'registerBlocker'>): UnsavedWorkGuardController {
  const isUnsaved = options.currentRevision > (options.latestDownloadedRevision ?? 0);
  const confirmNavigation: NavigationBlocker = () => {
    if (!isUnsaved) return true;
    return options.confirmNavigation?.(UNSAVED_WORK_CONFIRM_MESSAGE)
      ?? (typeof window !== 'undefined' ? window.confirm(UNSAVED_WORK_CONFIRM_MESSAGE) : true);
  };
  const beforeUnload = (event: UnsavedWorkGuardEvent): void => {
    if (!isUnsaved) return;
    event.preventDefault();
    event.returnValue = '';
  };
  return { isUnsaved, confirmNavigation, beforeUnload };
}

export function useUnsavedWorkGuard(options: UnsavedWorkGuardOptions): void {
  const { currentRevision, latestDownloadedRevision, confirmNavigation, registerBlocker } = options;
  useEffect(() => {
    const guard = createUnsavedWorkGuard({
      currentRevision,
      ...(latestDownloadedRevision !== undefined ? { latestDownloadedRevision } : {}),
      ...(confirmNavigation ? { confirmNavigation } : {}),
    });
    const unregister = guard.isUnsaved ? registerBlocker?.(guard.confirmNavigation) : undefined;
    if (guard.isUnsaved && typeof window !== 'undefined') {
      const handleBeforeUnload = (event: BeforeUnloadEvent) => guard.beforeUnload(event);
      window.addEventListener('beforeunload', handleBeforeUnload);
      return () => {
        window.removeEventListener('beforeunload', handleBeforeUnload);
        unregister?.();
      };
    }
    return () => unregister?.();
  }, [confirmNavigation, currentRevision, latestDownloadedRevision, registerBlocker]);
}
