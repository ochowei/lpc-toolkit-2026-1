import {
  getSpritePathsForSelections,
  type Catalog,
  type Selections,
} from '@lpc-toolkit/core';

export function posixDirname(p: string): string {
  const i = p.lastIndexOf('/');
  return i === -1 ? '' : p.slice(0, i);
}

export function dirsForSelections(
  catalog: Catalog,
  selections: Selections,
): string[] {
  const out = new Set<string>();
  for (const layer of getSpritePathsForSelections(selections, catalog)) {
    const rel = layer.path.replace(/^spritesheets\//, '');
    const dir = posixDirname(rel);
    
    // Find the item to check its default animation folder layout
    const item = catalog.byItemId.get(layer.itemId);
    const defaultAnim = item?.animations?.includes('walk')
      ? 'walk'
      : item?.animations?.[0];

    if (defaultAnim && dir.endsWith(`/${defaultAnim}`)) {
      out.add(posixDirname(dir));
    } else {
      out.add(dir);
    }
  }
  return [...out];
}
