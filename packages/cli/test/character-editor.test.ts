import {
  BODY_TYPES,
  createCatalog,
  type ItemDefinition,
  type Selections,
} from '@lpc-toolkit/core';
import { describe, expect, it } from 'vitest';
import {
  createEmptyCharacter,
  removeCharacterItem,
  searchCharacterItems,
  setCharacterItem,
  type CharacterCatalogContext,
} from '../src/character-editor.js';

const body: ItemDefinition = {
  name: 'Body Color',
  type_name: 'body',
  animations: ['walk'],
  credits: [],
  layer_1: { zPos: 10, male: 'body/bodies/male/' },
};

const braid: ItemDefinition = {
  name: 'Braid',
  display_name: 'Single Braid',
  type_name: 'hair',
  animations: ['walk'],
  credits: [{
    file: 'hair/braid',
    notes: '',
    authors: ['Artist'],
    licenses: ['GPL 3.0'],
    urls: [],
  }],
  layer_1: { zPos: 50, male: 'hair/braid/' },
};

const braids: ItemDefinition = {
  name: 'Braids',
  type_name: 'hair',
  animations: ['walk', 'hurt'],
  credits: [{
    file: 'hair/braids',
    notes: '',
    authors: ['Artist'],
    licenses: ['GPL 2.0', 'GPL 3.0'],
    urls: [],
  }],
  variants: ['brown'],
  layer_1: { zPos: 50, male: 'hair/braids/' },
};

const variantOnly: ItemDefinition = {
  name: 'Variant Only',
  type_name: 'hair',
  animations: ['walk'],
  credits: [],
  variants: ['black', 'brown'],
  layer_1: { zPos: 50, male: 'hair/variant-only/${variant}/' },
};

const femaleHair: ItemDefinition = {
  name: 'Female Hair',
  type_name: 'hair',
  animations: ['walk'],
  credits: [],
  layer_1: { zPos: 50, female: 'hair/female/' },
};

const hat: ItemDefinition = {
  name: 'Cap',
  type_name: 'hat',
  animations: ['walk'],
  credits: [],
  layer_1: { zPos: 60, male: 'hat/cap/' },
};

const catalog = createCatalog({
  'body/body.json': body,
  'hair/braid.json': braid,
  'hair/braids.json': braids,
  'hair/variant-only.json': variantOnly,
  'hair/female-hair.json': femaleHair,
  'hat/cap.json': hat,
}).catalog;

const context: CharacterCatalogContext = {
  catalog,
  palettes: { materials: {}, versions: {} },
  pathExists: (spritePath) => !spritePath.includes('${variant}'),
};

const maleSelections: Selections = {
  bodyType: 'male',
  items: { body: { typeName: 'body', name: 'Body Color' } },
};

describe('character editor', () => {
  it('searches name and item id, filters body type, and sorts by item id', () => {
    const result = searchCharacterItems(
      maleSelections,
      { typeName: 'hair', query: 'braid' },
      context,
    );

    expect(result.items.map((item) => item.itemId)).toEqual(['braid', 'braids']);
    expect(result.items[0]).toMatchObject({
      name: 'Single Braid',
      licenses: ['GPL'],
      replacesCurrent: false,
    });
    expect(result.count).toBe(2);
  });

  it('sets one type without changing another type', () => {
    const result = setCharacterItem(
      maleSelections,
      { typeName: 'hair', itemRef: 'braids', variant: 'brown' },
      context,
    );

    expect(result.selections.items.body).toEqual(maleSelections.items.body);
    expect(result.selections.items.hair).toEqual({
      typeName: 'hair',
      name: 'Braids',
      variant: 'brown',
    });
    expect(result.replaced).toBe(false);
    expect(maleSelections.items.hair).toBeUndefined();
  });

  it('returns available variants instead of guessing', () => {
    expect(() => setCharacterItem(
      maleSelections,
      { typeName: 'hair', itemRef: 'variant-only' },
      context,
    )).toThrowError(expect.objectContaining({
      code: 'missing_variant',
      details: { available: ['black', 'brown'] },
    }));
  });

  it('does not attribute another selected type validation failure to the edited item', () => {
    expect(() => setCharacterItem(
      maleSelections,
      { typeName: 'hair', itemRef: 'variant-only' },
      { ...context, pathExists: () => false },
    )).toThrowError(expect.objectContaining({
      code: 'missing_sprite_path',
      path: 'body/Body Color',
    }));
  });

  it('rejects a body type outside the public core list', () => {
    expect(() => createEmptyCharacter('hero', 'centaur')).toThrowError(
      expect.objectContaining({
        code: 'body_type_invalid',
        details: { available: [...BODY_TYPES] },
      }),
    );
  });

  it('creates an empty selection document for a supported body type', () => {
    expect(createEmptyCharacter('hero', 'male')).toEqual({
      schema: 'lpc-toolkit.selection.v1',
      name: 'hero',
      bodyType: 'male',
      items: {},
    });
  });

  it('rejects an item id belonging to a different type', () => {
    expect(() => setCharacterItem(
      maleSelections,
      { typeName: 'hair', itemRef: 'cap' },
      context,
    )).toThrowError(expect.objectContaining({ code: 'item_type_mismatch' }));
  });

  it('removes exactly one selected type and rejects an unselected type', () => {
    const withHair = setCharacterItem(
      maleSelections,
      { typeName: 'hair', itemRef: 'braid' },
      context,
    ).selections;

    const result = removeCharacterItem(withHair, 'hair');
    expect(result.selections.items).toEqual({ body: maleSelections.items.body });
    expect(result.replaced).toBe(true);
    expect(() => removeCharacterItem(maleSelections, 'hair')).toThrowError(
      expect.objectContaining({ code: 'selection_type_not_set', path: 'hair' }),
    );
  });
});
