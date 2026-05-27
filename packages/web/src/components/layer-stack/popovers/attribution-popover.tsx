import { useMemo, type RefObject } from 'react';
import {
  computeEffectiveLicense,
  type Catalog,
  type ItemDefinition,
  type License,
} from '@lpc-toolkit/core';
import { Button } from '../../ui/button';
import { usePopover } from './use-popover';
import {
  itemMatchesLicenseFilter,
  type LicenseFilter,
} from '../../../slice/license-filter';
import {
  itemMatchesAnimationFilter,
  type AnimationFilter,
} from '../../../slice/animation-filter';
import type { SliceState } from '../../../slice/selection';
import type { LabelTranslator, Translator } from '../../../i18n';
import { summarizeAttribution } from './attribution-summary';

interface Props {
  open: boolean;
  setOpen: (v: boolean) => void;
  catalog: Catalog;
  state: SliceState;
  licenseFilter: LicenseFilter;
  animationFilter: AnimationFilter;
  t: Translator;
  tl: LabelTranslator;
  /** When provided, the popover renders panel-only (no built-in trigger). */
  anchorRef?: RefObject<HTMLButtonElement>;
}

interface Row {
  typeName: string;
  item: ItemDefinition;
  effective: License;
  authors: string[];
  licenseIncompatible: boolean;
  animationIncompatible: boolean;
}

export function AttributionPopover({
  open,
  setOpen,
  catalog,
  state,
  licenseFilter,
  animationFilter,
  t,
  tl,
  anchorRef: externalAnchorRef,
}: Props) {
  const { anchorRef, panelRef, pos } = usePopover(open, () => setOpen(false), externalAnchorRef);

  const rows = useMemo<Row[]>(() => {
    const out: Row[] = [];
    for (const [tn, sel] of Object.entries(state.selections)) {
      const item = (catalog.byTypeName.get(tn) ?? []).find((d) => d.name === sel.name);
      if (!item) continue;

      const allLicenses: License[] = [];
      const seenLicenses = new Set<License>();
      const allAuthors: string[] = [];
      const seenAuthors = new Set<string>();

      for (const credit of item.credits) {
        for (const license of credit.licenses) {
          if (!seenLicenses.has(license)) {
            seenLicenses.add(license);
            allLicenses.push(license);
          }
        }
        for (const author of credit.authors) {
          if (!seenAuthors.has(author)) {
            seenAuthors.add(author);
            allAuthors.push(author);
          }
        }
      }

      if (allLicenses.length === 0) continue;

      const manifest = { entries: item.credits, licenses: allLicenses, resolvedPaths: [] };
      const effective = computeEffectiveLicense(manifest);
      out.push({
        typeName: tn,
        item,
        effective,
        authors: allAuthors,
        licenseIncompatible: !itemMatchesLicenseFilter(item, licenseFilter),
        animationIncompatible: !itemMatchesAnimationFilter(item, animationFilter),
      });
    }
    return out;
  }, [catalog, state.selections, licenseFilter, animationFilter]);

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
          className="max-h-96 w-96 overflow-y-auto rounded-md border border-border bg-surface p-3 shadow-lg"
        >
          <div className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-text-mute">
            {t('attribution.title')}
          </div>
          {rows.length === 0 && (
            <div className="text-[11px] text-text-mute">No items selected.</div>
          )}
          <ul className="flex flex-col gap-1 text-[11px]">
            {rows.map((r) => (
              <li
                key={r.typeName}
                className={`rounded border border-border bg-surface-2 px-2 py-1 ${
                  r.licenseIncompatible || r.animationIncompatible ? 'border-danger text-danger' : ''
                }`}
              >
                <div className="font-semibold">{tl.category(r.typeName)}</div>
                <div className="font-mono text-[10px] text-text-mute">
                  {r.item.name} · {r.authors.join(', ') || '?'} · {r.effective}
                </div>
                {r.licenseIncompatible && (
                  <div className="text-[10px]">{t('attribution.licenseIncompatibleShort')}</div>
                )}
                {r.animationIncompatible && (
                  <div className="text-[10px]">{t('attribution.animationIncompatibleShort')}</div>
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
