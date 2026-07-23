export type AppRoute = 'landing' | 'compose' | 'asset-packs' | 'not-found';

export type NavigableAppRoute = Exclude<AppRoute, 'not-found'>;

export type AppPath = '/' | '/compose' | '/asset-packs';

export function routeFromPathname(pathname: string): AppRoute {
  if (pathname === '/') return 'landing';
  if (pathname === '/compose') return 'compose';
  if (pathname === '/asset-packs') return 'asset-packs';
  return 'not-found';
}

export function pathForRoute(route: NavigableAppRoute): AppPath {
  if (route === 'compose') return '/compose';
  if (route === 'asset-packs') return '/asset-packs';
  return '/';
}
