// Mobile layouts — three regions collapse to bottom-tabs + sheet. Preview stays priority.

const { useState: useStateM, useReducer: useReducerM } = React;
const DM = window.LPC_DATA;

function MobileFrame({ children, w = 360, h = 760 }) {
  return (
    <div style={{
      width: w, height: h,
      background: 'var(--bg-app)',
      display: 'flex', flexDirection: 'column',
      overflow: 'hidden',
      position: 'relative',
      borderRadius: 28,
      boxShadow: 'inset 0 0 0 1px var(--border)',
    }}>
      {/* Status bar */}
      <div style={{
        flex: '0 0 auto',
        height: 36,
        padding: '10px 20px 0',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 600,
      }}>
        <span>9:41</span>
        <span style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
          <svg width="16" height="10" viewBox="0 0 16 10" fill="none"><rect x="1" y="3" width="2" height="4" rx="0.5" fill="currentColor"/><rect x="4" y="2" width="2" height="6" rx="0.5" fill="currentColor"/><rect x="7" y="1" width="2" height="8" rx="0.5" fill="currentColor"/><rect x="10" y="0" width="2" height="10" rx="0.5" fill="currentColor"/></svg>
          <svg width="20" height="10" viewBox="0 0 20 10" fill="none"><rect x="0.5" y="0.5" width="17" height="9" rx="2" stroke="currentColor"/><rect x="2" y="2" width="13" height="6" rx="1" fill="currentColor"/><rect x="18" y="3" width="1.5" height="4" rx="0.5" fill="currentColor"/></svg>
        </span>
      </div>
      {children}
    </div>
  );
}

function MobileTopBar({ theme, label, hash }) {
  return (
    <header style={{
      flex: '0 0 auto',
      display: 'flex', alignItems: 'center', gap: 8,
      padding: '6px 16px 8px',
      borderBottom: '1px solid var(--border)',
    }}>
      <Logo />
      <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minWidth: 0 }}>
        <span style={{ fontWeight: 700, fontSize: 14 }}>LPC<span style={{ color: 'var(--text-mute)', fontWeight: 500 }}>·Toolkit</span></span>
        <span style={{ fontSize: 10, color: 'var(--text-dim)', fontFamily: 'var(--font-mono)' }}>{label}</span>
      </div>
      <Button size="icon" variant="ghost" icon="dice" />
      <Button size="icon" variant="ghost" icon="share" />
    </header>
  );
}

function MobileTabs({ tab, setTab }) {
  const tabs = [
    { id: 'preview', label: 'Preview', icon: 'eye' },
    { id: 'layers',  label: 'Layers',  icon: 'layers' },
    { id: 'credits', label: 'Credits', icon: 'info' },
    { id: 'export',  label: 'Export',  icon: 'download' },
  ];
  return (
    <nav style={{
      flex: '0 0 auto',
      display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)',
      borderTop: '1px solid var(--border)',
      background: 'var(--surface)',
      padding: '6px 6px calc(6px + env(safe-area-inset-bottom, 0px))',
    }}>
      {tabs.map(t => (
        <button
          key={t.id}
          onClick={() => setTab(t.id)}
          style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3,
            padding: '6px 4px',
            border: 'none', background: 'transparent',
            color: tab === t.id ? 'var(--text)' : 'var(--text-mute)',
            cursor: 'pointer',
          }}>
          <Icon name={t.icon} size={18} />
          <span style={{ fontSize: 10, fontWeight: tab === t.id ? 600 : 500 }}>{t.label}</span>
        </button>
      ))}
    </nav>
  );
}

// Mobile Preview pane — character + animation strip + bottom action sheet
function MobilePreview({ state, dispatch }) {
  const anim = DM.ANIMATIONS.find(a => a.id === state.anim) || DM.ANIMATIONS[0];
  return (
    <div style={{ flex: '1 1 0', minHeight: 0, display: 'flex', flexDirection: 'column' }}>
      {/* Big preview */}
      <div className="checker" style={{
        flex: '1 1 60%', minHeight: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        position: 'relative',
        borderBottom: '1px solid var(--border)',
      }}>
        <PixelCharacter state={state} scale={6} playing={state.playing} />
        <div style={{
          position: 'absolute', top: 10, left: 10,
          padding: '3px 8px', background: 'rgba(0,0,0,.55)',
          fontFamily: 'var(--font-mono)', fontSize: 10, color: '#e6eaf3',
          borderRadius: 4,
        }}>{state.zoom}× · {state.dir}</div>
        <div style={{ position: 'absolute', top: 10, right: 10 }}>
          <DirectionPad state={state} dispatch={dispatch} />
        </div>
      </div>

      {/* Animation chips */}
      <div style={{
        padding: '10px 14px 6px',
        display: 'flex', gap: 6, overflowX: 'auto',
        flex: '0 0 auto',
      }}>
        {DM.ANIMATIONS.slice(0, 8).map(a => (
          <button
            key={a.id}
            onClick={() => dispatch({ type: 'anim', id: a.id })}
            style={{
              padding: '4px 10px', fontSize: 12, fontWeight: 500,
              borderRadius: 999,
              border: '1px solid ' + (state.anim === a.id ? 'var(--accent)' : 'var(--border)'),
              background: state.anim === a.id ? 'color-mix(in oklab, var(--accent) 18%, transparent)' : 'var(--surface-2)',
              color: 'var(--text)', whiteSpace: 'nowrap',
            }}>{a.label}</button>
        ))}
      </div>

      {/* Playback strip */}
      <div style={{
        padding: '6px 14px 10px',
        display: 'flex', alignItems: 'center', gap: 8,
        flex: '0 0 auto',
      }}>
        <Button size="md" variant={state.playing ? 'default' : 'primary'} icon={state.playing ? 'pause' : 'play'} onClick={() => dispatch({ type: 'toggle_play' })}>{state.playing ? 'Pause' : 'Play'}</Button>
        <div style={{ flex: 1 }}>
          <FrameScrubber frames={anim.frames} frame={0} onChange={() => {}} />
        </div>
      </div>

      {/* Quick row at bottom (sheet handle) */}
      <div style={{
        flex: '0 0 auto',
        padding: '8px 14px 12px',
        borderTop: '1px solid var(--border)',
        background: 'var(--surface)',
      }}>
        <div className="row" style={{ gap: 6, justifyContent: 'space-between' }}>
          <div className="row" style={{ gap: 6 }}>
            <ItemThumb kind="weapon" item={{ id: 'sword' }} palettes={state.palettes} size={24} />
            <ItemThumb kind="torso" item={{ id: 'tunic' }} palettes={state.palettes} size={24} />
            <ItemThumb kind="hair" item={{ id: 'ponytail' }} palettes={state.palettes} size={24} />
            <span style={{ fontSize: 11, color: 'var(--text-mute)' }}>+ 9 more</span>
          </div>
          <Button size="sm" variant="ghost" icon="chevron">Layers</Button>
        </div>
      </div>
    </div>
  );
}

// Mobile Layers pane — list view of categories
function MobileLayers({ state, dispatch }) {
  return (
    <div style={{ flex: '1 1 0', minHeight: 0, display: 'flex', flexDirection: 'column' }}>
      <div style={{ padding: '12px 14px 8px', flex: '0 0 auto' }}>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8,
          padding: '8px 12px', background: 'var(--surface-2)',
          border: '1px solid var(--border)', borderRadius: 6,
        }}>
          <Icon name="search" size={14} style={{ color: 'var(--text-mute)' }} />
          <input placeholder="Search…" style={{ flex: 1, border: 'none', outline: 'none', background: 'transparent', color: 'var(--text)', fontSize: 14 }} />
        </div>
        <div className="row" style={{ gap: 6, marginTop: 10, overflowX: 'auto' }}>
          {DM.BODY_TYPES.slice(0, 4).map(b => (
            <button key={b.id} onClick={() => dispatch({ type: 'body_type', id: b.id })}
              style={{
                padding: '4px 10px', fontSize: 12, fontWeight: 500, borderRadius: 999,
                border: '1px solid ' + (state.bodyType === b.id ? 'var(--accent)' : 'var(--border)'),
                background: state.bodyType === b.id ? 'color-mix(in oklab, var(--accent) 18%, transparent)' : 'var(--surface-2)',
                color: 'var(--text)', whiteSpace: 'nowrap',
              }}>{b.label}</button>
          ))}
        </div>
      </div>
      <div className="scroll" style={{ flex: '1 1 0', minHeight: 0, paddingBottom: 16 }}>
        {DM.CATEGORIES.slice(0, 9).map(cat => {
          const items = DM.ITEMS[cat.id] || [];
          const selectedId = state.layers[cat.id];
          const sel = items.find(i => i.id === selectedId);
          return (
            <details key={cat.id} open={cat.id === 'hair' || cat.id === 'torso'} style={{ borderBottom: '1px solid var(--border)' }}>
              <summary style={{
                cursor: 'pointer', listStyle: 'none',
                padding: '10px 14px',
                display: 'flex', alignItems: 'center', gap: 10,
              }}>
                <Icon name="chevron" size={12} style={{ color: 'var(--text-mute)' }} />
                <span style={{ flex: 1, fontWeight: 600, fontSize: 14 }}>{cat.label}</span>
                {sel && <span style={{ fontSize: 12, color: 'var(--text-mute)' }}>{sel.name}</span>}
              </summary>
              <div style={{ padding: '4px 12px 12px', display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6 }}>
                {items.slice(0, 8).map(item => {
                  const selected = item.id === selectedId;
                  return (
                    <button
                      key={item.id}
                      onClick={() => dispatch({ type: 'pick', cat: cat.id, id: item.id })}
                      style={{
                        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
                        padding: 6, minHeight: 70,
                        background: selected ? 'color-mix(in oklab, var(--accent) 14%, var(--surface-2))' : 'var(--surface-2)',
                        border: '1px solid ' + (selected ? 'var(--accent)' : 'var(--border)'),
                        borderRadius: 6, cursor: 'pointer',
                      }}>
                      <div style={{
                        width: 36, height: 36,
                        background: 'var(--checker-b)',
                        backgroundImage: `linear-gradient(45deg, var(--checker-a) 25%, transparent 25%),linear-gradient(-45deg, var(--checker-a) 25%, transparent 25%),linear-gradient(45deg, transparent 75%, var(--checker-a) 75%),linear-gradient(-45deg, transparent 75%, var(--checker-a) 75%)`,
                        backgroundSize: '8px 8px',
                        backgroundPosition: '0 0, 0 4px, 4px -4px, -4px 0',
                        borderRadius: 4, display: 'flex', alignItems: 'center', justifyContent: 'center',
                      }}>
                        <ItemThumb kind={cat.id} item={item} palettes={state.palettes} size={32} />
                      </div>
                      <span style={{ fontSize: 10, lineHeight: 1.1, textAlign: 'center', color: selected ? 'var(--text)' : 'var(--text-2)' }}>
                        {item.name}
                      </span>
                    </button>
                  );
                })}
              </div>
            </details>
          );
        })}
      </div>
    </div>
  );
}

function MobileCredits({ state }) {
  const layers = [];
  DM.CATEGORIES.forEach(c => {
    const id = state.layers[c.id];
    if (!id) return;
    const it = (DM.ITEMS[c.id] || []).find(i => i.id === id);
    if (it) layers.push({ cat: c, item: it });
  });
  let strict = 0, effective = 'CC0';
  layers.forEach(({ item }) => {
    const l = DM.LICENSES[item.license];
    if (l && l.strict > strict) { strict = l.strict; effective = item.license; }
  });
  return (
    <div className="scroll" style={{ flex: '1 1 0', minHeight: 0, padding: '12px 14px' }}>
      <div style={{
        padding: 12,
        background: 'color-mix(in oklab, var(--accent) 8%, var(--surface-2))',
        border: '1px solid color-mix(in oklab, var(--accent) 35%, var(--border))',
        borderRadius: 8, marginBottom: 12,
      }}>
        <div style={{ fontSize: 11, color: 'var(--text-mute)', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 600, marginBottom: 6 }}>Effective license</div>
        <div className="row" style={{ gap: 8 }}>
          <LicenseBadge license={effective} />
          <span style={{ fontSize: 13, color: 'var(--text-2)' }}>{layers.length} active layer{layers.length === 1 ? '' : 's'}</span>
        </div>
      </div>
      {layers.map(({ cat, item }) => (
        <div key={cat.id} style={{
          display: 'grid', gridTemplateColumns: 'auto 1fr auto', gap: 8,
          padding: '10px 0', borderBottom: '1px solid var(--border)', alignItems: 'start',
        }}>
          <span className="mono" style={{ fontSize: 10, color: 'var(--text-mute)', minWidth: 50, paddingTop: 2, textTransform: 'uppercase' }}>{cat.label}</span>
          <div>
            <div style={{ fontSize: 13, fontWeight: 600 }}>{item.name}</div>
            <div style={{ fontSize: 11, color: 'var(--text-mute)' }}>by {item.author}</div>
          </div>
          <LicenseBadge license={item.license} dense />
        </div>
      ))}
    </div>
  );
}

function MobileExport() {
  return (
    <div style={{ flex: '1 1 0', minHeight: 0, padding: '14px 14px', display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div className="row" style={{ gap: 6 }}>
        <Icon name="download" size={14} style={{ color: 'var(--accent-2)' }} />
        <span style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Export</span>
      </div>
      <div style={{
        padding: 14, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8,
      }}>
        <div style={{ fontSize: 11, color: 'var(--text-mute)', marginBottom: 4 }}>Full spritesheet</div>
        <div className="mono" style={{ fontSize: 12, color: 'var(--text)', marginBottom: 10 }}>832 × 3456 · PNG · ~280 kB</div>
        <Button variant="primary" size="lg" full icon="download">Download spritesheet</Button>
      </div>
      <Button size="md" variant="outline" full icon="file">Download current strip</Button>
      <Button size="md" variant="outline" full icon="gif">Download animated GIF</Button>
      <Button size="md" variant="outline" full icon="link">Copy share link</Button>
    </div>
  );
}

function MobileEditor({ theme = 'dark', initialState, tab: forcedTab, label = 'Untitled Hero' }) {
  const [state, dispatch] = useReducerM(editorReducer, initialState || DEFAULT_STATE);
  const [tab, setTab] = useStateM(forcedTab || 'preview');
  return (
    <MobileFrame>
      <div className={`lpc ${theme}`} style={{ display: 'flex', flexDirection: 'column', flex: '1 1 0', minHeight: 0, color: 'var(--text)' }}>
        <MobileTopBar theme={theme} label={label} />
        {tab === 'preview' && <MobilePreview state={state} dispatch={dispatch} />}
        {tab === 'layers'  && <MobileLayers  state={state} dispatch={dispatch} />}
        {tab === 'credits' && <MobileCredits state={state} />}
        {tab === 'export'  && <MobileExport />}
        <MobileTabs tab={tab} setTab={setTab} />
      </div>
    </MobileFrame>
  );
}

Object.assign(window, { MobileEditor, MobileFrame });
