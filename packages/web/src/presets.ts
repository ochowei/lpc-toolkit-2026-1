import {
  CLOTHING_TYPES,
  PRESETS as SHARED_PRESETS,
  type Preset as SharedPreset,
  type PresetItem,
} from '@lpc-toolkit/presets';
import type { TranslationKey } from './i18n';

export { CLOTHING_TYPES, type PresetItem };

export interface Preset extends Omit<SharedPreset, 'labelKey'> {
  readonly labelKey: TranslationKey;
}

export const PRESETS: readonly Preset[] = SHARED_PRESETS as readonly Preset[];
