import type { BodyType, Catalog, ItemDefinition, ItemId, TypeName } from '@lpc-toolkit/core';

/** Leaf item rendered in the advanced catalog browser tree. */
export interface CatalogTreeItem {
  readonly id: ItemId;
  readonly name: string;
  readonly typeName: TypeName;
}

/** Folder node derived from upstream sheet_definitions source paths. */
export interface CatalogTreeNode {
  readonly name: string;
  readonly items: CatalogTreeItem[];
  readonly children: Record<string, CatalogTreeNode>;
}

/** Body compatibility check used before exposing an item to the picker. */
export function itemSupportsBodyType(
  item: ItemDefinition,
  bodyType: BodyType,
): boolean {
  return typeof item.layer_1?.[bodyType] === 'string';
}

/** Folder path for an item, falling back to its type when sourcePath is absent. */
function categorySegments(itemId: ItemId, item: ItemDefinition): readonly string[] {
  const path = item.sourcePath ?? `${item.type_name}/${itemId}.json`;
  const parts = path.split('/').filter(Boolean);
  return parts.length > 1 ? parts.slice(0, -1) : [item.type_name];
}

function makeNode(name: string): CatalogTreeNode {
  return { name, items: [], children: {} };
}

function sortNode(node: CatalogTreeNode): CatalogTreeNode {
  const sortedChildren = Object.fromEntries(
    Object.entries(node.children)
      .sort(([a], [b]) => a.localeCompare(b, ['en']))
      .map(([key, child]) => [key, sortNode(child)]),
  );
  return {
    name: node.name,
    items: [...node.items].sort((a, b) => a.name.localeCompare(b.name, ['en'])),
    children: sortedChildren,
  };
}

/** Build a stable, alphabetized tree that mirrors upstream sheet_definitions folders. */
export function buildCatalogTree(catalog: Catalog): CatalogTreeNode {
  const root = makeNode('root');

  for (const [itemId, item] of catalog.byItemId.entries()) {
    let current = root;
    for (const segment of categorySegments(itemId, item)) {
      current.children[segment] ??= makeNode(segment);
      current = current.children[segment];
    }
    current.items.push({
      id: itemId,
      name: item.name,
      typeName: item.type_name,
    });
  }

  return sortNode(root);
}
