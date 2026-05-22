import { describe, expect, it } from 'vitest';
import {
  DEFAULT_LOCALE,
  TRANSLATIONS,
  createLabelTranslator,
  createTranslator,
  type TranslationKey,
} from '../src/i18n';
import { ITEM_NAME_LABELS_ZH } from '../src/i18n-item-names';

describe('i18n', () => {
  it('defaults to English', () => {
    expect(DEFAULT_LOCALE).toBe('en');
  });

  it('keeps English and Chinese translation keys in sync', () => {
    const englishKeys = Object.keys(TRANSLATIONS.en).sort();
    const chineseKeys = Object.keys(TRANSLATIONS['zh-TW']).sort();

    expect(chineseKeys).toEqual(englishKeys);
    expect(englishKeys).toContain('app.subtitle' satisfies TranslationKey);
    expect(englishKeys).toContain('source.project');
  });

  it('translates representative labels', () => {
    const en = createTranslator('en');
    const zh = createTranslator('zh-TW');

    expect(en('controls.play')).toBe('Play');
    expect(en('direction.left')).toBe('Left');
    expect(en('language.toChinese')).toBe('中文');
    expect(en('assetSource.title')).toBe('Sprite source');
    expect(en('assetSource.auto')).toBe('Auto');
    expect(en('assetSource.upstream')).toBe('Upstream');
    expect(zh('controls.play')).toBe('播放');
    expect(zh('direction.left')).toBe('左');
    expect(zh('language.toEnglish')).toBe('English');
    expect(zh('assetSource.title')).toBe('圖片來源');
    expect(zh('assetSource.auto')).toBe('自動');
    expect(zh('assetSource.upstream')).toBe('上游');

    expect(en('picker.common')).toBe('Common');
    expect(en('picker.advanced')).toBe('Advanced: all upstream assets');
    expect(en('picker.searchAssets')).toBe('Search all assets');
    expect(zh('picker.advanced')).toBe('進階：所有上游素材');
  });

  it('translates reset menu labels', () => {
    const en = createTranslator('en');
    const zh = createTranslator('zh-TW');

    expect(en('reset.button')).toBe('Reset');
    expect(en('reset.menuTitle')).toBe('What to reset');
    expect(en('reset.scope.outfit')).toBe('Outfit');
    expect(en('reset.scope.view')).toBe('View');
    expect(en('reset.scope.filters')).toBe('Filters');
    expect(en('reset.confirm')).toBe('Reset selected');
    expect(en('reset.cancel')).toBe('Cancel');

    expect(zh('reset.button')).toBe('重置');
    expect(zh('reset.menuTitle')).toBe('要重置的項目');
    expect(zh('reset.scope.outfit')).toBe('服裝');
    expect(zh('reset.scope.view')).toBe('檢視');
    expect(zh('reset.scope.filters')).toBe('篩選');
    expect(zh('reset.confirm')).toBe('重置選取項目');
    expect(zh('reset.cancel')).toBe('取消');
  });

  it('includes outfit preset keys in both locales', () => {
    const presetKeys = [
      'preset.title',
      'preset.farmer',
      'preset.mage',
      'preset.knight',
      'preset.ranger',
      'preset.noble',
      'preset.rogue',
      'preset.applied',
      'preset.skipped',
    ];
    for (const key of presetKeys) {
      expect(Object.keys(TRANSLATIONS.en)).toContain(key);
      expect(Object.keys(TRANSLATIONS['zh-TW'])).toContain(key);
    }
  });
});

describe('label translator', () => {
  it('returns raw values for English', () => {
    const en = createLabelTranslator('en');
    expect(en.category('body')).toBe('body');
    expect(en.bodyType('male')).toBe('male');
    expect(en.anim('walk')).toBe('walk');
    expect(en.itemName('Plate armor')).toBe('Plate armor');
  });

  it('translates category, body type and animation labels for Chinese', () => {
    const zh = createLabelTranslator('zh-TW');
    expect(zh.category('body')).toBe('身體');
    expect(zh.category('expression')).toBe('表情');
    expect(zh.bodyType('male')).toBe('男性');
    expect(zh.anim('walk')).toBe('行走');
  });

  it('falls back to the raw value for unknown keys', () => {
    const zh = createLabelTranslator('zh-TW');
    expect(zh.category('__nope__')).toBe('__nope__');
    expect(zh.bodyType('__nope__')).toBe('__nope__');
    expect(zh.anim('__nope__')).toBe('__nope__');
    expect(zh.itemName('__nope__')).toBe('__nope__');
  });

  it('normalises category key case', () => {
    const zh = createLabelTranslator('zh-TW');
    expect(zh.category('Body')).toBe('身體');
    expect(zh.category('EXPRESSION')).toBe('表情');
  });

  it('translates a known asset name for Chinese', () => {
    const zh = createLabelTranslator('zh-TW');
    const translated = Object.entries(ITEM_NAME_LABELS_ZH).find(
      ([key, value]) => key !== value,
    );
    expect(translated).toBeDefined();
    const [name, label] = translated!;
    expect(zh.itemName(name)).toBe(label);
  });

  it('has a non-trivial asset-name dictionary', () => {
    expect(Object.keys(ITEM_NAME_LABELS_ZH).length).toBeGreaterThan(100);
  });
});
