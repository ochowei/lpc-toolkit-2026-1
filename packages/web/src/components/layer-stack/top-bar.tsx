import type { PropsWithChildren, ReactNode } from 'react';
import type { Translator } from '../../i18n';
import { Button } from '../ui/button';

interface Props {
  t: Translator;
  loadingProgress: number | null;
  upstreamHref: string;
  onNavigateHome: () => void;
  rightSlot?: ReactNode;
}

/** Application header with global controls, progress, and upstream link. */
export function TopBar({
  t,
  loadingProgress,
  upstreamHref,
  onNavigateHome,
  rightSlot,
  children,
}: PropsWithChildren<Props>) {
  return (
    <header className="flex flex-wrap items-center gap-2 border-b border-border bg-surface px-2 py-2 text-xs sm:px-3 md:flex-nowrap">
      <Button
        size="sm"
        variant="ghost"
        onClick={onNavigateHome}
        aria-label={t('topBar.backHome')}
      >
        {t('topBar.backHome')}
      </Button>
      <div aria-hidden="true" className="h-6 w-px shrink-0 bg-border" />
      <div className="mr-1 flex min-w-0 flex-col leading-none">
        <span className="text-[13px] font-bold tracking-tight">
          LPC<span className="font-medium text-text-mute">·Toolkit</span>
        </span>
        <span className="hidden font-mono text-[9px] text-text-dim sm:inline">
          {t('app.subtitle')}
          {' · '}
          <a
            href={upstreamHref}
            target="_blank"
            rel="noopener noreferrer"
            className="underline-offset-2 hover:text-text-mute hover:underline"
            title={t('topBar.upstreamLink')}
          >
            upstream
          </a>
        </span>
      </div>
      {children /* slots for BodyType pill, popovers, attribution */}
      <div className="min-w-2 flex-1" />
      {loadingProgress != null && loadingProgress < 1 && (
        <span className="inline-flex items-center gap-1 font-mono text-[10px] text-text-dim">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-accent" />
          {t('status.loading')} {Math.round(loadingProgress * 100)}%
        </span>
      )}
      {rightSlot}
    </header>
  );
}
