import {
  customAnimationBase,
  customAnimations,
  type AnimationName,
  type Catalog,
  type ItemDefinition,
  type TypeName,
} from '@lpc-toolkit/core';
import type { SliceState } from './selection';

export type AnimationFilter = ReadonlySet<AnimationName>;

export function itemMatchesAnimationFilter(
  item: ItemDefinition,
  enabled: AnimationFilter,
): boolean {
  if (enabled.size === 0) return true;
  if (item.animations.length === 0) return true;
  for (const anim of item.animations) {
    if (enabled.has(anim)) return true;
    const def = customAnimations[anim];
    if (!def) continue;
    const base = customAnimationBase(def);
    if (enabled.has(base)) return true;
  }
  return false;
}

export function incompatibleAnimationTypeNamesFor(
  state: SliceState,
  catalog: Catalog,
  enabled: AnimationFilter,
): TypeName[] {
  const out: TypeName[] = [];
  for (const [tn, sel] of Object.entries(state.selections)) {
    const item = (catalog.byTypeName.get(tn) ?? []).find(
      (d) => d.name === sel.name,
    );
    if (item && !itemMatchesAnimationFilter(item, enabled)) out.push(tn);
  }
  return out;
}
