import { useRef, type RefObject, type ButtonHTMLAttributes } from 'react';
import { Button } from '../../ui/button';
import { usePopover } from './use-popover';
import { cn } from '../../../lib/cn';
import type { Locale, Translator } from '../../../i18n';

export type MoreMenuTarget = 'token' | 'reset' | 'attribution';

interface Props {
  open: boolean;
  setOpen: (v: boolean) => void;
  t: Translator;
  locale: Locale;
  theme: 'dark' | 'light';
  attributionCount: number;
  attributionIncompatible: boolean;
  onSelect: (target: MoreMenuTarget) => void;
  onToggleLocale: () => void;
  onToggleTheme: () => void;
  /** Forwarded so other popovers (Token / Reset / Attribution) can anchor to the same `⋯` button. */
  anchorRefOut?: RefObject<HTMLButtonElement>;
}

export function MoreMenuPopover({
  open,
  setOpen,
  t,
  locale,
  theme,
  attributionCount,
  attributionIncompatible,
  onSelect,
  onToggleLocale,
  onToggleTheme,
  anchorRefOut,
}: Props) {
  const localAnchor = useRef<HTMLButtonElement>(null);
  const anchor = anchorRefOut ?? localAnchor;
  const { panelRef, pos } = usePopover(open, () => setOpen(false), anchor);

  const handlePick = (target: MoreMenuTarget) => {
    setOpen(false);
    onSelect(target);
  };

  return (
    <>
      <Button
        ref={anchor}
        size="sm"
        variant={open ? 'primary' : 'ghost'}
        className={attributionIncompatible ? 'border border-danger text-danger' : ''}
        onClick={() => setOpen(!open)}
        aria-label={t('more.title')}
        aria-haspopup="menu"
        aria-expanded={open}
        title={t('more.title')}
      >
        ⋯
      </Button>
      {open && pos && (
        <div
          ref={panelRef}
          style={{ position: 'fixed', top: pos.top, right: 12, zIndex: 50 }}
          className="w-56 rounded-md border border-border bg-surface p-1 text-[12px] shadow-lg"
          role="menu"
        >
          {/* Right-anchored: panel hugs viewport right edge (12px gutter) instead of pos.left,
              because ⋯ sits at the navbar's right end and a left-anchored panel could clip. */}
          <MenuItem onClick={() => handlePick('token')}>
            <span>🔗 {t('token.title')}</span>
          </MenuItem>
          <MenuItem onClick={() => handlePick('reset')}>
            <span>↻ {t('reset.button')}</span>
          </MenuItem>
          <MenuItem
            onClick={() => handlePick('attribution')}
            className={attributionIncompatible ? 'text-danger' : ''}
          >
            <span>
              {attributionIncompatible ? '⚠' : '©'} {t('attribution.title')}
            </span>
            <span className="ml-auto font-mono text-[10px] text-text-mute">
              {attributionCount}
            </span>
          </MenuItem>

          <div className="my-1 border-t border-border" />
          <div className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-text-mute">
            {t('more.preferences')}
          </div>

          <MenuItem onClick={() => { setOpen(false); onToggleLocale(); }}>
            <span>{t('more.language')}</span>
            <span className="ml-auto font-mono text-[10px] text-text-mute">
              {locale === 'en' ? 'EN' : '中文'}
            </span>
          </MenuItem>
          <MenuItem onClick={() => { setOpen(false); onToggleTheme(); }}>
            <span>{t('more.theme')}</span>
            <span className="ml-auto font-mono text-[10px] text-text-mute">
              {theme === 'dark' ? '☾' : '☀'}
            </span>
          </MenuItem>
        </div>
      )}
    </>
  );
}

function MenuItem({
  onClick,
  className,
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      className={cn(
        'flex w-full items-center gap-2 rounded px-2 py-1.5 text-left hover:bg-surface-2',
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  );
}
