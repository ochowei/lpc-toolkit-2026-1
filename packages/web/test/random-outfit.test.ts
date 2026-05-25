import { describe, expect, it } from 'vitest';
import { createCatalog, type ItemDefinition } from '@lpc-toolkit/core';
import { pickRandomOutfit } from '../src/slice/random-outfit';

function makeItem(name: string, typeName: string, layerKey: 'male' | 'female' = 'male'): ItemDefinition {
  return {
    name,
    type_name: typeName,
    animations: ['walk'],
    credits: [{ file: '', notes: '', authors: ['A'], licenses: ['CC0'], urls: [] }],
    layer_1: { zPos: 10, [layerKey]: `${typeName}/${name}/` },
  } as unknown as ItemDefinition;
}

// Deterministic RNG: returns a sequence of values from `values`.
function seqRng(values: number[]): () => number {
  let i = 0;
  return () => values[i++ % values.length]!;
}

describe('pickRandomOutfit', () => {
  const { catalog } = createCatalog({
    'body/light.json':       makeItem('Light', 'body'),
    'body/dark.json':        makeItem('Dark', 'body'),
    'head/round.json':       makeItem('Round', 'head'),
    'eyes/blue.json':        makeItem('Blue', 'eyes'),
    'hair/curly.json':       makeItem('Curly', 'hair'),
    'hair/spiky.json':       makeItem('Spiky', 'hair'),
    'cape/red.json':         makeItem('Red Cape', 'cape'),
    'weapon/sword.json':     makeItem('Sword', 'weapon'),
    'unknown_type/foo.json': makeItem('Foo', 'unknown_type'),
  });

  it('always picks a body type compatible body item (required category)', () => {
    const sel = pickRandomOutfit({ catalog, bodyType: 'male', rng: seqRng([0]) });
    expect(sel.items['body']).toBeDefined();
  });

  it('skips categories with no compatible items', () => {
    const femaleOnly: ItemDefinition = makeItem('FemaleHair', 'hair', 'female');
    const { catalog: c2 } = createCatalog({
      'body/light.json': makeItem('Light', 'body'),
      'hair/female.json': femaleOnly,
    });
    // rng=0.99 means add everything; but FemaleHair is incompat for male
    const sel = pickRandomOutfit({
      catalog: c2, bodyType: 'male', rng: () => 0.99, optionalProb: 1.0,
    });
    expect(sel.items['hair']).toBeUndefined();
  });

  it('respects optionalProb: 0 produces no optional categories', () => {
    const sel = pickRandomOutfit({
      catalog, bodyType: 'male', rng: () => 0.5, optionalProb: 0,
    });
    // body / head / eyes are required (group 'body' members);
    // hair / cape / weapon are optional and excluded
    expect(sel.items['hair']).toBeUndefined();
    expect(sel.items['cape']).toBeUndefined();
    expect(sel.items['weapon']).toBeUndefined();
  });

  it('respects optionalProb: 1 includes every optional category that has compatible items', () => {
    const sel = pickRandomOutfit({
      catalog, bodyType: 'male', rng: () => 0.5, optionalProb: 1.0,
    });
    expect(sel.items['hair']).toBeDefined();
    expect(sel.items['cape']).toBeDefined();
    expect(sel.items['weapon']).toBeDefined();
  });

  it('returns the configured bodyType', () => {
    const sel = pickRandomOutfit({ catalog, bodyType: 'female', rng: () => 0 });
    expect(sel.bodyType).toBe('female');
  });

  it('is deterministic for a given rng', () => {
    const a = pickRandomOutfit({
      catalog, bodyType: 'male', rng: seqRng([0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9]),
    });
    const b = pickRandomOutfit({
      catalog, bodyType: 'male', rng: seqRng([0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9]),
    });
    expect(a).toEqual(b);
  });
});
