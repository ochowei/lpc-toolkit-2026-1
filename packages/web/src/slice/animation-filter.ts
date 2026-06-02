import {
  customAnimationBase,
  customAnimations,
  type AnimationName,
  type Catalog,
  type ItemDefinition,
  type TypeName,
} from '@lpc-toolkit/core';
import type { SliceState } from './selection';

/** Set of animations currently enabled in the Settings filter. Empty means all. */
export type AnimationFilter = ReadonlySet<AnimationName>;

/** Whether an item can contribute to at least one enabled animation. */
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

/** Selected type names that would disappear under the proposed animation filter. */
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
