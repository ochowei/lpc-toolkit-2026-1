// Small UI primitives used across the editor: Button, Icon, Badge, Swatch,
// Chip, Tooltip, Skeleton, Slider, SegmentedControl. Tailwind-free —
// classes resolve against tokens declared in styles.css.

const { useState: useStateP, useRef: useRefP, useEffect: useEffectP } = React;

function Icon({ name, size = 14, stroke = 1.6, style }) {
  const props = {
    width: size, height: size, viewBox: '0 0 24 24',
    fill: 'none', stroke: 'currentColor',
    strokeWidth: stroke, strokeLinecap: 'round', strokeLinejoin: 'round',
    style: { display: 'block', flex: '0 0 auto', ...(style || {}) },
  };
  const paths = {
    search: <><circle cx="11" cy="11" r="7"/><path d="m20 20-3-3"/></>,
    play: <path d="M7 5v14l12-7z" fill="currentColor" stroke="none"/>,
    pause: <><rect x="6" y="5" width="4" height="14" fill="currentColor" stroke="none"/><rect x="14" y="5" width="4" height="14" fill="currentColor" stroke="none"/></>,
    dice: <><rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="8" cy="8" r="1" fill="currentColor"/><circle cx="16" cy="16" r="1" fill="currentColor"/><circle cx="12" cy="12" r="1" fill="currentColor"/></>,
    reset: <><path d="M3 12a9 9 0 1 0 3-6.7"/><path d="M3 4v5h5"/></>,
    download: <><path d="M12 4v12"/><path d="m7 11 5 5 5-5"/><path d="M5 20h14"/></>,
    link: <><path d="M10 14a5 5 0 0 0 7 0l3-3a5 5 0 1 0-7-7l-1 1"/><path d="M14 10a5 5 0 0 0-7 0l-3 3a5 5 0 1 0 7 7l1-1"/></>,
    moon: <path d="M21 13A9 9 0 1 1 11 3a7 7 0 0 0 10 10z"/>,
    sun: <><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"/></>,
    chevron: <path d="m6 9 6 6 6-6"/>,
    chevronRight: <path d="m9 6 6 6-6 6"/>,
    x: <><path d="m6 6 12 12"/><path d="m18 6-12 12"/></>,
    plus: <><path d="M12 5v14"/><path d="M5 12h14"/></>,
    minus: <path d="M5 12h14"/>,
    zoomIn: <><circle cx="11" cy="11" r="7"/><path d="m20 20-3-3"/><path d="M11 8v6M8 11h6"/></>,
    zoomOut: <><circle cx="11" cy="11" r="7"/><path d="m20 20-3-3"/><path d="M8 11h6"/></>,
    info: <><circle cx="12" cy="12" r="9"/><path d="M12 8h.01"/><path d="M11 12h1v4h1"/></>,
    warning: <><path d="M10.3 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.7 3.86a2 2 0 0 0-3.4 0z"/><path d="M12 9v4"/><path d="M12 17h.01"/></>,
    grip: <><circle cx="9" cy="6" r="1" fill="currentColor"/><circle cx="9" cy="12" r="1" fill="currentColor"/><circle cx="9" cy="18" r="1" fill="currentColor"/><circle cx="15" cy="6" r="1" fill="currentColor"/><circle cx="15" cy="12" r="1" fill="currentColor"/><circle cx="15" cy="18" r="1" fill="currentColor"/></>,
    eye: <><path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></>,
    eyeOff: <><path d="M9.88 5.07A10.4 10.4 0 0 1 12 5c6 0 10 7 10 7a17 17 0 0 1-3 3.7"/><path d="M6.6 6.6A17 17 0 0 0 2 12s4 7 10 7c1.7 0 3.3-.4 4.7-1.1"/><path d="m2 2 20 20"/></>,
    compass: <><circle cx="12" cy="12" r="9"/><path d="m16 8-6 2-2 6 6-2 2-6z"/></>,
    layers: <><path d="m12 2 10 6-10 6L2 8l10-6z"/><path d="m2 16 10 6 10-6"/></>,
    code: <><path d="m16 18 6-6-6-6"/><path d="m8 6-6 6 6 6"/></>,
    trash: <><path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></>,
    palette: <><circle cx="12" cy="12" r="9"/><circle cx="8" cy="9" r="1" fill="currentColor"/><circle cx="16" cy="9" r="1" fill="currentColor"/><circle cx="17" cy="14" r="1" fill="currentColor"/><circle cx="11" cy="17" r="1" fill="currentColor"/></>,
    sparkles: <><path d="M12 3v4M12 17v4M5 12H1M23 12h-4M6 6l2 2M16 16l2 2M6 18l2-2M16 8l2-2"/></>,
    check: <path d="M5 12l5 5L20 7"/>,
    file: <><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/></>,
    gif: <><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M7 12h2v3M14 12v3M11 9v6"/></>,
    grid: <><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></>,
    arrowLeft: <path d="M19 12H5M12 19l-7-7 7-7"/>,
    settings: <><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-1.8-.3 1.6 1.6 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.6 1.6 0 0 0-1-1.5 1.6 1.6 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.6 1.6 0 0 0 .3-1.8 1.6 1.6 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.6 1.6 0 0 0 1.5-1 1.6 1.6 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.6 1.6 0 0 0 1.8.3h0a1.6 1.6 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.6 1.6 0 0 0 1 1.5 1.6 1.6 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0-.3 1.8v0a1.6 1.6 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.6 1.6 0 0 0-1.5 1z"/></>,
    share: <><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="m8.6 13.5 6.8 4M15.4 6.5l-6.8 4"/></>,
    spinner: <><path d="M12 2v4" opacity="1"/><path d="m16.24 7.76 2.83-2.83" opacity=".85"/><path d="M18 12h4" opacity=".7"/><path d="m16.24 16.24 2.83 2.83" opacity=".55"/><path d="M12 18v4" opacity=".4"/><path d="m7.76 16.24-2.83 2.83" opacity=".3"/><path d="M2 12h4" opacity=".2"/><path d="m7.76 7.76-2.83-2.83" opacity=".15"/></>,
  };
  return <svg {...props}>{paths[name] || null}</svg>;
}

// --- Button ---
function Button({ variant = 'default', size = 'md', icon, iconRight, children, onClick, disabled, active, full, title, style }) {
  const base = {
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    gap: 6, fontFamily: 'var(--font-sans)', fontWeight: 500,
    border: '1px solid var(--border)', borderRadius: 'var(--r-2)',
    cursor: disabled ? 'not-allowed' : 'pointer',
    transition: 'background .12s, border-color .12s, color .12s',
    whiteSpace: 'nowrap', userSelect: 'none',
    opacity: disabled ? 0.5 : 1, width: full ? '100%' : 'auto',
  };
  const sizes = {
    sm: { padding: '4px 8px', fontSize: 12, height: 24, borderRadius: 4 },
    md: { padding: '6px 10px', fontSize: 13, height: 30 },
    lg: { padding: '8px 14px', fontSize: 14, height: 36 },
    icon: { width: 28, height: 28, padding: 0 },
    iconLg: { width: 36, height: 36, padding: 0 },
  };
  const variants = {
    default: { background: 'var(--surface-2)', color: 'var(--text)', borderColor: 'var(--border)' },
    ghost: { background: 'transparent', color: 'var(--text-2)', borderColor: 'transparent' },
    primary: { background: 'var(--accent)', color: 'var(--accent-ink)', borderColor: 'var(--accent)', fontWeight: 600 },
    outline: { background: 'transparent', color: 'var(--text)', borderColor: 'var(--border-strong)' },
    danger: { background: 'transparent', color: 'var(--danger)', borderColor: 'var(--border)' },
  };
  if (active) {
    if (variant === 'ghost') variants.ghost = { background: 'var(--surface-3)', color: 'var(--text)', borderColor: 'transparent' };
  }
  const hover = useStateP(false);
  return (
    <button
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
      title={title}
      onMouseEnter={() => hover[1](true)} onMouseLeave={() => hover[1](false)}
      style={{
        ...base, ...sizes[size], ...variants[variant],
        ...(hover[0] && !disabled ? {
          background: variant === 'primary' ? 'oklch(from var(--accent) calc(l + 0.04) c h)'
            : variant === 'ghost' ? 'var(--surface-2)'
            : 'var(--surface-3)',
        } : {}),
        ...(active ? { background: 'var(--surface-3)', color: 'var(--text)' } : {}),
        ...style,
      }}
    >
      {icon && <Icon name={icon} size={size === 'sm' ? 12 : 14} />}
      {children}
      {iconRight && <Icon name={iconRight} size={size === 'sm' ? 12 : 14} />}
    </button>
  );
}

// License badge
function LicenseBadge({ license, dense }) {
  const data = window.LPC_DATA.LICENSES[license] || { id: 'cc0', short: license };
  const palette = {
    gpl:    ['var(--lic-gpl-bg)', 'var(--lic-gpl-fg)'],
    ccby:   ['var(--lic-ccby-bg)', 'var(--lic-ccby-fg)'],
    ccbysa: ['var(--lic-ccbysa-bg)', 'var(--lic-ccbysa-fg)'],
    ogaby:  ['var(--lic-ogaby-bg)', 'var(--lic-ogaby-fg)'],
    cc0:    ['var(--surface-3)', 'var(--text-2)'],
  }[data.id] || ['var(--surface-3)', 'var(--text-2)'];
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      padding: dense ? '1px 5px' : '2px 6px',
      borderRadius: 3, fontSize: dense ? 10 : 11, fontWeight: 600,
      letterSpacing: '0.04em', textTransform: 'uppercase',
      fontFamily: 'var(--font-mono)',
      background: palette[0], color: palette[1],
      whiteSpace: 'nowrap',
    }}>{data.short}</span>
  );
}

// Tiny color swatch ramp (used inline in the picker)
function RampSwatch({ ramp: rampKey, size = 14, selected, onClick, title }) {
  const r = window.LPC_DATA.RAMPS[rampKey];
  if (!r) return null;
  return (
    <button
      onClick={onClick}
      title={title || r.name}
      style={{
        display: 'flex', flexDirection: 'column', cursor: 'pointer', padding: 2,
        background: 'transparent', border: '1px solid ' + (selected ? 'var(--accent)' : 'transparent'),
        borderRadius: 4, gap: 0,
      }}
    >
      <div style={{ display: 'flex', borderRadius: 2, overflow: 'hidden', border: '1px solid var(--border)' }}>
        {r.swatches.map((c, i) => (
          <span key={i} style={{ width: size, height: size, background: c, display: 'block' }} />
        ))}
      </div>
    </button>
  );
}

// Skeleton
function Skeleton({ w, h, r = 4 }) {
  return (
    <span style={{
      display: 'inline-block', width: w, height: h, borderRadius: r,
      background: 'linear-gradient(90deg, var(--surface-2) 0%, var(--surface-3) 50%, var(--surface-2) 100%)',
      backgroundSize: '200% 100%',
      animation: 'lpc-pulse 1.4s ease-in-out infinite',
    }} />
  );
}

// Inject keyframes once
if (typeof document !== 'undefined' && !document.getElementById('lpc-anim-css')) {
  const s = document.createElement('style');
  s.id = 'lpc-anim-css';
  s.textContent = `
    @keyframes lpc-pulse { 0%{background-position:200% 0} 100%{background-position:-200% 0} }
    @keyframes lpc-spin { to { transform: rotate(360deg); } }
    .lpc-spin { animation: lpc-spin 1s linear infinite; }
  `;
  document.head.appendChild(s);
}

Object.assign(window, { Icon, Button, LicenseBadge, RampSwatch, Skeleton });
