import { Button } from '../ui/button';
import type { Translator } from '../../i18n';

/** Mobile-only switch between preview and layer-management panes. */
export type MobileView = 'preview' | 'layers';

interface Props {
  value: MobileView;
  onChange: (value: MobileView) => void;
  t: Translator;
}

/** Bottom navigation used when the main two-pane layout collapses on phones. */
export function MobileBottomNav({ value, onChange, t }: Props) {
  return (
    <nav
      className="flex shrink-0 items-center gap-1 border-t border-border bg-surface p-2 md:hidden"
      aria-label="Mobile view"
    >
      <Button
        type="button"
        size="sm"
        variant={value === 'preview' ? 'primary' : 'ghost'}
        className="min-w-0 flex-1"
        aria-pressed={value === 'preview'}
        onClick={() => onChange('preview')}
      >
        {t('mobile.preview')}
      </Button>
      <Button
        type="button"
        size="sm"
        variant={value === 'layers' ? 'primary' : 'ghost'}
        className="min-w-0 flex-1"
        aria-pressed={value === 'layers'}
        onClick={() => onChange('layers')}
      >
        {t('mobile.layers')}
      </Button>
    </nav>
  );
}
