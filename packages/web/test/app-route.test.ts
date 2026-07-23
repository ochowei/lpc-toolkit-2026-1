import { describe, expect, it } from 'vitest';
import { pathForRoute, routeFromPathname } from '../src/lib/app-route';

describe('app route helpers', () => {
  it('classifies the landing route', () => {
    expect(routeFromPathname('/')).toBe('landing');
  });

  it('classifies the composer route', () => {
    expect(routeFromPathname('/compose')).toBe('compose');
  });

  it('classifies the asset-pack workbench route', () => {
    expect(routeFromPathname('/asset-packs')).toBe('asset-packs');
  });

  it('classifies unknown paths as not-found', () => {
    expect(routeFromPathname('/missing')).toBe('not-found');
    expect(routeFromPathname('/compose/extra')).toBe('not-found');
  });

  it('returns concrete paths for navigable routes', () => {
    expect(pathForRoute('landing')).toBe('/');
    expect(pathForRoute('compose')).toBe('/compose');
    expect(pathForRoute('asset-packs')).toBe('/asset-packs');
  });
});
