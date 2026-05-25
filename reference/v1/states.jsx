// Required state cards: catalog loading skeleton, empty character, search empty,
// layer-load error.

function LoadingState({ theme = 'dark' }) {
  return (
    <div className={`lpc ${theme}`} style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', background: 'var(--bg-app)', overflow: 'hidden' }}>
      <TopBar theme={theme} setTheme={() => {}} label="Loading catalog…" hash="" />
      <div style={{
        flex: 1, minHeight: 0, display: 'grid',
        gridTemplateColumns: '320px 1fr 340px',
      }}>
        {/* Left skeleton */}
        <div style={{ borderRight: '1px solid var(--border)', background: 'var(--surface)', padding: 14 }}>
          <Skeleton w="100%" h={18} />
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 4, marginTop: 8 }}>
            {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} w="100%" h={32} />)}
          </div>
          <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
            {Array.from({ length: 4 }).map((_, s) => (
              <div key={s}>
                <Skeleton w={80} h={14} />
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 4, marginTop: 6 }}>
                  {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} w="100%" h={56} />)}
                </div>
              </div>
            ))}
          </div>
        </div>
        {/* Center skeleton */}
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <div style={{ padding: '10px 16px', borderBottom: '1px solid var(--border)', display: 'flex', gap: 8 }}>
            <Skeleton w={260} h={26} />
            <Skeleton w={72} h={68} r={4} />
          </div>
          <div className="checker" style={{
            flex: 1, margin: 24, borderRadius: 8, position: 'relative',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            border: '1px solid var(--border)',
          }}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, color: 'var(--text-2)' }}>
              <Icon name="spinner" size={32} style={{ animation: 'lpc-spin 1.1s linear infinite' }} />
              <div style={{ fontSize: 13, color: 'var(--text-2)' }}>Indexing 3,128 sprite layers…</div>
              <div style={{
                width: 180, height: 4, background: 'var(--surface-2)', borderRadius: 2, overflow: 'hidden',
              }}>
                <div style={{ width: '64%', height: '100%', background: 'var(--accent)' }} />
              </div>
              <div className="mono" style={{ fontSize: 10, color: 'var(--text-dim)' }}>64% · parsing CC-BY metadata</div>
            </div>
          </div>
          <div style={{ padding: '10px 16px', borderTop: '1px solid var(--border)', display: 'flex', gap: 12 }}>
            <Skeleton w={78} h={30} />
            <Skeleton w="100%" h={28} />
          </div>
        </div>
        {/* Right skeleton */}
        <div style={{ borderLeft: '1px solid var(--border)', background: 'var(--surface)', padding: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <Skeleton w={120} h={14} />
          <Skeleton w="100%" h={60} r={6} />
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} style={{ display: 'grid', gridTemplateColumns: '60px 1fr 50px', gap: 8, padding: '6px 0' }}>
              <Skeleton w={50} h={10} />
              <div>
                <Skeleton w="80%" h={12} />
                <div style={{ marginTop: 4 }}><Skeleton w="60%" h={10} /></div>
              </div>
              <Skeleton w={50} h={16} r={3} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function EmptyCharacterState({ theme = 'dark' }) {
  const state = {
    bodyType: 'male',
    layers: { body: 'human' },
    variants: {},
    palettes: { body: 'skin_ivory' },
    errors: {},
    anim: 'idle', dir: 'S', zoom: 4, fps: 4, playing: true,
  };
  return (
    <div className={`lpc ${theme}`} style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', background: 'var(--bg-app)', overflow: 'hidden' }}>
      <TopBar theme={theme} setTheme={() => {}} label="Untitled Hero" hash="#bare" />
      <div style={{ flex: 1, display: 'flex', position: 'relative' }}>
        <div className="checker" style={{
          flex: 1, position: 'relative',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <PixelCharacter state={state} scale={5} playing />
          {/* Overlay tip */}
          <div style={{
            position: 'absolute', bottom: 24, left: '50%', transform: 'translateX(-50%)',
            display: 'flex', alignItems: 'center', gap: 10,
            padding: '10px 14px',
            background: 'rgba(0,0,0,.55)', backdropFilter: 'blur(8px)',
            border: '1px solid rgba(255,255,255,.08)',
            color: '#e6eaf3', borderRadius: 999,
            fontSize: 12,
          }}>
            <Icon name="sparkles" size={14} style={{ color: 'var(--accent)' }} />
            Bare body. Pick a hair, torso or weapon on the left to start dressing.
            <Button size="sm" variant="primary" icon="dice">Randomize me</Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function LayerErrorState({ theme = 'dark' }) {
  const state = {
    ...DEFAULT_STATE,
    errors: { 'shield:tower': true },
  };
  return (
    <div className={`lpc ${theme}`} style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', background: 'var(--bg-app)', overflow: 'hidden' }}>
      <TopBar theme={theme} setTheme={() => {}} label="Knight" hash="#shield-err" />
      <div style={{ flex: 1, display: 'grid', gridTemplateColumns: '320px 1fr', minHeight: 0 }}>
        <div style={{ background: 'var(--surface)', borderRight: '1px solid var(--border)', display: 'flex', flexDirection: 'column' }}>
          <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--border)', fontSize: 13, fontWeight: 600 }}>
            <div className="row" style={{ gap: 6 }}>
              <Icon name="chevron" size={12} style={{ color: 'var(--text-mute)' }} />
              Shield
              <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--text-mute)' }}>Tower</span>
            </div>
          </div>
          <div style={{ padding: 10 }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 4 }}>
              {[
                { id: 'buckler', name: 'Buckler' },
                { id: 'kite', name: 'Kite' },
                { id: 'tower', name: 'Tower', err: true, selected: true },
                { id: 'round', name: 'Round' },
              ].map(it => (
                <div key={it.id} style={{ position: 'relative' }}>
                  <button style={{
                    width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
                    padding: '6px 4px',
                    background: it.selected ? 'color-mix(in oklab, var(--danger) 14%, var(--surface-2))' : 'var(--surface-2)',
                    border: '1px solid ' + (it.selected ? 'var(--danger)' : (it.err ? 'color-mix(in oklab, var(--danger) 40%, var(--border))' : 'var(--border)')),
                    borderRadius: 5, cursor: 'pointer',
                  }}>
                    <div style={{ width: 32, height: 32, background: 'var(--checker-b)', borderRadius: 3, display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative' }}>
                      {it.err ? (
                        <Icon name="warning" size={16} style={{ color: 'var(--danger)' }} />
                      ) : (
                        <ItemThumb kind="shield" item={{ id: it.id }} palettes={DEFAULT_STATE.palettes} size={28} />
                      )}
                    </div>
                    <span style={{ fontSize: 11, color: 'var(--text-2)' }}>{it.name}</span>
                  </button>
                  {it.err && (
                    <div style={{
                      position: 'absolute', top: -4, right: -4,
                      fontSize: 9, fontWeight: 700,
                      padding: '2px 5px', background: 'var(--danger)', color: '#fff',
                      borderRadius: 3, boxShadow: '0 1px 4px rgba(0,0,0,.4)',
                    }}>FAILED</div>
                  )}
                </div>
              ))}
            </div>
            <div style={{
              marginTop: 12, padding: 10,
              background: 'color-mix(in oklab, var(--danger) 10%, var(--surface-2))',
              border: '1px solid color-mix(in oklab, var(--danger) 40%, var(--border))',
              borderRadius: 6,
              display: 'flex', flexDirection: 'column', gap: 6,
            }}>
              <div className="row" style={{ gap: 6 }}>
                <Icon name="warning" size={12} style={{ color: 'var(--danger)' }} />
                <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--danger)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Layer failed to load</span>
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-2)' }}>
                <code className="mono" style={{ color: 'var(--text)' }}>shield/tower</code> couldn’t be fetched from the asset CDN. The preview falls back to the next-lowest layer.
              </div>
              <div className="row" style={{ gap: 6, marginTop: 2 }}>
                <Button size="sm" variant="outline" icon="reset">Retry</Button>
                <Button size="sm" variant="ghost">Pick another</Button>
              </div>
            </div>
          </div>
        </div>
        <div className="checker" style={{
          flex: 1, position: 'relative',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <PixelCharacter state={{ ...DEFAULT_STATE, layers: { ...DEFAULT_STATE.layers, shield: undefined }, anim: 'idle' }} scale={5} playing />
          <div style={{
            position: 'absolute', top: 12, right: 12,
            padding: '4px 10px', background: 'rgba(0,0,0,.55)',
            borderRadius: 999, display: 'flex', alignItems: 'center', gap: 6,
            fontSize: 11, color: '#e6eaf3',
            border: '1px solid rgba(255,255,255,.08)',
          }}>
            <span style={{ width: 6, height: 6, borderRadius: 999, background: 'var(--danger)' }} />
            1 layer in error
          </div>
        </div>
      </div>
    </div>
  );
}

function SearchEmptyState({ theme = 'dark' }) {
  // Reuse Editor with forced search
  return (
    <div className={`lpc ${theme}`} style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', background: 'var(--bg-app)', overflow: 'hidden' }}>
      <TopBar theme={theme} setTheme={() => {}} label="Knight" hash="#search" />
      <div style={{ flex: 1, display: 'grid', gridTemplateColumns: '320px 1fr', minHeight: 0 }}>
        <div style={{ background: 'var(--surface)', borderRight: '1px solid var(--border)', display: 'flex', flexDirection: 'column' }}>
          <div style={{ padding: 10, borderBottom: '1px solid var(--border)' }}>
            <div style={{
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '6px 10px', background: 'var(--surface-2)',
              border: '1px solid var(--accent)', borderRadius: 6,
            }}>
              <Icon name="search" size={13} style={{ color: 'var(--accent)' }} />
              <span style={{ flex: 1, fontSize: 13 }}>fedora</span>
              <Icon name="x" size={12} style={{ color: 'var(--text-mute)' }} />
            </div>
          </div>
          <SearchEmpty query="fedora" onClear={() => {}} />
        </div>
        <div className="checker" style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative' }}>
          <PixelCharacter state={DEFAULT_STATE} scale={5} playing />
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { LoadingState, EmptyCharacterState, LayerErrorState, SearchEmptyState });
