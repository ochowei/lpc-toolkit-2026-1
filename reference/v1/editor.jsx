// The full Editor — top bar + 3-column layout. Manages all editor state.

const { useReducer: useReducerE, useState: useStateE } = React;
const DE = window.LPC_DATA;

const DEFAULT_STATE = {
  bodyType: 'male',
  // chosen item per category
  layers: {
    body: 'human',
    head: 'human_male',
    eyes: 'normal',
    eyebrows: 'thick',
    hair: 'ponytail',
    expression: 'neutral',
    torso: 'tunic',
    legs: 'pants',
    feet: 'boots',
    belt: 'leather',
    cape: 'short',
    weapon: 'sword',
    shield: 'kite',
  },
  variants: {
    hair: 'high',
    torso: 'laced',
    legs: 'plain',
    weapon: 'long',
  },
  palettes: {
    body: 'skin_tan',
    hair: 'hair_ginger',
    eyes: 'eyes_green',
    torso: 'cloth_green',
    legs: 'cloth_brown',
    feet: 'cloth_brown',
    cape: 'cloth_red',
    belt: 'cloth_brown',
    weapon: 'metal_steel',
    shield: 'metal_iron',
  },
  errors: {},
  anim: 'walk',
  dir: 'S',
  zoom: 4,
  fps: 8,
  playing: true,
};

function editorReducer(state, action) {
  switch (action.type) {
    case 'body_type':       return { ...state, bodyType: action.id };
    case 'pick':            return { ...state, layers: { ...state.layers, [action.cat]: action.id } };
    case 'clear_category':  { const { [action.cat]: _, ...rest } = state.layers; return { ...state, layers: rest }; }
    case 'variant':         return { ...state, variants: { ...state.variants, [action.cat]: action.variant } };
    case 'recolor':         return { ...state, palettes: { ...state.palettes, [action.cat]: action.ramp } };
    case 'anim':            return { ...state, anim: action.id };
    case 'dir':             return { ...state, dir: action.id };
    case 'toggle_play':     return { ...state, playing: !state.playing };
    case 'pause':           return { ...state, playing: false };
    case 'zoom':            return { ...state, zoom: Math.max(1, Math.min(8, state.zoom + action.delta)) };
    case 'zoom_to':         return { ...state, zoom: action.value };
    case 'fps':             return { ...state, fps: action.fps };
    case 'reset':           return DEFAULT_STATE;
    case 'randomize':       return randomState(state);
    case 'set_state':       return action.state;
    default: return state;
  }
}

function randomState(state) {
  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
  const layers = { body: pick(DE.ITEMS.body).id };
  ['head','hair','torso','legs','feet','expression','eyes','eyebrows','weapon','shield','cape','belt'].forEach(k => {
    if (Math.random() > 0.2) layers[k] = pick(DE.ITEMS[k]).id;
  });
  const palettes = {};
  ['body','hair','eyes','torso','legs','feet','cape','belt','weapon','shield'].forEach(k => {
    const group = ({ body: 'skin', hair: 'hair', eyes: 'eyes', torso: 'cloth', legs: 'cloth', feet: 'cloth', cape: 'cloth', belt: 'cloth', weapon: 'metal', shield: 'metal' })[k];
    palettes[k] = pick(DE.PALETTE_OPTIONS[group]);
  });
  return { ...state, layers, palettes };
}

// Lightweight top bar
function TopBar({ theme, setTheme, label, hash }) {
  return (
    <header style={{
      flex: '0 0 auto',
      display: 'flex', alignItems: 'center', gap: 12,
      padding: '10px 16px',
      borderBottom: '1px solid var(--border)',
      background: 'var(--surface)',
    }}>
      {/* Wordmark */}
      <div className="row" style={{ gap: 8 }}>
        <Logo />
        <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.05 }}>
          <span style={{ fontWeight: 700, letterSpacing: '-0.01em', fontSize: 14 }}>
            LPC<span style={{ color: 'var(--text-mute)', fontWeight: 500 }}>·Toolkit</span>
          </span>
          <span style={{ fontSize: 10, color: 'var(--text-dim)', fontFamily: 'var(--font-mono)' }}>
            v0.4 · client-side
          </span>
        </div>
      </div>

      {/* Project ribbon */}
      <div style={{
        marginLeft: 16, padding: '4px 10px',
        border: '1px solid var(--border)', borderRadius: 999,
        display: 'flex', alignItems: 'center', gap: 8,
        fontSize: 12, color: 'var(--text-2)',
        background: 'var(--surface-2)',
      }}>
        <span style={{ width: 6, height: 6, borderRadius: 999, background: 'var(--accent)' }} />
        <span style={{ fontWeight: 500, color: 'var(--text)' }}>{label || 'Untitled Hero'}</span>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-dim)' }}>
          {hash || '#a7e2c9'}
        </span>
      </div>

      <div style={{ flex: '1 1 auto' }} />

      <Button size="sm" variant="ghost" icon="layers">Layers</Button>
      <Button size="sm" variant="ghost" icon="code">URL state</Button>
      <Button
        size="sm" variant="ghost"
        icon={theme === 'dark' ? 'sun' : 'moon'}
        onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
        title="Toggle theme"
      >{theme === 'dark' ? 'Light' : 'Dark'}</Button>
      <Button size="sm" variant="default" icon="share">Share</Button>
    </header>
  );
}

function Logo() {
  // A tiny pixel-art mark — 16×16 squares forming an "L" + a play-cursor accent.
  return (
    <svg width={24} height={24} viewBox="0 0 16 16" shapeRendering="crispEdges">
      <rect x="1" y="1" width="14" height="14" rx="0" fill="var(--accent)" />
      <rect x="3" y="3" width="2" height="8" fill="var(--accent-ink)" />
      <rect x="3" y="9" width="6" height="2" fill="var(--accent-ink)" />
      <rect x="10" y="3" width="3" height="2" fill="var(--accent-ink)" />
      <rect x="11" y="5" width="2" height="2" fill="var(--accent-ink)" />
    </svg>
  );
}

// The full desktop editor in a self-contained box. Renders inside a DCArtboard.
function Editor({ theme = 'dark', initialState, label, hash, ariaLabel }) {
  const [state, dispatch] = useReducerE(editorReducer, initialState || DEFAULT_STATE);
  const [search, setSearch] = useStateE('');
  const [openCategories, setOpenCategories] = useStateE({
    body: true, hair: true, torso: true, weapon: true, legs: true,
    feet: true, shield: false, head: true, expression: true, cape: false,
    eyes: false, eyebrows: false, nose: false, ears: false, facial: false,
    neck: false, shoulders: false, arms: false, wrists: false, hands: false,
    belt: false, quiver: false, backpack: false,
  });
  const [themeS, setThemeS] = useStateE(theme);
  return (
    <div className={`lpc ${themeS}`} aria-label={ariaLabel} style={{ display: 'flex', flexDirection: 'column', width: '100%', height: '100%', overflow: 'hidden' }}>
      <TopBar theme={themeS} setTheme={setThemeS} label={label} hash={hash} />
      <div style={{
        flex: '1 1 0', minHeight: 0,
        display: 'grid',
        gridTemplateColumns: '320px 1fr 340px',
      }}>
        <LeftPanel
          state={state} dispatch={dispatch}
          searchValue={search} onSearch={setSearch}
          openCategories={openCategories} setOpenCategories={setOpenCategories}
        />
        <CenterPreview state={state} dispatch={dispatch} />
        <RightPanel state={state} dispatch={dispatch} />
      </div>
    </div>
  );
}

Object.assign(window, { Editor, TopBar, DEFAULT_STATE, editorReducer, randomState, Logo });
