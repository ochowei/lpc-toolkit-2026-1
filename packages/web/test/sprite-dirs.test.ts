import { describe, expect, it } from 'vitest';
import { createCatalog, type ItemDefinition } from '@lpc-toolkit/core';
import { dirsForSelections, posixDirname } from '../src/slice/sprite-dirs';

const body: ItemDefinition = {
  name: 'Body A',
  type_name: 'body',
  animations: ['walk'],
  credits: [],
  layer_1: { zPos: 10, male: 'body/bodies/male/' },
} as unknown as ItemDefinition;

const { catalog } = createCatalog({ 'body_a.json': body });

describe('posixDirname', () => {
  it('drops the last path segment', () => {
    expect(posixDirname('body/bodies/male/walk.png')).toBe('body/bodies/male');
  });
});

describe('dirsForSelections', () => {
  it('returns the layer directory (sans spritesheets/ prefix)', () => {
    const dirs = dirsForSelections(catalog, {
      bodyType: 'male',
      items: { body: { typeName: 'body', name: 'Body A' } },
    });
    expect(dirs).toEqual(['body/bodies/male']);
  });
});
