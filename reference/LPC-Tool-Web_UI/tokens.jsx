// Design-tokens card: palette + type scale + spacing tokens, in both themes.

function TokensCard({ theme = 'dark' }) {
  return (
    <div className={`lpc ${theme}`} style={{
      width: '100%', minHeight: '100%',
      background: 'var(--bg-app)',
      padding: 32,
      display: 'flex', flexDirection: 'column', gap: 28,
      color: 'var(--text)',
    }}>
      <header>
        <div className="ttu" style={{ fontSize: 11, color: 'var(--text-mute)', fontWeight: 600 }}>{theme} theme</div>
        <h2 style={{ margin: '4px 0 0', fontSize: 24, fontWeight: 700, letterSpacing: '-0.015em' }}>
          Design tokens
        </h2>
        <p style={{ margin: '6px 0 0', color: 'var(--text-2)', fontSize: 13, maxWidth: 560 }}>
          Tokens live in <code className="mono" style={{ color: 'var(--text)' }}>:root</code> CSS variables and flip wholesale between
          <code className="mono" style={{ color: 'var(--text)' }}>.lpc.dark</code> and <code className="mono" style={{ color: 'var(--text)' }}>.lpc.light</code>. All accent hues
          are defined in <code className="mono" style={{ color: 'var(--text)' }}>oklch</code> for stable lightness across themes.
        </p>
      </header>

      {/* Palette */}
      <section>
        <h3 style={{ margin: '0 0 12px', fontSize: 13, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-mute)' }}>Palette</h3>
        <div style={{
          display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 10,
        }}>
          {[
            ['--bg-app',     'app bg'],
            ['--surface',    'surface'],
            ['--surface-2',  'surface-2'],
            ['--surface-3',  'surface-3'],
            ['--border',     'border'],
            ['--border-strong', 'border-strong'],
            ['--text',       'text'],
            ['--text-2',     'text-2'],
            ['--text-mute',  'text-mute'],
            ['--text-dim',   'text-dim'],
            ['--accent',     'accent'],
            ['--accent-2',   'accent-2'],
            ['--danger',     'danger'],
            ['--success',    'success'],
            ['--info',       'info'],
          ].map(([v, name]) => (
            <Swatch key={v} varName={v} label={name} />
          ))}
        </div>
      </section>

      {/* License colors */}
      <section>
        <h3 style={{ margin: '0 0 12px', fontSize: 13, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-mute)' }}>License palettes</h3>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
          {['GPL 3.0','CC-BY 3.0','CC-BY-SA 3.0','OGA-BY 3.0','CC0'].map(l => (
            <div key={l} style={{
              display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px',
              background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8,
            }}>
              <LicenseBadge license={l} />
              <span style={{ fontSize: 12, color: 'var(--text-2)' }}>{l}</span>
            </div>
          ))}
        </div>
      </section>

      {/* Type */}
      <section>
        <h3 style={{ margin: '0 0 12px', fontSize: 13, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-mute)' }}>Type scale</h3>
        <div style={{
          background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8,
          padding: 18, display: 'grid', gridTemplateColumns: '90px 1fr 200px', columnGap: 16, rowGap: 8, alignItems: 'baseline',
        }}>
          {[
            ['t-10', 10, 'Caption / mono badge'],
            ['t-11', 11, 'Section eyebrow, license badge'],
            ['t-12', 12, 'Inline meta, attribution row'],
            ['t-13', 13, 'Default UI text'],
            ['t-14', 14, 'Buttons, item name'],
            ['t-16', 16, 'Section title'],
            ['t-20', 20, 'Subhead'],
            ['t-24', 24, 'Display'],
          ].map(([name, size, role]) => (
            <React.Fragment key={name}>
              <span className="mono" style={{ fontSize: 11, color: 'var(--text-mute)' }}>{name} · {size}px</span>
              <span style={{ fontSize: size, fontWeight: size >= 20 ? 700 : 500, letterSpacing: size >= 20 ? '-0.015em' : 'normal' }}>The quick fox leaps over a lazy dog.</span>
              <span style={{ fontSize: 12, color: 'var(--text-mute)' }}>{role}</span>
            </React.Fragment>
          ))}
        </div>
        <div style={{ marginTop: 12, display: 'flex', gap: 18, flexWrap: 'wrap', alignItems: 'baseline' }}>
          <div style={{ fontSize: 18, fontFamily: 'var(--font-sans)' }}>
            Space Grotesk
            <div style={{ fontSize: 11, color: 'var(--text-mute)', marginTop: 2 }}>UI · weights 400 500 600 700</div>
          </div>
          <div style={{ fontSize: 18, fontFamily: 'var(--font-mono)' }}>
            JetBrains Mono
            <div style={{ fontSize: 11, color: 'var(--text-mute)', marginTop: 2 }}>Numbers, code, badges</div>
          </div>
        </div>
      </section>

      {/* Spacing */}
      <section>
        <h3 style={{ margin: '0 0 12px', fontSize: 13, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-mute)' }}>Spacing & radii</h3>
        <div style={{ display: 'flex', gap: 28, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <span style={{ fontSize: 11, color: 'var(--text-mute)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Scale (px)</span>
            {[2, 4, 8, 12, 16, 20, 24, 32, 40].map(s => (
              <div key={s} className="row" style={{ gap: 8 }}>
                <span className="mono" style={{ fontSize: 11, color: 'var(--text-mute)', width: 40 }}>s-{s/4 | 0}</span>
                <span style={{ height: 12, width: s, background: 'var(--accent)', borderRadius: 2 }} />
                <span style={{ fontSize: 11, color: 'var(--text-2)' }}>{s}px</span>
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <span style={{ fontSize: 11, color: 'var(--text-mute)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Radii</span>
            {[3, 5, 8, 12].map(r => (
              <div key={r} className="row" style={{ gap: 8 }}>
                <span className="mono" style={{ fontSize: 11, color: 'var(--text-mute)', width: 40 }}>r-{Math.round(r/2)}</span>
                <span style={{ height: 22, width: 36, background: 'var(--surface-3)', border: '1px solid var(--border)', borderRadius: r }} />
                <span style={{ fontSize: 11, color: 'var(--text-2)' }}>{r}px</span>
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <span style={{ fontSize: 11, color: 'var(--text-mute)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Focus ring</span>
            <button style={{
              padding: '6px 10px', background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 5,
              outline: '2px solid var(--accent)', outlineOffset: 2,
              fontSize: 12, color: 'var(--text)',
            }}>Always visible · 2px</button>
            <span style={{ fontSize: 11, color: 'var(--text-mute)' }}>--accent at 2px, offset 2</span>
          </div>
        </div>
      </section>
    </div>
  );
}

function Swatch({ varName, label }) {
  return (
    <div style={{
      background: 'var(--surface)', border: '1px solid var(--border)',
      borderRadius: 6, overflow: 'hidden',
      display: 'flex', flexDirection: 'column',
    }}>
      <div style={{ height: 56, background: `var(${varName})`, borderBottom: '1px solid var(--border)' }} />
      <div style={{ padding: '6px 8px' }}>
        <div className="mono" style={{ fontSize: 11, color: 'var(--text)' }}>{varName}</div>
        <div style={{ fontSize: 11, color: 'var(--text-mute)' }}>{label}</div>
      </div>
    </div>
  );
}

Object.assign(window, { TokensCard, Swatch });
