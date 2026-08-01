import type { SliceAction } from '../slice/selection';

type CompositionStatus = 'idle' | 'loading' | 'ready' | 'error';

export function isCompositionChangingAction(action: SliceAction): boolean {
  switch (action.type) {
    case 'set_body_type':
    case 'pick':
    case 'clear':
    case 'set_channel_recolor':
    case 'clear_channel_recolor':
    case 'apply_selections':
      return true;
    case 'reset':
      return action.scopes.outfit;
    case 'set_anim':
    case 'set_dir':
    case 'toggle_play':
    case 'set_zoom':
    case 'set_layout':
      return false;
    default: {
      const exhaustiveAction: never = action;
      return exhaustiveAction;
    }
  }
}

export function formatCompositionProgress(progress: number): number {
  return Math.round(Math.min(1, Math.max(0, progress)) * 100);
}

export function isCompositionLocked(status: CompositionStatus): boolean {
  return status === 'loading';
}
