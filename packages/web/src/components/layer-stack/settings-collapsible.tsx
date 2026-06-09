import { useState } from 'react';
import {
  ANIMATIONS,
  LICENSE_CONFIG,
  LICENSE_GROUP_ORDER,
  type AnimationName,
  type LicenseGroup,
} from '@lpc-toolkit/core';
import { Button } from '../ui/button';
import type { LicenseFilter } from '../../slice/license-filter';
import type { AnimationFilter } from '../../slice/animation-filter';
import type { Translator } from '../../i18n';
import type { CustomOverlay } from '../../lib/custom-overlay';

interface Props {
  disabled: boolean;
  t: Translator;
  licenseFilter: LicenseFilter;
  toggleLicenseGroup: (group: LicenseGroup) => void;
  licenseIncompatibleCount: number;
  removeLicenseIncompatibleSelections: () => void;
  animationFilter: AnimationFilter;
  toggleAnimation: (anim: AnimationName) => void;
  animationIncompatibleCount: number;
  removeAnimationIncompatibleSelections: () => void;
  customOverlay: CustomOverlay | null;
  customOverlayZPos: number;
  onCustomOverlayUpload: (file: File) => void;
  onCustomOverlayZPosChange: (raw: string) => void;
  onClearCustomOverlay: () => void;
}

const TOTAL_GROUPS = LICENSE_GROUP_ORDER.length;
const VISIBLE_ANIMATIONS = ANIMATIONS.filter((a) => !a.noExport);

/** Collapsible controls for license filters, animation filters, asset source, and uploads. */
export function SettingsCollapsible({
  disabled,
  t,
  licenseFilter,
  toggleLicenseGroup,
  licenseIncompatibleCount,
  removeLicenseIncompatibleSelections,
  animationFilter,
  toggleAnimation,
  animationIncompatibleCount,
  removeAnimationIncompatibleSelections,
  customOverlay,
  customOverlayZPos,
  onCustomOverlayUpload,
  onCustomOverlayZPosChange,
  onClearCustomOverlay,
}: Props) {
  const [open, setOpen] = useState(false);
  const enabledLicenseCount = licenseFilter.size;
  const showLicenseChip = enabledLicenseCount < TOTAL_GROUPS;
  const enabledAnimCount = animationFilter.size;
  const showAnimChip = enabledAnimCount > 0;

  return (
    <div className="border-t border-border bg-app">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-2 px-3 py-2 text-[10px] font-semibold uppercase tracking-wide text-text-mute hover:bg-surface-2"
      >
        <span>{t('filters.title')}</span>
        {showLicenseChip && (
          <span className="rounded-full border border-accent/40 bg-accent/15 px-2 py-0.5 text-[9px] font-normal normal-case text-accent">
            License {enabledLicenseCount}/{TOTAL_GROUPS}
          </span>
        )}
        {showAnimChip && (
          <span className="rounded-full border border-accent/40 bg-accent/15 px-2 py-0.5 text-[9px] font-normal normal-case text-accent">
            Anim {enabledAnimCount}/{VISIBLE_ANIMATIONS.length}
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
                {t('licenseFilter.enabledCount').replace('{n}', String(enabledLicenseCount))}
              </span>
            </div>
            <ul className="flex flex-col gap-1">
              {LICENSE_GROUP_ORDER.map((groupKey) => {
                const group = LICENSE_CONFIG.find((g) => g.key === groupKey);
                if (!group) return null;
                const checked = licenseFilter.has(groupKey);
                const linkLabel = group.urlLabel
                  ? `${t('licenseFilter.showLicense')} ${group.urlLabel}`
                  : t('licenseFilter.showLicense');
                return (
                  <li key={groupKey} className="flex items-center gap-2">
                    <label className="flex flex-1 items-center gap-2 text-[11px] text-text cursor-pointer">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleLicenseGroup(groupKey)}
                        className="h-3 w-3 accent-accent"
                      />
                      <span className="font-mono">{group.label}</span>
                    </label>
                    <a
                      href={group.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label={linkLabel}
                      className="text-[10px] text-text-mute underline decoration-border underline-offset-2 hover:text-text"
                    >
                      ({linkLabel})
                    </a>
                  </li>
                );
              })}
            </ul>

            {licenseIncompatibleCount > 0 && (
              <div className="mt-2 rounded-md border border-amber-500/40 bg-amber-500/10 p-2">
                <p className="mb-2 text-[11px] text-amber-500">
                  ⚠️{' '}
                  {t('licenseFilter.incompatibleNotice').replace('{n}', String(licenseIncompatibleCount))}
                </p>
                <Button
                  size="sm"
                  variant="primary"
                  onClick={removeLicenseIncompatibleSelections}
                  disabled={disabled}
                  className="w-full"
                >
                  {t('licenseFilter.removeIncompatible').replace('{n}', String(licenseIncompatibleCount))}
                </Button>
              </div>
            )}
          </div>

          <div>
            <div className="mb-1 flex items-center gap-2 text-[10px] uppercase tracking-wide text-text-mute">
              <span>{t('animationFilter.title')}</span>
              <span className="font-normal normal-case text-text-dim">
                {t('animationFilter.enabledCount').replace('{n}', String(enabledAnimCount))}
              </span>
            </div>
            <ul className="flex flex-col gap-1">
              {VISIBLE_ANIMATIONS.map((anim) => {
                const checked = animationFilter.has(anim.value);
                return (
                  <li key={anim.value} className="flex items-center gap-2">
                    <label className="flex flex-1 items-center gap-2 text-[11px] text-text cursor-pointer">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleAnimation(anim.value)}
                        className="h-3 w-3 accent-accent"
                      />
                      <span className="font-mono">{anim.label}</span>
                    </label>
                  </li>
                );
              })}
            </ul>

            {animationIncompatibleCount > 0 && (
              <div className="mt-2 rounded-md border border-amber-500/40 bg-amber-500/10 p-2">
                <p className="mb-2 text-[11px] text-amber-500">
                  ⚠️{' '}
                  {t('animationFilter.incompatibleNotice').replace('{n}', String(animationIncompatibleCount))}
                </p>
                <Button
                  size="sm"
                  variant="primary"
                  onClick={removeAnimationIncompatibleSelections}
                  disabled={disabled}
                  className="w-full"
                >
                  {t('animationFilter.removeIncompatible').replace('{n}', String(animationIncompatibleCount))}
                </Button>
              </div>
            )}
          </div>

          <div>
            <div className="mb-1 text-[10px] uppercase tracking-wide text-text-mute">
              {t('advancedTools.title')}
            </div>
            <div className="space-y-2">
              <label className="block text-[11px] text-text">
                <span className="mb-1 block text-text-mute">
                  {t('advancedTools.customUpload')}
                </span>
                <input
                  type="file"
                  accept="image/*"
                  disabled={disabled}
                  onChange={(e) => {
                    const file = e.currentTarget.files?.[0];
                    if (file) onCustomOverlayUpload(file);
                    e.currentTarget.value = '';
                  }}
                  className="block w-full text-[11px] text-text file:mr-2 file:rounded file:border-0 file:bg-surface-2 file:px-2 file:py-1 file:text-[11px] file:text-text disabled:cursor-not-allowed disabled:opacity-50"
                />
              </label>
              {customOverlay && (
                <div className="rounded border border-border bg-surface-2 px-2 py-1 text-[11px] text-text">
                  {customOverlay.fileName} · {customOverlay.width}x{customOverlay.height}
                </div>
              )}
              <label className="block text-[11px] text-text">
                <span className="mb-1 block text-text-mute">
                  {t('advancedTools.zPosition')}
                </span>
                <input
                  type="number"
                  value={customOverlayZPos}
                  disabled={disabled}
                  onChange={(e) => onCustomOverlayZPosChange(e.currentTarget.value)}
                  className="w-full rounded border border-border bg-app px-2 py-1 text-[11px] text-text disabled:cursor-not-allowed disabled:opacity-50"
                />
              </label>
              <p className="text-[10px] text-text-mute">{t('advancedTools.acceptedSize')}</p>
              <p className="text-[10px] text-text-mute">{t('advancedTools.layerHints')}</p>
              <p className="text-[10px] text-text-mute">{t('advancedTools.userProvidedNotice')}</p>
              {customOverlay && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={onClearCustomOverlay}
                  disabled={disabled}
                  className="w-full"
                >
                  {t('advancedTools.clear')}
                </Button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
