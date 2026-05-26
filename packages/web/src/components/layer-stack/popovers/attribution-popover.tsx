import { useMemo } from 'react';
import {
  computeEffectiveLicense,
  type Catalog,
  type ItemDefinition,
  type License,
} from '@lpc-toolkit/core';
import { Button } from '../../ui/button';
import { usePopover } from './use-popover';
import { licenseExceedsFilter, type LicenseFilter } from '../../../slice/license-filter';
import type { SliceState } from '../../../slice/selection';
import type { LabelTranslator, Translator } from '../../../i18n';

interface Props {
  open: boolean;
  setOpen: (v: boolean) => void;
  catalog: Catalog;
  state: SliceState;
  licenseFilter: LicenseFilter;
  t: Translator;
  tl: LabelTranslator;
}

interface Row {
  typeName: string;
  item: ItemDefinition;
  effective: License;
  authors: string[];
  exceeds: boolean;
}

export function AttributionPopover({ open, setOpen, catalog, state, licenseFilter, t, tl }: Props) {
  const { anchorRef, panelRef, pos } = usePopover(open, () => setOpen(false));

  const rows = useMemo<Row[]>(() => {
    const out: Row[] = [];
    for (const [tn, sel] of Object.entries(state.selections)) {
      const item = (catalog.byTypeName.get(tn) ?? []).find((d) => d.name === sel.name);
      if (!item) continue;

      // Build a CreditsManifest from the item's credit entries
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

      // Skip items with no license info
      if (allLicenses.length === 0) continue;

      const manifest = { entries: item.credits, licenses: allLicenses };
      const effective = computeEffectiveLicense(manifest);
      out.push({ typeName: tn, item, effective, authors: allAuthors, exceeds: licenseExceedsFilter(effective, licenseFilter) });
    }
    return out;
  }, [catalog, state.selections, licenseFilter]);

  const exceedsAny = rows.some((r) => r.exceeds);
  const sourceCount = new Set(rows.map((r) => `${r.authors.join(',')}|${r.effective}`)).size;

  return (
    <>
      <Button
        ref={anchorRef}
        size="sm"
        variant={exceedsAny ? 'primary' : 'default'}
        className={exceedsAny ? 'border-danger text-danger' : ''}
        onClick={() => setOpen(!open)}
      >
        {exceedsAny ? '⚠ ' : '© '}{t('attribution.title')} · {sourceCount}
      </Button>
      {open && pos && (
        <div
          ref={panelRef}
          style={{ position: 'fixed', top: pos.top, left: pos.left, zIndex: 50 }}
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
                className={`rounded border border-border bg-surface-2 px-2 py-1 ${r.exceeds ? 'border-danger text-danger' : ''}`}
              >
                <div className="font-semibold">{tl.category(r.typeName)}</div>
                <div className="font-mono text-[10px] text-text-mute">
                  {r.item.name} · {r.authors.join(', ') || '?'} · {r.effective}
                </div>
                {r.exceeds && <div className="text-[10px]">{t('attribution.exceededShort')}</div>}
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
