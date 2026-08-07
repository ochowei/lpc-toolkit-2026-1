import {
  pathForRoute,
  type NavigableAppRoute,
} from '../lib/app-route';

type ProductRoute = 'compose' | 'cli' | 'agents';

interface ProductNavigationProps {
  readonly activeRoute: ProductRoute;
  readonly onNavigate: (route: NavigableAppRoute) => void;
  readonly compact?: boolean;
}

const items = [
  { route: 'compose', label: 'Composer', shortLabel: 'Compose' },
  { route: 'cli', label: 'CLI', shortLabel: 'CLI' },
  { route: 'agents', label: 'Agent Integrations', shortLabel: 'Agents' },
] as const;

export function ProductNavigation({
  activeRoute,
  onNavigate,
  compact = false,
}: ProductNavigationProps) {
  return (
    <div className="flex min-w-0 items-center gap-3 border-b border-border bg-surface px-3 py-2">
      <a
        href={pathForRoute('entry')}
        className="shrink-0 text-sm font-bold tracking-tight text-text"
        onClick={(event) => {
          event.preventDefault();
          onNavigate('entry');
        }}
      >
        LPC<span className="hidden font-medium text-text-mute sm:inline">·Toolkit</span>
      </a>
      <nav aria-label="Product" className="min-w-0 flex-1 overflow-x-auto">
        <div className="flex w-max items-center gap-1">
          {items.map((item) => {
            const active = item.route === activeRoute;
            return (
              <a
                key={item.route}
                href={pathForRoute(item.route)}
                aria-current={active ? 'page' : undefined}
                onClick={(event) => {
                  event.preventDefault();
                  onNavigate(item.route);
                }}
                className={`${compact ? 'px-2 py-1 text-xs' : 'px-2 py-1.5 text-xs sm:px-3 sm:text-sm'} rounded-md font-medium transition-colors ${
                  active
                    ? 'bg-accent text-[var(--accent-ink)]'
                    : 'text-text-2 hover:bg-surface-2 hover:text-text'
                }`}
              >
                <span className="sm:hidden">{item.shortLabel}</span>
                <span className="hidden sm:inline">{item.label}</span>
              </a>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
