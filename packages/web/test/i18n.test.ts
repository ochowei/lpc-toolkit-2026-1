import { describe, expect, it } from 'vitest';
import {
  DEFAULT_LOCALE,
  TRANSLATIONS,
  createTranslator,
  type TranslationKey,
} from '../src/i18n';

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
});
