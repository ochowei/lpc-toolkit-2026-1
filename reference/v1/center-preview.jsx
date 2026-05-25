// Center preview: large canvas + animation/direction/playback controls.

const { useState: useStateC } = React;
const DC2 = window.LPC_DATA;

function CenterPreview({ state, dispatch, narrow }) {
  const [frame, setFrameLocal] = useStateC(0);
  const [showOnion, setShowOnion] = useStateC(false);
  const anim = DC2.ANIMATIONS.find(a => a.id === state.anim) || DC2.ANIMATIONS[0];

  return (
    <main style={{
      flex: '1 1 0', minWidth: 0,
      display: 'flex', flexDirection: 'column',
      background: 'var(--bg-app)',
    }}>
      {/* Top control strip */}
      <div style={{
        padding: '10px 16px',
        borderBottom: '1px solid var(--border)',
        display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap',
      }}>
        <AnimationSelect state={state} dispatch={dispatch} />
        <DirectionPad state={state} dispatch={dispatch} />
        <div style={{ flex: '1 1 auto' }} />
        <Button size="sm" variant="ghost" icon="dice" onClick={() => dispatch({ type: 'randomize' })}>Randomize</Button>
        <Button size="sm" variant="ghost" icon="reset" onClick={() => dispatch({ type: 'reset' })}>Reset</Button>
      </div>

      {/* Preview stage */}
      <div style={{
        flex: '1 1 0', minHeight: 0, position: 'relative',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 24, overflow: 'hidden',
      }}>
        <div className="checker" style={{
          width: '100%', height: '100%', maxWidth: 720, maxHeight: 540,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          border: '1px solid var(--border)', borderRadius: 8,
          boxShadow: 'inset 0 0 0 1px rgba(255,255,255,.02)',
          position: 'relative',
        }}>
          <PixelCharacter state={state} scale={state.zoom} playing={state.playing} frameLocked={state.playing ? null : frame} onFrameChange={setFrameLocal} />

          {/* Top-left readout */}
          <div style={{
            position: 'absolute', top: 10, left: 10,
            display: 'flex', flexDirection: 'column', gap: 4,
            fontFamily: 'var(--font-mono)', fontSize: 10,
            color: 'var(--text-2)',
          }}>
            <div style={{ display: 'flex', gap: 6 }}>
              <span style={{ padding: '2px 5px', background: 'rgba(0,0,0,.55)', borderRadius: 3, backdropFilter: 'blur(6px)' }}>{state.zoom}× zoom</span>
              <span style={{ padding: '2px 5px', background: 'rgba(0,0,0,.55)', borderRadius: 3, backdropFilter: 'blur(6px)' }}>{state.dir}-facing</span>
            </div>
            <div style={{ padding: '2px 5px', background: 'rgba(0,0,0,.55)', borderRadius: 3, backdropFilter: 'blur(6px)', alignSelf: 'flex-start' }}>
              {anim.label} · frame {String((state.playing ? frame : frame) + 1).padStart(2,'0')}/{String(anim.frames).padStart(2,'0')}
            </div>
          </div>

          {/* Top-right zoom stepper */}
          <div style={{
            position: 'absolute', top: 10, right: 10,
            display: 'flex', alignItems: 'center', gap: 4,
            padding: 3, background: 'rgba(0,0,0,.55)', borderRadius: 6,
            backdropFilter: 'blur(6px)',
          }}>
            <Button size="sm" variant="ghost" icon="zoomOut" onClick={() => dispatch({ type: 'zoom', delta: -1 })} />
            {[1, 2, 4, 8].map(z => (
              <button
                key={z}
                onClick={() => dispatch({ type: 'zoom_to', value: z })}
                style={{
                  padding: '2px 7px', fontSize: 11, fontWeight: 600,
                  fontFamily: 'var(--font-mono)',
                  background: state.zoom === z ? 'var(--accent)' : 'transparent',
                  color: state.zoom === z ? 'var(--accent-ink)' : 'var(--text-2)',
                  border: 'none', borderRadius: 3, cursor: 'pointer',
                }}>{z}×</button>
            ))}
            <Button size="sm" variant="ghost" icon="zoomIn" onClick={() => dispatch({ type: 'zoom', delta: 1 })} />
          </div>

          {/* Bottom-right onion-skin / settings */}
          <div style={{
            position: 'absolute', bottom: 10, right: 10,
            display: 'flex', gap: 4,
          }}>
            <Button size="sm" variant="ghost" icon={showOnion ? 'eyeOff' : 'eye'} onClick={() => setShowOnion(v => !v)} title="Onion skinning" />
            <Button size="sm" variant="ghost" icon="grid" title="Show grid" />
          </div>
        </div>
      </div>

      {/* Playback strip */}
      <div style={{
        padding: '10px 16px',
        borderTop: '1px solid var(--border)',
        display: 'flex', alignItems: 'center', gap: 12,
      }}>
        <Button
          size="sm"
          variant={state.playing ? 'default' : 'primary'}
          icon={state.playing ? 'pause' : 'play'}
          onClick={() => dispatch({ type: 'toggle_play' })}
          style={{ minWidth: 78 }}
        >{state.playing ? 'Pause' : 'Play'}</Button>

        <FrameScrubber frames={anim.frames} frame={frame} onChange={(f) => { setFrameLocal(f); dispatch({ type: 'pause' }); }} />

        <div className="row" style={{ gap: 4, paddingLeft: 8, borderLeft: '1px solid var(--border)', marginLeft: 4 }}>
          <span style={{ fontSize: 10, color: 'var(--text-mute)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>FPS</span>
          <input
            type="number" min={1} max={30} value={state.fps || anim.fps}
            onChange={(e) => dispatch({ type: 'fps', fps: +e.target.value })}
            className="mono"
            style={{
              width: 44, padding: '3px 6px', textAlign: 'right',
              background: 'var(--surface-2)', border: '1px solid var(--border)',
              borderRadius: 4, fontSize: 12, color: 'var(--text)',
            }}
          />
        </div>
      </div>
    </main>
  );
}

function AnimationSelect({ state, dispatch }) {
  return (
    <div style={{
      display: 'flex', background: 'var(--surface-2)',
      border: '1px solid var(--border)', borderRadius: 6,
      padding: 2, gap: 1, overflowX: 'auto', maxWidth: '100%',
    }}>
      {DC2.ANIMATIONS.map(a => (
        <button
          key={a.id}
          onClick={() => dispatch({ type: 'anim', id: a.id })}
          style={{
            padding: '4px 9px', fontSize: 12, fontWeight: 500,
            border: 'none', borderRadius: 4, cursor: 'pointer',
            background: state.anim === a.id ? 'var(--surface-3)' : 'transparent',
            color: state.anim === a.id ? 'var(--text)' : 'var(--text-2)',
            whiteSpace: 'nowrap',
          }}>{a.label}</button>
      ))}
    </div>
  );
}

function DirectionPad({ state, dispatch }) {
  const dirs = [
    { id: 'N', x: 1, y: 0, label: '↑' },
    { id: 'W', x: 0, y: 1, label: '←' },
    { id: 'S', x: 1, y: 2, label: '↓' },
    { id: 'E', x: 2, y: 1, label: '→' },
  ];
  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: 'repeat(3, 22px)',
      gridTemplateRows: 'repeat(3, 22px)',
      gap: 2,
      background: 'var(--surface-2)', padding: 3, borderRadius: 6,
      border: '1px solid var(--border)',
    }}>
      {dirs.map(d => (
        <button
          key={d.id}
          onClick={() => dispatch({ type: 'dir', id: d.id })}
          style={{
            gridColumn: d.x + 1, gridRow: d.y + 1,
            background: state.dir === d.id ? 'var(--accent)' : 'transparent',
            color: state.dir === d.id ? 'var(--accent-ink)' : 'var(--text-2)',
            border: 'none', borderRadius: 3, cursor: 'pointer',
            fontSize: 11, fontWeight: 600,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
        >{d.label}</button>
      ))}
      <div style={{ gridColumn: 2, gridRow: 2, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, fontWeight: 600, color: 'var(--text-dim)', fontFamily: 'var(--font-mono)' }}>
        {state.dir}
      </div>
    </div>
  );
}

function FrameScrubber({ frames, frame, onChange }) {
  return (
    <div style={{ flex: '1 1 auto', display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
      <div style={{
        flex: '1 1 auto', height: 28, position: 'relative',
        background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 4,
        display: 'flex', alignItems: 'stretch', overflow: 'hidden',
      }}>
        {Array.from({ length: frames }).map((_, i) => (
          <button
            key={i}
            onClick={() => onChange(i)}
            style={{
              flex: 1,
              background: i === frame ? 'var(--accent)' : (i % 2 ? 'transparent' : 'rgba(255,255,255,.02)'),
              color: i === frame ? 'var(--accent-ink)' : 'var(--text-mute)',
              border: 'none',
              borderRight: i < frames - 1 ? '1px solid var(--border)' : 'none',
              cursor: 'pointer', fontFamily: 'var(--font-mono)',
              fontSize: 10, fontWeight: 600,
              padding: 0,
            }}>{i + 1}</button>
        ))}
      </div>
      <span className="mono" style={{ fontSize: 11, color: 'var(--text-mute)', minWidth: 36, textAlign: 'right' }}>
        {String(frame + 1).padStart(2,'0')}/{String(frames).padStart(2,'0')}
      </span>
    </div>
  );
}

Object.assign(window, { CenterPreview, FrameScrubber, DirectionPad, AnimationSelect });
