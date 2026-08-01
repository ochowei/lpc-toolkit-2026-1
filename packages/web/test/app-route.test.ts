import { describe, expect, it } from 'vitest';
import { pathForRoute, routeFromPathname } from '../src/lib/app-route';

describe('app route helpers', () => {
  it('keeps the root as a redirect-only entry route', () => {
    expect(routeFromPathname('/')).toBe('entry');
  });

  it('classifies the composer route', () => {
    expect(routeFromPathname('/compose')).toBe('compose');
  });

  it('classifies the asset-pack workbench route', () => {
    expect(routeFromPathname('/asset-packs')).toBe('asset-packs');
  });

  it('classifies the CLI and agent integration pages', () => {
    expect(routeFromPathname('/cli')).toBe('cli');
    expect(routeFromPathname('/agents')).toBe('agents');
  });

  it('classifies unknown paths as not-found', () => {
    expect(routeFromPathname('/missing')).toBe('not-found');
    expect(routeFromPathname('/compose/extra')).toBe('not-found');
  });

  it('returns concrete paths for navigable routes', () => {
    expect(pathForRoute('entry')).toBe('/');
    expect(pathForRoute('compose')).toBe('/compose');
    expect(pathForRoute('cli')).toBe('/cli');
    expect(pathForRoute('agents')).toBe('/agents');
    expect(pathForRoute('asset-packs')).toBe('/asset-packs');
  });
});
