// Left panel: body-type selector + search + category accordion + items.

const { useState: useStateL, useMemo: useMemoL, useRef: useRefL } = React;
const D = window.LPC_DATA;

function LeftPanel({ state, dispatch, searchValue = '', onSearch, openCategories, setOpenCategories, narrow }) {
  const categories = D.CATEGORIES;

  const filteredItems = useMemoL(() => {
    if (!searchValue) return null;
    const q = searchValue.toLowerCase();
    const out = {};
    categories.forEach(c => {
      const items = D.ITEMS[c.id] || [];
      const matches = items.filter(it => it.name.toLowerCase().includes(q) || c.label.toLowerCase().includes(q));
      if (matches.length) out[c.id] = matches;
    });
    return out;
  }, [searchValue]);

  return (
    <aside style={{
      display: 'flex', flexDirection: 'column',
      width: '100%', height: '100%',
      borderRight: '1px solid var(--border)',
      background: 'var(--surface)',
      minHeight: 0,
    }}>
      {/* Body type selector */}
      <div style={{
        padding: '14px 14px 12px',
        borderBottom: '1px solid var(--border)',
        flex: '0 0 auto',
      }}>
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          marginBottom: 8,
        }}>
          <span className="ttu" style={{ fontSize: 11, color: 'var(--text-mute)', fontWeight: 600 }}>Body type</span>
          <span className="mono" style={{ fontSize: 10, color: 'var(--text-dim)' }}>{D.BODY_TYPES.length}</span>
        </div>
        <div style={{
          display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 4,
        }}>
          {D.BODY_TYPES.map(b => (
            <button
              key={b.id}
              onClick={() => dispatch({ type: 'body_type', id: b.id })}
              style={{
                padding: '6px 8px', borderRadius: 4,
                border: '1px solid ' + (state.bodyType === b.id ? 'var(--accent)' : 'var(--border)'),
                background: state.bodyType === b.id ? 'color-mix(in oklab, var(--accent) 14%, var(--surface-2))' : 'var(--surface-2)',
                color: state.bodyType === b.id ? 'var(--text)' : 'var(--text-2)',
                fontSize: 12, fontWeight: 500, cursor: 'pointer',
                display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 0,
              }}
            >
              <span>{b.label}</span>
              <span style={{ fontSize: 10, color: 'var(--text-mute)', fontWeight: 400 }}>{b.hint}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Search */}
      <div style={{
        padding: '10px 12px', flex: '0 0 auto',
        borderBottom: '1px solid var(--border)',
        position: 'relative',
      }}>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8,
          padding: '6px 10px', background: 'var(--surface-2)',
          border: '1px solid var(--border)', borderRadius: 6,
        }}>
          <Icon name="search" size={13} style={{ color: 'var(--text-mute)' }} />
          <input
            value={searchValue}
            onChange={(e) => onSearch(e.target.value)}
            placeholder="Search layers, items…"
            style={{
              flex: 1, border: 'none', outline: 'none',
              background: 'transparent', color: 'var(--text)',
              fontSize: 13, minWidth: 0,
            }}
          />
          <span className="mono" style={{ fontSize: 10, color: 'var(--text-dim)', padding: '1px 4px', border: '1px solid var(--border)', borderRadius: 3 }}>⌘K</span>
        </div>
      </div>

      {/* Category list (scrollable) */}
      <div className="scroll" style={{ flex: '1 1 0', minHeight: 0, padding: '4px 0 24px' }}>
        {filteredItems && Object.keys(filteredItems).length === 0 && (
          <SearchEmpty query={searchValue} onClear={() => onSearch('')} />
        )}
        {categories.map(cat => {
          const items = filteredItems ? (filteredItems[cat.id] || null) : (D.ITEMS[cat.id] || []);
          if (filteredItems && !items) return null;
          const open = filteredItems ? true : (openCategories[cat.id] !== false);
          return (
            <CategorySection
              key={cat.id}
              cat={cat}
              items={items || []}
              open={open}
              onToggle={() => setOpenCategories(o => ({ ...o, [cat.id]: !open }))}
              state={state}
              dispatch={dispatch}
            />
          );
        })}
      </div>
    </aside>
  );
}

function CategorySection({ cat, items, open, onToggle, state, dispatch }) {
  const selectedId = state.layers[cat.id];
  const selectedItem = items.find(i => i.id === selectedId);
  return (
    <section style={{ borderBottom: '1px solid var(--border)' }}>
      <button
        onClick={onToggle}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', gap: 8,
          padding: '8px 12px', background: 'transparent', border: 'none',
          color: 'var(--text)', cursor: 'pointer', textAlign: 'left',
        }}
      >
        <Icon name="chevron" size={12} style={{ color: 'var(--text-mute)', transform: open ? 'rotate(0)' : 'rotate(-90deg)', transition: 'transform .15s' }} />
        <span style={{ fontWeight: 600, fontSize: 13, flex: '1 1 auto' }}>{cat.label}</span>
        {selectedItem && (
          <span style={{
            fontSize: 11, color: 'var(--text-mute)',
            maxWidth: 100, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>{selectedItem.name}</span>
        )}
        <span className="mono" style={{ fontSize: 10, color: 'var(--text-dim)', padding: '0 4px' }}>{items.length}</span>
      </button>

      {open && (
        <div style={{ padding: '0 8px 10px' }}>
          {selectedItem && (
            <button
              onClick={(e) => { e.stopPropagation(); dispatch({ type: 'clear_category', cat: cat.id }); }}
              style={{
                fontSize: 11, color: 'var(--text-mute)',
                background: 'transparent', border: 'none', cursor: 'pointer',
                padding: '2px 4px', marginBottom: 4, display: 'inline-flex', alignItems: 'center', gap: 4,
              }}
            >
              <Icon name="x" size={10} />
              Clear {cat.label.toLowerCase()}
            </button>
          )}
          <ItemGrid items={items} cat={cat} state={state} dispatch={dispatch} />

          {selectedItem && (
            <ItemControls item={selectedItem} cat={cat} state={state} dispatch={dispatch} />
          )}
        </div>
      )}
    </section>
  );
}

function ItemGrid({ items, cat, state, dispatch }) {
  const selectedId = state.layers[cat.id];
  return (
    <div style={{
      display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(64px, 1fr))',
      gap: 4,
    }}>
      {items.map(item => {
        const selected = item.id === selectedId;
        const error = state.errors && state.errors[`${cat.id}:${item.id}`];
        return (
          <button
            key={item.id}
            onClick={() => dispatch({ type: 'pick', cat: cat.id, id: item.id })}
            title={`${item.name} · ${item.author} · ${item.license}`}
            style={{
              position: 'relative',
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
              padding: '6px 4px',
              background: selected ? 'color-mix(in oklab, var(--accent) 12%, var(--surface-2))' : 'var(--surface-2)',
              border: '1px solid ' + (selected ? 'var(--accent)' : 'var(--border)'),
              borderRadius: 5,
              cursor: 'pointer',
              color: selected ? 'var(--text)' : 'var(--text-2)',
            }}
          >
            <div style={{
              width: 32, height: 32,
              background: 'var(--checker-b)',
              backgroundImage: `linear-gradient(45deg, var(--checker-a) 25%, transparent 25%),linear-gradient(-45deg, var(--checker-a) 25%, transparent 25%),linear-gradient(45deg, transparent 75%, var(--checker-a) 75%),linear-gradient(-45deg, transparent 75%, var(--checker-a) 75%)`,
              backgroundSize: '8px 8px',
              backgroundPosition: '0 0, 0 4px, 4px -4px, -4px 0',
              borderRadius: 3, padding: 2, display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: 'inset 0 0 0 1px rgba(0,0,0,.15)',
            }}>
              <ItemThumb kind={cat.id} item={item} palettes={state.palettes} size={28} />
            </div>
            <span style={{
              fontSize: 11, lineHeight: 1.2, fontWeight: selected ? 600 : 500,
              maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>
              {item.name}
            </span>
            {error && (
              <div style={{
                position: 'absolute', top: -4, right: -4,
                display: 'inline-flex', alignItems: 'center', gap: 3,
                fontSize: 9, fontWeight: 600,
                padding: '2px 5px', background: 'var(--danger)', color: '#fff',
                borderRadius: 3, boxShadow: '0 1px 4px rgba(0,0,0,.4)',
              }}>
                <Icon name="warning" size={8} />
                Failed
              </div>
            )}
          </button>
        );
      })}
    </div>
  );
}

function ItemControls({ item, cat, state, dispatch }) {
  const variant = state.variants[cat.id];
  const paletteKey = cat.id;
  const currentRamp = state.palettes[paletteKey];
  const rampGroup = item.palette;
  const rampOptions = rampGroup ? (D.PALETTE_OPTIONS[rampGroup] || []) : [];

  return (
    <div style={{
      marginTop: 8, padding: 10,
      background: 'var(--bg-app)',
      border: '1px solid var(--border)', borderRadius: 6,
      display: 'flex', flexDirection: 'column', gap: 10,
    }}>
      <div className="row" style={{ gap: 6, alignItems: 'center' }}>
        <Icon name="layers" size={12} style={{ color: 'var(--accent)' }} />
        <span style={{ fontSize: 11, color: 'var(--text-mute)', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 600 }}>Configure</span>
        <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--text)', fontWeight: 600 }}>{item.name}</span>
      </div>

      {item.variants && (
        <div>
          <div style={{ fontSize: 10, color: 'var(--text-mute)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Variant</div>
          <div className="row" style={{ gap: 4, flexWrap: 'wrap' }}>
            {item.variants.map(v => (
              <button
                key={v}
                onClick={() => dispatch({ type: 'variant', cat: cat.id, variant: v })}
                style={{
                  padding: '3px 8px', fontSize: 11, fontWeight: 500,
                  borderRadius: 999,
                  border: '1px solid ' + ((variant || item.variants[0]) === v ? 'var(--accent)' : 'var(--border)'),
                  background: (variant || item.variants[0]) === v ? 'color-mix(in oklab, var(--accent) 18%, transparent)' : 'transparent',
                  color: 'var(--text)', cursor: 'pointer',
                }}
              >{v}</button>
            ))}
          </div>
        </div>
      )}

      {rampOptions.length > 0 && (
        <div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
            <span style={{ fontSize: 10, color: 'var(--text-mute)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Recolor</span>
            <span className="mono" style={{ fontSize: 10, color: 'var(--text-dim)' }}>
              {D.RAMPS[currentRamp]?.name || '—'}
            </span>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 2 }}>
            {rampOptions.map(rampKey => (
              <RampSwatch
                key={rampKey}
                ramp={rampKey}
                size={10}
                selected={currentRamp === rampKey}
                onClick={() => dispatch({ type: 'recolor', cat: paletteKey, ramp: rampKey })}
                title={D.RAMPS[rampKey].name}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function SearchEmpty({ query, onClear }) {
  return (
    <div style={{ padding: '32px 16px', textAlign: 'center' }}>
      <div style={{
        margin: '0 auto 10px', width: 40, height: 40, display: 'flex',
        alignItems: 'center', justifyContent: 'center',
        borderRadius: 999, background: 'var(--surface-2)',
        color: 'var(--text-mute)',
      }}>
        <Icon name="search" size={18} />
      </div>
      <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>
        Nothing matches "{query}"
      </div>
      <div style={{ fontSize: 12, color: 'var(--text-mute)', marginBottom: 10 }}>
        Try a layer name (e.g. "hair", "boots") or an item.
      </div>
      <Button size="sm" variant="outline" onClick={onClear} icon="x">Clear search</Button>
    </div>
  );
}

Object.assign(window, { LeftPanel, SearchEmpty });
