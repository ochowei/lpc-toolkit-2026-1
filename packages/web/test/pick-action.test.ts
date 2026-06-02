/** Verifies selection actions produced when catalog items are picked. */
import { describe, expect, it } from 'vitest';
import type { ItemDefinition } from '@lpc-toolkit/core';
import { pickActionForItem } from '../src/slice/selection';

function makeItem(
  name: string,
  typeName: string,
  variants?: readonly string[],
): ItemDefinition {
  return {
    name,
    type_name: typeName,
    animations: ['walk'],
    credits: [],
    layer_1: { zPos: 10, male: `${typeName}/${name}/` },
    ...(variants ? { variants } : {}),
  } as unknown as ItemDefinition;
}

describe('pickActionForItem', () => {
  it('includes the first variant when item has variants', () => {
    const action = pickActionForItem('body', makeItem('Zombie', 'body', ['zombie']));
    expect(action).toEqual({
      type: 'pick',
      typeName: 'body',
      name: 'Zombie',
      variant: 'zombie',
    });
  });

  it('picks the FIRST variant deterministically (not e.g. random)', () => {
    const action = pickActionForItem(
      'hair',
      makeItem('Curly', 'hair', ['red', 'blonde', 'black']),
    );
    expect(action).toMatchObject({ variant: 'red' });
  });

  it('omits variant when item has no variants declared', () => {
    const action = pickActionForItem('body', makeItem('Body Color', 'body'));
    expect(action).toEqual({
      type: 'pick',
      typeName: 'body',
      name: 'Body Color',
    });
    expect(action).not.toHaveProperty('variant');
  });

  it('omits variant when variants array is empty', () => {
    const action = pickActionForItem('body', makeItem('Edge', 'body', []));
    expect(action).not.toHaveProperty('variant');
  });
});
