import { useMemo, type RefObject } from 'react';
import {
  type Catalog,
  type CreditsManifest,
} from '@lpc-toolkit/core';
import { Button } from '../../ui/button';
import { usePopover } from './use-popover';
import type { LicenseFilter } from '../../../slice/license-filter';
import type { AnimationFilter } from '../../../slice/animation-filter';
import type { SliceState } from '../../../slice/selection';
import type { LabelTranslator, Translator } from '../../../i18n';
import { summarizeAttribution } from './attribution-summary';
import { attributionRows } from './attribution-manifest';

interface Props {
  open: boolean;
  setOpen: (v: boolean) => void;
  catalog: Catalog;
  credits: CreditsManifest | null;
  state: SliceState;
  licenseFilter: LicenseFilter;
  animationFilter: AnimationFilter;
  t: Translator;
  tl: LabelTranslator;
  /** When provided, the popover renders panel-only (no built-in trigger). */
  anchorRef?: RefObject<HTMLButtonElement>;
}

/** Attribution and license summary for currently selected layers. */
export function AttributionPopover({
  open,
  setOpen,
  catalog,
  credits,
  state,
  licenseFilter,
  animationFilter,
  t,
  tl,
  anchorRef: externalAnchorRef,
}: Props) {
  const { anchorRef, panelRef, pos } = usePopover(open, () => setOpen(false), externalAnchorRef);

  const model = useMemo(
    () => credits
      ? attributionRows(credits, catalog, state, licenseFilter, animationFilter)
      : null,
    [credits, catalog, state, licenseFilter, animationFilter],
  );

  return (
    <>
      {!externalAnchorRef && (() => {
        const summary = summarizeAttribution(catalog, state, licenseFilter, animationFilter);
        return (
          <Button
            ref={anchorRef}
            size="sm"
            variant={summary.incompatibleAny ? 'primary' : 'default'}
            className={summary.incompatibleAny ? 'border-danger text-danger' : ''}
            onClick={() => setOpen(!open)}
          >
            {summary.incompatibleAny ? '⚠ ' : '© '}
            {t('attribution.title')} · {summary.sourceCount}
          </Button>
        );
      })()}
      {open && pos && (
        <div
          ref={panelRef}
          style={
            externalAnchorRef
              ? { position: 'fixed', top: pos.top, right: 12, zIndex: 50 }
              : { position: 'fixed', top: pos.top, left: pos.left, zIndex: 50 }
          }
          className="max-h-[calc(100vh-5rem)] w-96 max-w-[calc(100vw-1rem)] overflow-y-auto rounded-md border border-border bg-surface p-3 shadow-lg"
        >
          <div className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-text-mute">
            {t('attribution.title')}
          </div>
          {model?.empty && (
            <div className="text-[11px] text-text-mute">
              {t('attribution.noResolvedCredits')}
            </div>
          )}
          {model && model.incompatibleTypeNames.length > 0 && (
            <div className="mb-2 rounded border border-danger px-2 py-1 text-[10px] text-danger">
              ⚠ {t('palette.incompatible')}: {' '}
              {model.incompatibleTypeNames.map((typeName) => tl.category(typeName)).join(', ')}
            </div>
          )}
          <ul className="flex flex-col gap-1 text-[11px]">
            {model?.rows.map((row) => (
              <li
                key={row.file}
                className="rounded border border-border bg-surface-2 px-2 py-1"
              >
                <div className="font-semibold">{row.file}</div>
                <div className="font-mono text-[10px] text-text-mute">
                  {row.authors.join(', ') || '?'} · {row.licenses.join(', ')} · {row.effective}
                </div>
                {row.resolvedPath && (
                  <div className="font-mono text-[10px] text-text-mute">{row.resolvedPath}</div>
                )}
              </li>
            ))}
          </ul>
          <p className="mt-3 border-t border-border pt-2 text-[10px] text-text-mute">
            <a
              className="underline decoration-border underline-offset-2 hover:text-text"
              href="https://liberatedpixelcup.github.io/Universal-LPC-Spritesheet-Character-Generator/"
              target="_blank"
              rel="noreferrer"
            >
              {t('source.project')}
            </a>
          </p>
        </div>
      )}
    </>
  );
}
