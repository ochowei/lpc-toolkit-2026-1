import { describe, expect, it, vi } from 'vitest';
import { createUnsavedWorkGuard, UNSAVED_WORK_CONFIRM_MESSAGE } from '../src/hooks/use-unsaved-work-guard';

function unloadEvent() {
  return { preventDefault: vi.fn(), returnValue: undefined as string | undefined };
}

describe('useUnsavedWorkGuard', () => {
  it('does not prompt immediately after upload, prompts after edits, and clears after an exact download', () => {
    const confirm = vi.fn(() => false);
    const guard = createUnsavedWorkGuard({ currentRevision: 0, confirmNavigation: confirm });
    expect(guard.isUnsaved).toBe(false);
    expect(guard.confirmNavigation()).toBe(true);
    expect(confirm).not.toHaveBeenCalled();

    const edited = createUnsavedWorkGuard({ currentRevision: 1, confirmNavigation: confirm });
    expect(edited.isUnsaved).toBe(true);
    expect(edited.confirmNavigation()).toBe(false);
    expect(confirm).toHaveBeenCalledWith(UNSAVED_WORK_CONFIRM_MESSAGE);

    const saved = createUnsavedWorkGuard({ currentRevision: 1, latestDownloadedRevision: 1, confirmNavigation: confirm });
    expect(saved.isUnsaved).toBe(false);
    expect(saved.confirmNavigation()).toBe(true);

    const editedAgain = createUnsavedWorkGuard({ currentRevision: 2, latestDownloadedRevision: 1, confirmNavigation: confirm });
    expect(editedAgain.isUnsaved).toBe(true);
  });

  it('only prevents browser unload while the current revision is newer than the saved revision', () => {
    const cleanEvent = unloadEvent();
    createUnsavedWorkGuard({ currentRevision: 1, latestDownloadedRevision: 1 }).beforeUnload(cleanEvent);
    expect(cleanEvent.preventDefault).not.toHaveBeenCalled();
    expect(cleanEvent.returnValue).toBeUndefined();

    const dirtyEvent = unloadEvent();
    createUnsavedWorkGuard({ currentRevision: 2, latestDownloadedRevision: 1 }).beforeUnload(dirtyEvent);
    expect(dirtyEvent.preventDefault).toHaveBeenCalledOnce();
    expect(dirtyEvent.returnValue).toBe('');
  });
});
