import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import App, { createAppNavigationOwner } from '../src/App';

const mocks = vi.hoisted(() => ({
  loadCatalogFromUpstream: vi.fn(),
  loadPalettesFromUpstream: vi.fn(),
  loadBrowserAssetPackBaseline: vi.fn(),
  pickInitialSelections: vi.fn(),
  sliceReducer: vi.fn(),
  bootstrapStateFromHash: vi.fn(),
  readWindowHash: vi.fn(),
}));

vi.mock('../src/catalog/load-catalog', () => ({
  loadCatalogFromUpstream: mocks.loadCatalogFromUpstream,
}));

vi.mock('../src/catalog/load-palettes', () => ({
  loadPalettesFromUpstream: mocks.loadPalettesFromUpstream,
}));

vi.mock('../src/lib/asset-pack-baseline', () => ({
  loadBrowserAssetPackBaseline: mocks.loadBrowserAssetPackBaseline,
}));

vi.mock('../src/slice/selection', () => ({
  pickInitialSelections: mocks.pickInitialSelections,
  sliceReducer: mocks.sliceReducer,
}));

vi.mock('../src/lib/url-hash-sync', () => ({
  bootstrapStateFromHash: mocks.bootstrapStateFromHash,
  readWindowHash: mocks.readWindowHash,
}));

vi.mock('../src/components/layer-stack/harness', () => ({
  LayerStackHarness: () => <div>Composer Harness</div>,
}));

vi.mock('../src/components/asset-pack-workbench/harness', () => ({
  AssetPackWorkbenchHarness: () => <div>Asset Pack Workbench Harness</div>,
}));

interface MockWindow {
  location: {
    pathname: string;
    search: string;
    hash: string;
  };
  history: {
    state: unknown;
    pushState: ReturnType<typeof vi.fn>;
    replaceState: ReturnType<typeof vi.fn>;
    go: ReturnType<typeof vi.fn>;
  };
  addEventListener: ReturnType<typeof vi.fn>;
  removeEventListener: ReturnType<typeof vi.fn>;
}

function setLocation(pathname: string, search = '', hash = ''): MockWindow {
  const mockWindow: MockWindow = {
    location: { pathname, search, hash },
    history: {
      state: undefined,
      pushState: vi.fn((_state: unknown, _title: string, path: string) => {
        mockWindow.location.pathname = path;
      }),
      replaceState: vi.fn((state: unknown, _title: string, path?: string) => {
        mockWindow.history.state = state;
        if (path !== undefined) {
          const url = new URL(path, 'http://localhost');
          mockWindow.location.pathname = url.pathname;
          mockWindow.location.search = url.search;
          mockWindow.location.hash = url.hash;
        }
      }),
      go: vi.fn(),
    },
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  };

  vi.stubGlobal('window', mockWindow);
  vi.stubGlobal('document', { documentElement: { className: '' } });
  return mockWindow;
}

describe('App shell routing', () => {
  beforeEach(() => {
    vi.restoreAllMocks();

    const defaultState = {
      bodyType: 'male',
      selections: {},
      anim: 'walk',
      dir: 'down',
      playing: true,
      zoom: 4,
      layout: 'single',
    };
    const catalog = { types: new Map(), items: new Map() };
    const palettes = {};

    mocks.loadCatalogFromUpstream.mockReturnValue(catalog);
    mocks.loadPalettesFromUpstream.mockReturnValue(palettes);
    mocks.loadBrowserAssetPackBaseline.mockResolvedValue({
      catalog,
      palettes,
      definitionDigest: 'sha256:baseline',
      creditDigest: 'sha256:credits',
      definitionDigests: new Map(),
      creditDigests: new Map(),
      releaseTag: 'test',
      cliVersion: '0.0.0',
    });
    mocks.pickInitialSelections.mockReturnValue({
      state: defaultState,
      shownTypeNames: [],
    });
    mocks.bootstrapStateFromHash.mockReturnValue({
      state: defaultState,
      warnings: [],
    });
    mocks.readWindowHash.mockReturnValue('');
    mocks.sliceReducer.mockImplementation((state) => state);
  });

  it('renders the landing page without initializing composer data on /', () => {
    setLocation('/');

    const html = renderToStaticMarkup(<App />);

    expect(html).toContain('LPC Toolkit');
    expect(html).toContain('Create attributed LPC characters');
    expect(html).not.toContain('Composer Harness');
    expect(mocks.loadCatalogFromUpstream).not.toHaveBeenCalled();
    expect(mocks.loadPalettesFromUpstream).not.toHaveBeenCalled();
    expect(mocks.loadBrowserAssetPackBaseline).not.toHaveBeenCalled();
  });

  it('renders the composer and initializes composer data on /compose', () => {
    setLocation('/compose');

    const html = renderToStaticMarkup(<App />);

    expect(html).toContain('Composer Harness');
    expect(mocks.loadCatalogFromUpstream).toHaveBeenCalledTimes(1);
    expect(mocks.loadPalettesFromUpstream).toHaveBeenCalledTimes(1);
    expect(mocks.bootstrapStateFromHash).toHaveBeenCalledTimes(1);
    expect(mocks.loadBrowserAssetPackBaseline).not.toHaveBeenCalled();
  });

  it('preserves the initial composer query and hash when tagging history state', () => {
    const mockWindow = setLocation(
      '/compose',
      '?assetSource=zip&e2eProbe=1',
      '#sex=male&body=Body_Color_light',
    );

    renderToStaticMarkup(<App />);

    expect(mockWindow.location).toEqual({
      pathname: '/compose',
      search: '?assetSource=zip&e2eProbe=1',
      hash: '#sex=male&body=Body_Color_light',
    });
  });

  it('renders the asset-pack workbench and initializes only its baseline on /asset-packs', () => {
    setLocation('/asset-packs');

    const html = renderToStaticMarkup(<App />);

    expect(html).toContain('Asset Pack Workbench');
    expect(mocks.loadBrowserAssetPackBaseline).toHaveBeenCalledTimes(1);
    expect(mocks.loadCatalogFromUpstream).not.toHaveBeenCalled();
    expect(mocks.loadPalettesFromUpstream).not.toHaveBeenCalled();
    expect(mocks.bootstrapStateFromHash).not.toHaveBeenCalled();
  });

  it('renders a 404 page without initializing composer data on unknown paths', () => {
    setLocation('/missing');

    const html = renderToStaticMarkup(<App />);

    expect(html).toContain('Page not found');
    expect(html).not.toContain('Composer Harness');
    expect(mocks.loadCatalogFromUpstream).not.toHaveBeenCalled();
    expect(mocks.loadPalettesFromUpstream).not.toHaveBeenCalled();
    expect(mocks.loadBrowserAssetPackBaseline).not.toHaveBeenCalled();
  });

  it('uses one injected blocker for programmatic and browser-back navigation without growing history', () => {
    const confirm: (message: string) => boolean = vi.fn(() => false);
    const updates: string[] = [];
    const pushed: string[] = [];
    const restored: number[] = [];
    const owner = createAppNavigationOwner({
      initialPathname: '/asset-packs',
      pushState: (path) => pushed.push(path),
      setPathname: (path) => updates.push(path),
      blocker: () => confirm('Leave the asset pack workbench?'),
      initialHistoryIndex: 8,
      restorePopState: (delta) => restored.push(delta),
    });

    expect(owner.navigate('/')).toBe(false);
    expect(owner.handlePopState('/compose', 7)).toBe(false);
    expect(pushed).toEqual([]);
    expect(restored).toEqual([1]);
    expect(updates).toEqual(['/asset-packs']);
    expect(confirm).toHaveBeenCalledTimes(2);
  });

  it('keeps pathname and workbench route state unchanged when navigation is canceled', () => {
    const owner = createAppNavigationOwner({
      initialPathname: '/asset-packs',
      pushState: vi.fn(),
      setPathname: vi.fn(),
      blocker: () => false,
    });

    expect(owner.pathname).toBe('/asset-packs');
    expect(owner.navigate('/')).toBe(false);
    expect(owner.pathname).toBe('/asset-packs');
    expect(owner.handlePopState('/')).toBe(false);
    expect(owner.pathname).toBe('/asset-packs');
  });

});
