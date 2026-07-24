import type { AssetPackWorkbenchPanel } from '../../slice/asset-pack-workbench';

export const ASSET_PACK_PANEL_LABELS: Readonly<Record<AssetPackWorkbenchPanel, string>> = {
  overview: 'Overview',
  manifest: 'Manifest',
  sources: 'Sources',
  warnings: 'Warnings',
  credits: 'Credits',
};

const panels: readonly AssetPackWorkbenchPanel[] = [
  'overview',
  'manifest',
  'sources',
  'warnings',
  'credits',
];

export function WorkbenchNav({
  activePanel,
  onNavigate,
}: {
  readonly activePanel: AssetPackWorkbenchPanel;
  readonly onNavigate: (panel: AssetPackWorkbenchPanel) => void;
}) {
  return (
    <nav aria-label="Asset pack sections" className="border-b border-border bg-surface px-4 py-3 lg:border-b-0 lg:border-r">
      <div className="hidden gap-1 lg:grid">
        <p className="px-2 pb-2 text-xs font-semibold uppercase tracking-[0.16em] text-text-mute">Workbench</p>
        {panels.map((panel) => (
          <button
            key={panel}
            id={`asset-pack-panel-${panel}`}
            type="button"
            className={`rounded-md px-3 py-2 text-left text-sm ${activePanel === panel ? 'bg-surface-2 font-semibold text-text' : 'text-text-2 hover:bg-surface-2'}`}
            aria-current={activePanel === panel ? 'page' : undefined}
            onClick={() => onNavigate(panel)}
          >
            {ASSET_PACK_PANEL_LABELS[panel]}
          </button>
        ))}
      </div>
      <div role="tablist" aria-label="Asset pack panels" className="flex gap-1 overflow-x-auto lg:hidden">
        {panels.map((panel) => (
          <button
            key={panel}
            id={`asset-pack-tab-${panel}`}
            type="button"
            role="tab"
            aria-selected={activePanel === panel}
            className={`shrink-0 rounded-md px-3 py-2 text-sm ${activePanel === panel ? 'bg-surface-2 font-semibold text-text' : 'text-text-2'}`}
            onClick={() => onNavigate(panel)}
          >
            {ASSET_PACK_PANEL_LABELS[panel]}
          </button>
        ))}
      </div>
    </nav>
  );
}
