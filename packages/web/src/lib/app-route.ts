export type AppRoute = 'entry' | 'compose' | 'cli' | 'agents' | 'asset-packs' | 'not-found';

export type NavigableAppRoute = Exclude<AppRoute, 'not-found'>;

export type AppPath = '/' | '/compose' | '/cli' | '/agents' | '/asset-packs';

export function routeFromPathname(pathname: string): AppRoute {
  if (pathname === '/') return 'entry';
  if (pathname === '/compose') return 'compose';
  if (pathname === '/cli') return 'cli';
  if (pathname === '/agents') return 'agents';
  if (pathname === '/asset-packs') return 'asset-packs';
  return 'not-found';
}

export function pathForRoute(route: NavigableAppRoute): AppPath {
  if (route === 'compose') return '/compose';
  if (route === 'cli') return '/cli';
  if (route === 'agents') return '/agents';
  if (route === 'asset-packs') return '/asset-packs';
  return '/';
}
