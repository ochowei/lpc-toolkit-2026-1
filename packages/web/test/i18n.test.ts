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
    expect(zh('controls.play')).toBe('播放');
    expect(zh('direction.left')).toBe('左');
    expect(zh('language.toEnglish')).toBe('English');

    expect(en('picker.common')).toBe('Common');
    expect(en('picker.advanced')).toBe('Advanced: all upstream assets');
    expect(en('picker.searchAssets')).toBe('Search all assets');
    expect(zh('picker.advanced')).toBe('進階：所有上游素材');
    expect(en('composition.loading')).toBe('Loading character');
    expect(zh('composition.loading')).toBe('角色載入中');

    expect(en('layer.swap')).toBe('Swap {name}');
    expect(zh('layer.swap')).toBe('更換{name}');
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
});

describe('label translator', () => {
  it('returns raw values for English', () => {
    const en = createLabelTranslator('en');
    expect(en.category('body')).toBe('body');
    expect(en.bodyType('male')).toBe('male');
    expect(en.anim('walk')).toBe('walk');
    expect(en.itemName('Plate armor')).toBe('Plate armor');
    expect(en.color('red')).toBe('Red');
    expect(en.color('fur_black')).toBe('Fur black');
    expect(en.color('lpcr.tan')).toBe('Tan');
    expect(en.color('lpcr.brown')).toBe('Brown');
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

    const sheetFiles = getJsonFiles(sheetDir);
    for (const file of sheetFiles) {
      const content = JSON.parse(fs.readFileSync(file, 'utf8'));
      if (Array.isArray(content.variants)) {
        for (const v of content.variants) {
          variantKeys.add(v);
        }
      }
    }

    const missing: string[] = [];
    const allKeys = new Set([...colorKeys, ...variantKeys]);

    const legitimatelyUnmapped = new Set([
      'hook', 'peg_leg', 'skeleton', 'dragonfly', 'monarch', 'pixie', 'lunar', 'sara', 'horns',
      'cyclops', 'jack', 'pirate', 'sunglasses', 'rod', 'axe', 'hammer', 'pickaxe', 'hoe',
      'shovel', 'watering', 'whip', 'round', 'square', 'coal', 'tin', '3_logs', '9_logs', 'quiver',
      'club', 'flail', 'mace', 'waraxe', 'medium', 'simple', 'wand', 'cane', 'halberd', 'scythe',
      'arrow', 'boomerang', 'crossbow', 'slingshot', 'crusader', 'plus', 'two_engrailed',
      'two_engrailed_trim', 'scutum', 'scutum_trim', 'spartan', 'dagger', 'katana', 'longsword',
      'longsword_alt', 'rapier', 'saber', 'scimitar'
    ]);

    const isMapped = (k: string): boolean => {
      const lower = k.toLowerCase();
      if (COLOR_LABELS_ZH[lower] !== undefined) return true;
      const lastDot = lower.lastIndexOf('.');
      if (lastDot !== -1) {
        const suffix = lower.slice(lastDot + 1);
        if (COLOR_LABELS_ZH[suffix] !== undefined) return true;
      }
      return false;
    };

    for (const key of allKeys) {
      if (legitimatelyUnmapped.has(key)) continue;
      if (!isMapped(key)) {
        missing.push(key);
      }
    }

    if (missing.length > 0) {
      expect.fail(
        `The following ${missing.length} color/variant key(s) are missing Traditional Chinese translations:\n` +
          missing.map((k) => `  - ${k}`).join('\n')
      );
    }
  });
});
