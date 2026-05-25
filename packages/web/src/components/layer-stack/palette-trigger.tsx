import type { Translator } from '../../i18n';

interface Props {
  onOpen: () => void;
  t: Translator;
}

export function PaletteTrigger({ onOpen, t }: Props) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex w-[220px] items-center gap-2 rounded-md border border-border bg-surface-2 px-2 py-1 text-[11px] text-text-mute hover:bg-surface-3"
      title={t('palette.title')}
    >
      <span>🔍</span>
      <span className="flex-1 truncate text-left">{t('palette.title')}</span>
      <span className="rounded border border-border px-1.5 py-0.5 font-mono text-[10px] text-text-dim">
        ⌘K
      </span>
    </button>
  );
}
