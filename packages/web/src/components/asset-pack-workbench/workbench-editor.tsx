import type { AssetPackWorkbenchState } from '../../slice/asset-pack-workbench';
import { ASSET_PACK_PANEL_LABELS } from './workbench-nav';

export function WorkbenchEditor({ state }: { readonly state: AssetPackWorkbenchState }) {
  const sourceCount = state.workbench?.sourceSummaries.length ?? 0;
  const warningCount = state.workbench?.diagnostics.filter(({ severity }) => severity === 'warning').length ?? 0;
  const errorCount = state.workbench?.diagnostics.filter(({ severity }) => severity === 'error').length ?? 0;

  return (
    <aside aria-label="Asset pack editor" className="border-t border-border bg-surface p-5 lg:border-l lg:border-t-0">
      <h2 className="text-xl font-semibold text-text">Asset pack editor</h2>
      <p className="mt-2 text-sm text-text-2">
        {ASSET_PACK_PANEL_LABELS[state.activePanel]} is selected. Detailed editing panels will appear here as the Worker verifies the pack.
      </p>
      <dl className="mt-5 grid grid-cols-3 gap-3 text-center text-sm">
        <div className="rounded-md border border-border bg-surface-2 p-3">
          <dt className="text-text-mute">Sources</dt>
          <dd className="mt-1 font-semibold text-text">{sourceCount}</dd>
        </div>
        <div className="rounded-md border border-border bg-surface-2 p-3">
          <dt className="text-text-mute">Warnings</dt>
          <dd className="mt-1 font-semibold text-text">{warningCount}</dd>
        </div>
        <div className="rounded-md border border-border bg-surface-2 p-3">
          <dt className="text-text-mute">Errors</dt>
          <dd className="mt-1 font-semibold text-text">{errorCount}</dd>
        </div>
      </dl>
    </aside>
  );
}
