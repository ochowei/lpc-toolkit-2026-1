import { describe, expect, it } from 'vitest';
import type { TypeName } from '@lpc-toolkit/core';
import type { SliceState } from '../src/slice/selection';
import {
  sectionIdForType,
  sectionIdForTypeNavigation,
  type SidebarTypeSection,
} from '../src/components/layer-stack/sidebar-slot-section';

const sections: readonly SidebarTypeSection[] = [
  { id: 'body', typeNames: ['body' as TypeName] },
  { id: 'torso', typeNames: ['clothes' as TypeName, 'belt' as TypeName] },
];

const state: SliceState = {
  bodyType: 'male',
  selections: {
    body: { typeName: 'body', name: 'Body Color' },
  },
  anim: 'walk',
  dir: 'down',
  playing: true,
  zoom: 4,
  layout: 'single',
};

describe('sidebar slot section helpers', () => {
  it('finds the section containing a type', () => {
    expect(sectionIdForType(sections, 'clothes' as TypeName)).toBe('torso');
    expect(sectionIdForType(sections, 'hair' as TypeName)).toBeNull();
  });

  it('leaves section state unchanged for an already selected type', () => {
    expect(
      sectionIdForTypeNavigation({
        sections,
        state,
        typeName: 'body' as TypeName,
      }),
    ).toBeUndefined();
  });

  it('opens the containing section for an unselected type', () => {
    expect(
      sectionIdForTypeNavigation({
        sections,
        state,
        typeName: 'clothes' as TypeName,
      }),
    ).toBe('torso');
  });
});
