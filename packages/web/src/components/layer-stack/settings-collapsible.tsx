import { useState } from 'react';
import {
  LICENSE_CONFIG,
  LICENSE_GROUP_ORDER,
  type LicenseGroup,
} from '@lpc-toolkit/core';
import { Button } from '../ui/button';
import type { LicenseFilter } from '../../slice/license-filter';
import type { AssetSource } from '../../adapter/asset-source';
import type { Translator } from '../../i18n';

interface Props {
  t: Translator;
  licenseFilter: LicenseFilter;
  toggleLicenseGroup: (group: LicenseGroup) => void;
  incompatibleCount: number;
  removeIncompatibleSelections: () => void;
  assetSource: AssetSource;
  setAssetSource: (v: AssetSource) => void;
}

const TOTAL_GROUPS = LICENSE_GROUP_ORDER.length;

export function SettingsCollapsible({
  t,
  licenseFilter,
  toggleLicenseGroup,
  incompatibleCount,
  removeIncompatibleSelections,
  assetSource,
  setAssetSource,
}: Props) {
  const [open, setOpen] = useState(false);
  const enabledCount = licenseFilter.size;
  const showCountBadge = enabledCount < TOTAL_GROUPS;

  return (
    <div className="border-t border-border bg-app">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-2 px-3 py-2 text-[10px] font-semibold uppercase tracking-wide text-text-mute hover:bg-surface-2"
      >
        <span>{t('filters.title')}</span>
        {showCountBadge && (
          <span className="rounded-full border border-accent/40 bg-accent/15 px-2 py-0.5 text-[9px] font-normal normal-case text-accent">
            {enabledCount}/{TOTAL_GROUPS}
          </span>
        )}
        <span className="ml-auto">{open ? '▾' : '▸'}</span>
      </button>
      {open && (
        <div className="space-y-3 px-3 pb-3">
          <div>
            <div className="mb-1 flex items-center gap-2 text-[10px] uppercase tracking-wide text-text-mute">
              <span>{t('picker.licenseFilter')}</span>
              <span className="font-normal normal-case text-text-dim">
                {t('licenseFilter.enabledCount').replace('{n}', String(enabledCount))}
              </span>
            </div>
            <ul className="flex flex-col gap-1">
              {LICENSE_CONFIG.map((group) => {
                const checked = licenseFilter.has(group.key as LicenseGroup);
                const linkLabel = group.urlLabel
                  ? `${t('licenseFilter.showLicense')} ${group.urlLabel}`
                  : t('licenseFilter.showLicense');
                return (
                  <li key={group.key} className="flex items-center gap-2">
                    <label className="flex flex-1 items-center gap-2 text-[11px] text-text cursor-pointer">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleLicenseGroup(group.key as LicenseGroup)}
                        className="h-3 w-3 accent-accent"
                      />
                      <span className="font-mono">{group.label}</span>
                    </label>
                    <a
                      href={group.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[10px] text-text-mute underline decoration-border underline-offset-2 hover:text-text"
                    >
                      ({linkLabel})
                    </a>
                  </li>
                );
              })}
            </ul>

            {incompatibleCount > 0 && (
              <div className="mt-2 rounded-md border border-amber-500/40 bg-amber-500/10 p-2">
                <p className="mb-2 text-[11px] text-amber-500">
                  ⚠️{' '}
                  {t('licenseFilter.incompatibleNotice').replace('{n}', String(incompatibleCount))}
                </p>
                <Button
                  size="sm"
                  variant="primary"
                  onClick={removeIncompatibleSelections}
                  className="w-full"
                >
                  {t('licenseFilter.removeIncompatible').replace('{n}', String(incompatibleCount))}
                </Button>
              </div>
            )}
          </div>

          <div>
            <div className="mb-1 text-[10px] uppercase tracking-wide text-text-mute">
              {t('assetSource.title')}
            </div>
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
