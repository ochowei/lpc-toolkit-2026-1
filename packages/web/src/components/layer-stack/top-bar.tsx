import type { PropsWithChildren } from 'react';
import { Button } from '../ui/button';
import type { Translator } from '../../i18n';

interface Props {
  t: Translator;
  theme: 'dark' | 'light';
  locale: 'en' | 'zh-TW';
  loadingProgress: number | null;
  onToggleTheme: () => void;
  onToggleLocale: () => void;
}

export function TopBar({
  t,
  theme,
  locale,
  loadingProgress,
  onToggleTheme,
  onToggleLocale,
  children,
}: PropsWithChildren<Props>) {
  return (
    <header className="flex items-center gap-2 border-b border-border bg-surface px-3 py-2 text-xs">
      {children /* slots for BodyType pill, popovers, attribution */}
      <div className="flex-1" />
      {loadingProgress != null && loadingProgress < 1 && (
        <span className="inline-flex items-center gap-1 font-mono text-[10px] text-text-dim">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-accent" />
          {t('status.loading')} {Math.round(loadingProgress * 100)}%
        </span>
      )}
      <Button size="sm" variant="ghost" onClick={onToggleLocale}>
        {locale === 'en' ? '中文' : 'EN'}
      </Button>
      <Button size="sm" variant="ghost" onClick={onToggleTheme} aria-label="toggle theme">
        {theme === 'dark' ? '☀' : '☾'}
      </Button>
    </header>
  );
}
