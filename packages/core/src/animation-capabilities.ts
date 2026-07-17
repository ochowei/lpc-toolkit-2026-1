import {
  ANIMATIONS,
  ANIMATION_DEFAULTS,
  VIRTUAL_ANIMATION_MAP,
} from './constants.js';
import { customAnimationBase, customAnimations } from './custom-animations.js';
import type { AnimationName, ItemDefinition } from './types.js';

export interface ItemAnimationCapabilities {
  readonly native: readonly AnimationName[];
  readonly compatible: readonly AnimationName[];
  readonly unsupported: readonly AnimationName[];
}

const STANDARD_NAMES = ANIMATIONS.map(({ value }) => value);

const CUSTOM_BASE_ALIASES: Readonly<Record<AnimationName, string>> = {
  '1h_slash': 'backslash',
  '1h_backslash': 'backslash',
  '1h_halfslash': 'halfslash',
};

function nativeAnimations(item: ItemDefinition): readonly AnimationName[] {
  const raw: unknown = item.animations;
  return Array.isArray(raw) && raw.every((name): name is string => typeof name === 'string')
    ? [...new Set(raw)]
    : [...ANIMATION_DEFAULTS];
}

export function compatibleAnimationSource(
  item: ItemDefinition,
  target: AnimationName,
): AnimationName | undefined {
  return compatibleAnimationSources(item, target)[0];
}

export function compatibleAnimationSources(
  item: ItemDefinition,
  target: AnimationName,
): readonly AnimationName[] {
  const targetBase = CUSTOM_BASE_ALIASES[target] ?? target;
  return nativeAnimations(item).filter((name) => {
    const definition = customAnimations[name];
    return definition !== undefined && customAnimationBase(definition) === targetBase;
  });
}

export function itemAnimationCapabilities(item: ItemDefinition): ItemAnimationCapabilities {
  const native = nativeAnimations(item);
  const nativeSet = new Set(native);
  const compatibleSet = new Set(STANDARD_NAMES.filter((target) =>
    !nativeSet.has(target) && compatibleAnimationSources(item, target).length > 0,
  ));
  return {
    native,
    compatible: STANDARD_NAMES.filter((name) => compatibleSet.has(name)),
    unsupported: STANDARD_NAMES.filter(
      (name) => !nativeSet.has(name) && !compatibleSet.has(name),
    ),
  };
}

export function auditAnimationFolder(target: AnimationName): string | undefined {
  const virtual = VIRTUAL_ANIMATION_MAP[target as keyof typeof VIRTUAL_ANIMATION_MAP];
  const physical = virtual ?? target;
  const entry = ANIMATIONS.find(({ value }) => value === physical);
  return entry ? entry.folderName ?? entry.value : undefined;
}

export function animationsSupportFolder(
  animations: readonly string[],
  folder: string,
): boolean {
  if (folder === 'combat_idle') return animations.includes('combat');
  if (folder === 'backslash') {
    return animations.includes('1h_slash') || animations.includes('1h_backslash');
  }
  if (folder === 'halfslash') return animations.includes('1h_halfslash');
  return animations.includes(folder);
}
