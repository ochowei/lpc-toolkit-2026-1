// Right panel: Attribution (mandatory, prominent) + Export.

const D3 = window.LPC_DATA;
const { useMemo: useMemoR } = React;

function RightPanel({ state, dispatch }) {
  const activeLayers = useMemoR(() => {
    const out = [];
    D3.CATEGORIES.forEach(c => {
      const id = state.layers[c.id];
      if (!id) return;
      const item = (D3.ITEMS[c.id] || []).find(i => i.id === id);
      if (!item) return;
      out.push({ cat: c, item });
    });
    return out;
  }, [state.layers]);

  const effectiveLicense = useMemoR(() => {
    let strict = 0, name = 'CC0';
    activeLayers.forEach(({ item }) => {
      const l = D3.LICENSES[item.license];
      if (l && l.strict > strict) { strict = l.strict; name = item.license; }
    });
    return name;
  }, [activeLayers]);

  return (
    <aside style={{
      width: '100%', height: '100%',
      borderLeft: '1px solid var(--border)',
      background: 'var(--surface)',
      display: 'flex', flexDirection: 'column',
      minHeight: 0,
    }}>
      <AttributionPanel layers={activeLayers} effective={effectiveLicense} />
      <ExportPanel state={state} dispatch={dispatch} />
    </aside>
  );
}

function AttributionPanel({ layers, effective }) {
  return (
    <section style={{
      flex: '1 1 0', minHeight: 0,
      display: 'flex', flexDirection: 'column',
    }}>
      <div style={{
        padding: '12px 16px 10px',
        borderBottom: '1px solid var(--border)',
        flex: '0 0 auto',
      }}>
        <div className="row" style={{ gap: 6, marginBottom: 6 }}>
          <Icon name="info" size={14} style={{ color: 'var(--accent)' }} />
          <span style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Attribution</span>
          <span style={{ fontSize: 11, color: 'var(--text-mute)' }}>— required, never hidden</span>
        </div>

        {/* Effective license — the hero */}
        <div style={{
          padding: 10, marginTop: 6,
          background: 'color-mix(in oklab, var(--accent) 8%, var(--surface-2))',
          border: '1px solid color-mix(in oklab, var(--accent) 35%, var(--border))',
          borderRadius: 6,
          display: 'flex', flexDirection: 'column', gap: 6,
        }}>
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <span style={{ fontSize: 11, color: 'var(--text-mute)', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 600 }}>Effective license</span>
            <span style={{ fontSize: 10, color: 'var(--text-dim)' }}>strictest wins</span>
          </div>
          <div className="row" style={{ gap: 8 }}>
            <LicenseBadge license={effective} />
            <span style={{ fontSize: 12, color: 'var(--text-2)' }}>
              Across {layers.length} active layer{layers.length === 1 ? '' : 's'}
            </span>
          </div>
        </div>
      </div>

      {/* Per-layer rows */}
      <div className="scroll" style={{ flex: '1 1 0', minHeight: 0, padding: '4px 0 8px' }}>
        {layers.length === 0 && (
          <div style={{ padding: 16, fontSize: 12, color: 'var(--text-mute)', textAlign: 'center' }}>
            No layers active yet.
          </div>
        )}
        {layers.map(({ cat, item }) => (
          <AttributionRow key={cat.id} cat={cat} item={item} />
        ))}
      </div>
    </section>
  );
}

function AttributionRow({ cat, item }) {
  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: 'auto 1fr auto',
      gap: 8, alignItems: 'start',
      padding: '8px 16px',
      borderBottom: '1px solid var(--border)',
      fontSize: 12,
    }}>
      <span style={{
        fontFamily: 'var(--font-mono)', fontSize: 10,
        color: 'var(--text-mute)', textTransform: 'uppercase', letterSpacing: '0.05em',
        minWidth: 56, paddingTop: 1,
      }}>{cat.label}</span>

      <div style={{ minWidth: 0 }}>
        <div style={{ fontWeight: 600, color: 'var(--text)', fontSize: 12, marginBottom: 2 }}>
          {item.name}
        </div>
        <div style={{ fontSize: 11, color: 'var(--text-mute)', display: 'flex', flexDirection: 'column', gap: 1 }}>
          <span>by <span style={{ color: 'var(--text-2)' }}>{item.author}</span></span>
          {item.src && (
            <a href="#" onClick={(e) => e.preventDefault()} style={{
              color: 'var(--info)', textDecoration: 'none', fontSize: 10,
              fontFamily: 'var(--font-mono)',
              maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'block',
            }}>{item.src}</a>
          )}
        </div>
      </div>

      <LicenseBadge license={item.license} dense />
    </div>
  );
}

function ExportPanel({ state, dispatch }) {
  return (
    <section style={{
      flex: '0 0 auto',
      borderTop: '1px solid var(--border)',
      background: 'var(--bg-app)',
      padding: 14,
      display: 'flex', flexDirection: 'column', gap: 8,
    }}>
      <div className="row" style={{ gap: 6 }}>
        <Icon name="download" size={14} style={{ color: 'var(--accent-2)' }} />
        <span style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Export</span>
        <span style={{ marginLeft: 'auto', fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-mute)' }}>
          832 × 3456 · PNG
        </span>
      </div>

      <Button variant="primary" size="md" full icon="download">
        Download spritesheet
      </Button>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
        <Button size="sm" variant="outline" icon="file">Current strip</Button>
        <Button size="sm" variant="outline" icon="gif">Animated GIF</Button>
      </div>

      <div style={{
        marginTop: 2, padding: '8px 10px',
        background: 'var(--surface-2)',
        border: '1px solid var(--border)', borderRadius: 5,
        display: 'flex', alignItems: 'center', gap: 8,
      }}>
        <Icon name="link" size={12} style={{ color: 'var(--text-mute)' }} />
        <code style={{
          flex: '1 1 auto', fontFamily: 'var(--font-mono)', fontSize: 10,
          color: 'var(--text-2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          lpc.tool/?c={btoa(JSON.stringify(state.layers)).slice(0, 22)}…
        </code>
        <Button size="sm" variant="ghost" icon="share">Copy</Button>
      </div>
    </section>
  );
}

Object.assign(window, { RightPanel, AttributionPanel, ExportPanel });
