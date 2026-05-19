export const TRANSLATIONS = {
  en: {
    'app.subtitle': 'foundation slice',
    'theme.light': 'Light',
    'theme.dark': 'Dark',
    'language.toChinese': '中文',
    'language.toEnglish': 'English',
    'picker.bodyType': 'Body type',
    'picker.none': 'none',
    'direction.up': 'Up',
    'direction.left': 'Left',
    'direction.down': 'Down',
    'direction.right': 'Right',
    'controls.pause': 'Pause',
    'controls.play': 'Play',
    'status.loading': 'loading',
    'attribution.title': 'Attribution',
    'attribution.required': 'required',
    'attribution.effectiveLicense': 'Effective license:',
    'attribution.by': 'by',
    'attribution.unknown': 'unknown',
  },
  'zh-TW': {
    'app.subtitle': '基礎切片',
    'theme.light': '淺色',
    'theme.dark': '深色',
    'language.toChinese': '中文',
    'language.toEnglish': 'English',
    'picker.bodyType': '身體類型',
    'picker.none': '無',
    'direction.up': '上',
    'direction.left': '左',
    'direction.down': '下',
    'direction.right': '右',
    'controls.pause': '暫停',
    'controls.play': '播放',
    'status.loading': '載入中',
    'attribution.title': '署名',
    'attribution.required': '必要',
    'attribution.effectiveLicense': '有效授權：',
    'attribution.by': '作者',
    'attribution.unknown': '未知',
  },
} as const;

export type Locale = keyof typeof TRANSLATIONS;
export type TranslationKey = keyof (typeof TRANSLATIONS)['en'];
export type Translator = (key: TranslationKey) => string;

export const DEFAULT_LOCALE: Locale = 'en';

export function createTranslator(locale: Locale): Translator {
  return (key) => TRANSLATIONS[locale][key];
}
