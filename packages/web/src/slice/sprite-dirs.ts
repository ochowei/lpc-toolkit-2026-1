import {
  getSpritePathsForSelections,
  type Catalog,
  type Selections,
} from '@lpc-toolkit/core';

export function posixDirname(p: string): string {
  const i = p.lastIndexOf('/');
  return i === -1 ? '' : p.slice(0, i);
}

/**
 * The spritesheet directories a selection needs. core's LayerSpec.path is
 * `spritesheets/<basePath><defaultAnim>.png`; all animation PNGs for a
 * non-variant standard layer are siblings in `<basePath>`, so copying the
 * directory of the default-anim path brings every animation along.
 */
export function dirsForSelections(
  catalog: Catalog,
  selections: Selections,
): string[] {
  const out = new Set<string>();
  for (const layer of getSpritePathsForSelections(selections, catalog)) {
    const rel = layer.path.replace(/^spritesheets\//, '');
    out.add(posixDirname(rel));
  }
  return [...out];
}
