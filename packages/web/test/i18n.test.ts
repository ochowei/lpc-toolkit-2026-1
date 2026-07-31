/** Verifies locale defaults, key coverage, and label translation behavior. */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_LOCALE,
  TRANSLATIONS,
  createLabelTranslator,
  createTranslator,
  COLOR_LABELS_ZH,
  VARIANT_LABELS_ZH,
  type TranslationKey,
} from '../src/i18n';
import { ITEM_NAME_LABELS_ZH } from '../src/i18n-item-names';
import type { ItemDefinition } from '@lpc-toolkit/core';

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
    expect(zh('controls.play')).toBe('播放');
    expect(zh('direction.left')).toBe('左');
    expect(zh('language.toEnglish')).toBe('English');

    expect(en('picker.style')).toBe('Style');
    expect(zh('picker.style')).toBe('款式');
    expect(en('picker.followsBody')).toBe('Follows body');
    expect(zh('picker.followsBody')).toBe('跟隨身體');
    expect(en('picker.assetDefault')).toBe('Asset default');
    expect(zh('picker.assetDefault')).toBe('資產預設色');

    expect(en('picker.common')).toBe('Common');
    expect(en('picker.advanced')).toBe('Advanced: all upstream assets');
    expect(en('picker.searchAssets')).toBe('Search all assets');
    expect(zh('picker.advanced')).toBe('進階：所有上游素材');
    expect(en('composition.loading')).toBe('Loading character');
    expect(zh('composition.loading')).toBe('角色載入中');

    expect(en('layer.swap')).toBe('Swap {name}');
    expect(zh('layer.swap')).toBe('更換{name}');

    expect(en('replacementCards.displayMode')).toBe('Card labels');
    expect(en('replacementCards.stacked')).toBe('Stacked');
    expect(en('replacementCards.overlay')).toBe('Overlay');
    expect(en('replacementCards.hidden')).toBe('Hidden');
    expect(zh('replacementCards.displayMode')).toBe('卡片文字');
    expect(zh('replacementCards.stacked')).toBe('上下');
    expect(zh('replacementCards.overlay')).toBe('覆蓋');
    expect(zh('replacementCards.hidden')).toBe('隱藏');
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

  it('translates sidebar slot group toggle copy', () => {
    const en = createTranslator('en');
    const zh = createTranslator('zh-TW');

    expect(en('groupSlots.show')).toBe('Show {n} {slotLabel}');
    expect(en('groupSlots.hide')).toBe('Hide {n} {slotLabel}');
    expect(en('groupSlots.slotSingular')).toBe('slot');
    expect(en('groupSlots.slotPlural')).toBe('slots');
    expect(zh('groupSlots.show')).toBe('顯示 {n} 個欄位');
    expect(zh('groupSlots.hide')).toBe('隱藏 {n} 個欄位');
    expect(zh('groupSlots.slotSingular')).toBe('欄位');
    expect(zh('groupSlots.slotPlural')).toBe('欄位');
  });

  it('includes outfit preset keys in both locales', () => {
    const presetKeys = [
      'preset.title',
      'preset.farmer',
      'preset.villager',
      'preset.mage',
      'preset.knight',
      'preset.ranger',
      'preset.noble',
      'preset.applied',
      'preset.skipped',
    ];
    for (const key of presetKeys) {
      expect(Object.keys(TRANSLATIONS.en)).toContain(key);
      expect(Object.keys(TRANSLATIONS['zh-TW'])).toContain(key);
    }
  });

  it('includes selected-items keys in both locales', () => {
    const keys = [
      'selected.title',
      'selected.empty',
      'selected.remove',
      'picker.clickToRemove',
    ];
    for (const key of keys) {
      expect(Object.keys(TRANSLATIONS.en)).toContain(key);
      expect(Object.keys(TRANSLATIONS['zh-TW'])).toContain(key);
    }
  });

  it('includes Share / Import keys in both locales', () => {
    const shareKeys = [
      'share.title',
      'share.characterJson',
      'share.saveJson',
      'share.importJson',
      'share.imported',
      'share.importFailed',
      'share.sharing',
    ] satisfies readonly TranslationKey[];

    for (const key of shareKeys) {
      expect(Object.keys(TRANSLATIONS.en)).toContain(key);
      expect(Object.keys(TRANSLATIONS['zh-TW'])).toContain(key);
    }
  });
});

describe('label translator', () => {
  it('returns raw values for English', () => {
    const en = createLabelTranslator('en');
    expect(en.category('body')).toBe('body');
    expect(en.bodyType('male')).toBe('Male');
    expect(en.anim('walk')).toBe('walk');
    expect(en.itemName('Plate armor')).toBe('Plate armor');
    expect(en.color('red')).toBe('Red');
    expect(en.color('fur_black')).toBe('Fur black');
    expect(en.color('lpcr.tan')).toBe('Tan');
    expect(en.color('lpcr.brown')).toBe('Brown');
    expect(en.variant('pickaxe')).toBe('Pickaxe');
    expect(en.variant('longsword_alt')).toBe('Longsword alt');
    expect(en.channel('eyes', 'Eye Color')).toBe('Eye Color');
  });

  it('translates category, body type and animation labels for Chinese', () => {
    const zh = createLabelTranslator('zh-TW');
    expect(zh.category('body')).toBe('身體');
    expect(zh.category('expression')).toBe('表情');
    expect(zh.bodyType('male')).toBe('男性');
    expect(zh.anim('walk')).toBe('行走');
    expect(zh.color('red')).toBe('紅色');
    expect(zh.color('fur_black')).toBe('黑色毛皮');
    expect(zh.color('lpcr.tan')).toBe('沙色');
    expect(zh.color('lpcr.brown')).toBe('棕色');
    expect(zh.color('brown')).toBe('棕色');
    expect(zh.color('ivory')).toBe('象牙色');
    expect(zh.channel('eyes', 'Eye Color')).toBe('眼睛顏色');
    expect(zh.channel('hairtie')).toBe('髮帶');
    expect(zh.channel('__custom_channel__')).toBe('Custom channel');
  });

  it('translates Tools variants for Chinese', () => {
    const zh = createLabelTranslator('zh-TW');

    expect(zh.variant('axe')).toBe('斧頭');
    expect(zh.variant('hammer')).toBe('鐵鎚');
    expect(zh.variant('pickaxe')).toBe('十字鎬');
    expect(zh.variant('hoe')).toBe('鋤頭');
    expect(zh.variant('shovel')).toBe('鏟子');
    expect(zh.variant('watering')).toBe('澆水壺');
    expect(zh.variant('rod')).toBe('釣竿');
    expect(zh.variant('whip')).toBe('鞭子');
  });

  it('humanizes unknown variants without treating them as colors', () => {
    const zh = createLabelTranslator('zh-TW');

    expect(zh.variant('longsword_alt')).toBe('Longsword alt');
    expect(zh.color('red')).toBe('紅色');
  });

  it('translates the four Tools item names for Chinese', () => {
    const zh = createLabelTranslator('zh-TW');

    expect(zh.itemName('Rod')).toBe('釣竿');
    expect(zh.itemName('Smash')).toBe('敲擊工具');
    expect(zh.itemName('Thrust')).toBe('推刺工具');
    expect(zh.itemName('Whip')).toBe('鞭子');
  });

  it('falls back to the raw value for unknown keys', () => {
    const zh = createLabelTranslator('zh-TW');
    expect(zh.category('__nope__')).toBe('__nope__');
    expect(zh.bodyType('__nope__')).toBe('__nope__');
    expect(zh.anim('__nope__')).toBe('__nope__');
    expect(zh.itemName('__nope__')).toBe('__nope__');
    expect(zh.color('lpcr.unknown_color')).toBe('Unknown color');
    expect(zh.color('lpcr.neon_purple')).toBe('Neon purple');
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

  it('translates catalog item names with fallback', () => {
    const en = createLabelTranslator('en');
    const zh = createLabelTranslator('zh-TW');

    expect(en.catalogItemName({ name: 'Normal', display_name: 'Normal Bow', itemId: 'weapon_ranged_bow_normal' } as ItemDefinition)).toBe('Normal Bow');
    expect(zh.catalogItemName({ name: 'Normal', display_name: 'Normal Bow', itemId: 'weapon_ranged_bow_normal' } as ItemDefinition)).toBe('普通弓');
    expect(zh.catalogItemName({ name: 'Great', display_name: 'Great Bow', itemId: 'weapon_ranged_bow_great' } as ItemDefinition)).toBe('大弓');
    expect(zh.catalogItemName({ name: 'Normal', itemId: 'unmapped_normal' } as ItemDefinition)).toBe('正常');
    expect(en.catalogItemName({ name: 'Unknown' } as ItemDefinition)).toBe('Unknown');
  });
});

describe('i18n catalog safety guard', () => {
  it('ensures all color and variant keys in the catalog have translations', () => {
    const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
    const paletteDir = path.join(repoRoot, 'assets/palette_definitions');
    const sheetDir = path.join(repoRoot, 'assets/sheet_definitions');

    function getJsonFiles(dir: string): string[] {
      const results: string[] = [];
      if (!fs.existsSync(dir)) return results;
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          results.push(...getJsonFiles(fullPath));
        } else if (entry.isFile() && entry.name.endsWith('.json') && !entry.name.startsWith('meta_')) {
          results.push(fullPath);
        }
      }
      return results;
    }

    const colorKeys = new Set<string>();
    const variantKeys = new Set<string>();

    const paletteFiles = getJsonFiles(paletteDir);
    for (const file of paletteFiles) {
      const content = JSON.parse(fs.readFileSync(file, 'utf8'));
      for (const key of Object.keys(content)) {
        colorKeys.add(key);
      }
    }

    const sheetFiles = [
      ...getJsonFiles(sheetDir),
      ...getJsonFiles(path.join(repoRoot, 'assets_custom/sheet_definitions')),
    ];
    for (const file of sheetFiles) {
      const content = JSON.parse(fs.readFileSync(file, 'utf8'));
      if (Array.isArray(content.variants)) {
        for (const v of content.variants) {
          variantKeys.add(v);
        }
      }
    }

    const legitimatelyUnmapped = new Set([
      'hook', 'peg_leg', 'skeleton', 'dragonfly', 'monarch', 'pixie', 'lunar', 'sara', 'horns',
      'cyclops', 'jack', 'pirate', 'sunglasses', 'round', 'square', 'coal', 'tin', '3_logs', '9_logs', 'quiver',
      'club', 'flail', 'mace', 'waraxe', 'medium', 'simple', 'wand', 'cane', 'halberd', 'scythe',
      'arrow', 'boomerang', 'crossbow', 'slingshot', 'crusader', 'plus', 'two_engrailed',
      'two_engrailed_trim', 'scutum', 'scutum_trim', 'spartan', 'dagger', 'katana', 'longsword',
      'longsword_alt', 'rapier', 'saber', 'scimitar'
    ]);

    const isMappedColor = (k: string): boolean => {
      const lower = k.toLowerCase();
      if (COLOR_LABELS_ZH[lower] !== undefined) return true;
      const lastDot = lower.lastIndexOf('.');
      if (lastDot !== -1) {
        const suffix = lower.slice(lastDot + 1);
        if (COLOR_LABELS_ZH[suffix] !== undefined) return true;
      }
      return false;
    };

    const missingColors = [...colorKeys].filter((key) => !isMappedColor(key));
    const missingVariants = [...variantKeys].filter(
      (key) =>
        !legitimatelyUnmapped.has(key) &&
        VARIANT_LABELS_ZH[key.toLowerCase()] === undefined &&
        !isMappedColor(key),
    );
    const missing = [
      ...missingColors.map((key) => `color: ${key}`),
      ...missingVariants.map((key) => `variant: ${key}`),
    ];

    if (missing.length > 0) {
      expect.fail(
        `The following ${missing.length} color/variant key(s) are missing Traditional Chinese translations:\n` +
          missing.map((k) => `  - ${k}`).join('\n')
      );
    }
  });
});
