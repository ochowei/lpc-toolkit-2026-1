import { useState } from 'react';
import { LICENSE_CONFIG, type License } from '@lpc-toolkit/core';
import { Button } from '../ui/button';
import type { LicenseFilter } from '../../slice/license-filter';
import type { AssetSource } from '../../adapter/asset-source';
import type { Translator } from '../../i18n';

const LICENSE_OPTIONS: readonly License[] = LICENSE_CONFIG.flatMap((g) => g.versions);

interface Props {
  t: Translator;
  licenseFilter: LicenseFilter;
  setLicenseFilter: (v: LicenseFilter) => void;
  assetSource: AssetSource;
  setAssetSource: (v: AssetSource) => void;
}

export function SettingsCollapsible({ t, licenseFilter, setLicenseFilter, assetSource, setAssetSource }: Props) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border-t border-border bg-app">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-2 px-3 py-2 text-[10px] font-semibold uppercase tracking-wide text-text-mute hover:bg-surface-2"
      >
        <span>{t('filters.title')}</span>
        {licenseFilter && (
          <span className="rounded-full border border-accent/40 bg-accent/15 px-2 py-0.5 text-[9px] font-normal normal-case text-accent">
            ≤ {licenseFilter}
          </span>
        )}
        <span className="ml-auto">{open ? '▾' : '▸'}</span>
      </button>
      {open && (
        <div className="space-y-2 px-3 pb-3">
          <div>
            <div className="mb-1 text-[10px] uppercase tracking-wide text-text-mute">{t('picker.licenseFilter')}</div>
            <select
              value={licenseFilter ?? ''}
              onChange={(e) => setLicenseFilter((e.target.value as License) || null)}
              className="w-full rounded border border-border bg-surface-2 px-2 py-1 text-[11px]"
            >
              <option value="">{t('picker.allLicenses')}</option>
              {LICENSE_OPTIONS.map((l) => (
                <option key={l} value={l}>{l}</option>
              ))}
            </select>
          </div>
          <div>
            <div className="mb-1 text-[10px] uppercase tracking-wide text-text-mute">{t('assetSource.title')}</div>
            <div className="flex gap-1">
              {(['auto', 'local', 'upstream'] as const).map((src) => (
                <Button
                  key={src}
                  size="sm"
                  variant={assetSource === src ? 'primary' : 'ghost'}
                  className="flex-1"
                  onClick={() => setAssetSource(src)}
                >
                  {t(`assetSource.${src}` as const)}
                </Button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
