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
      <div className="mr-1 flex flex-col leading-none">
        <span className="text-[13px] font-bold tracking-tight">
          LPC<span className="font-medium text-text-mute">·Toolkit</span>
        </span>
        <span className="font-mono text-[9px] text-text-dim">
          {t('app.subtitle')}
          {' · '}
          <a
            href="?ui=v1"
            className="underline-offset-2 hover:text-text-mute hover:underline"
            title="legacy UI (v1)"
          >
            v1
          </a>
        </span>
      </div>
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
