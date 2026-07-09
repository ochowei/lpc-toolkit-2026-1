export type AppRoute = 'landing' | 'compose' | 'not-found';

export type NavigableAppRoute = Exclude<AppRoute, 'not-found'>;

export type AppPath = '/' | '/compose';

export function routeFromPathname(pathname: string): AppRoute {
  if (pathname === '/') return 'landing';
  if (pathname === '/compose') return 'compose';
  return 'not-found';
}

export function pathForRoute(route: NavigableAppRoute): AppPath {
  return route === 'compose' ? '/compose' : '/';
}
