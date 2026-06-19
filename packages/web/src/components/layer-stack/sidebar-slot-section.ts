import type { TypeName } from '@lpc-toolkit/core';
import type { SliceState } from '../../slice/selection';

export interface SidebarTypeSection {
  readonly id: string;
  readonly typeNames: readonly TypeName[];
}

export function sectionIdForType(
  sections: readonly SidebarTypeSection[],
  typeName: TypeName,
): string | null {
  return sections.find((section) => section.typeNames.includes(typeName))?.id ?? null;
}

export function sectionIdForTypeNavigation(args: {
  readonly sections: readonly SidebarTypeSection[];
  readonly state: SliceState;
  readonly typeName: TypeName;
}): string | null | undefined {
  if (args.state.selections[args.typeName]) return undefined;
  return sectionIdForType(args.sections, args.typeName);
}
