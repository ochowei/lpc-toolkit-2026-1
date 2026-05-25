// Component inventory — annotated table of every named React component the
// design implies, with key props and states.

function InventoryCard({ theme = 'dark' }) {
  return (
    <div className={`lpc ${theme}`} style={{
      width: '100%', minHeight: '100%',
      background: 'var(--bg-app)', padding: 32,
      color: 'var(--text)',
    }}>
      <header style={{ marginBottom: 20 }}>
        <div className="ttu" style={{ fontSize: 11, color: 'var(--text-mute)', fontWeight: 600 }}>handoff</div>
        <h2 style={{ margin: '4px 0 0', fontSize: 24, fontWeight: 700, letterSpacing: '-0.015em' }}>Component inventory</h2>
        <p style={{ margin: '6px 0 0', color: 'var(--text-2)', fontSize: 13, maxWidth: 640 }}>
          Function-component names, purpose, and the key props/states each implies. Every visual element in
          this design maps to one of these. Built on shadcn/ui primitives where noted.
        </p>
      </header>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        {INVENTORY.map(group => (
          <section key={group.title} style={{
            background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8,
            padding: 14,
          }}>
            <h3 style={{ margin: '0 0 10px', fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>
              {group.title}
              <span style={{ marginLeft: 8, fontSize: 10, color: 'var(--text-mute)', fontWeight: 500, fontFamily: 'var(--font-mono)' }}>{group.items.length}</span>
            </h3>
            <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 10 }}>
              {group.items.map(c => (
                <li key={c.name} style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr',
                  gap: 4,
                  paddingBottom: 8, borderBottom: '1px solid var(--border)',
                }}>
                  <div className="row" style={{ gap: 8, alignItems: 'baseline', flexWrap: 'wrap' }}>
                    <code className="mono" style={{ fontSize: 12, color: 'var(--accent)', fontWeight: 600 }}>{c.name}</code>
                    {c.base && <span className="mono" style={{ fontSize: 10, color: 'var(--text-mute)' }}>{c.base}</span>}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text-2)' }}>{c.purpose}</div>
                  {c.props && (
                    <div style={{ fontSize: 11, color: 'var(--text-mute)', fontFamily: 'var(--font-mono)' }}>
                      {c.props}
                    </div>
                  )}
                  {c.states && (
                    <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                      {c.states.map(s => (
                        <span key={s} style={{
                          fontSize: 10, fontFamily: 'var(--font-mono)',
                          padding: '1px 5px', background: 'var(--surface-3)',
                          color: 'var(--text-2)', borderRadius: 3,
                        }}>{s}</span>
                      ))}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </div>
  );
}

const INVENTORY = [
  {
    title: 'App shell',
    items: [
      { name: 'AppShell',  purpose: '3-region layout (left/center/right) on desktop; tab-based on mobile.',
        props: 'theme: "dark"|"light";  density?: "compact"|"comfortable"' },
      { name: 'TopBar',    purpose: 'Wordmark, project ribbon (name + URL hash), theme toggle, share.',
        props: 'theme; setTheme; label; hash; onShare()' },
      { name: 'ThemeToggle', base: '↳ shadcn/ui Button', purpose: 'Light/dark switch — persists to localStorage.',
        props: 'value: "dark"|"light"; onChange(v)', states: ['hover','focus'] },
    ],
  },
  {
    title: 'Picker (left)',
    items: [
      { name: 'BodyTypeGrid',   purpose: '3×2 segmented control for body types.',
        props: 'value; onChange(id); options: BodyType[]', states: ['selected','hover','focus'] },
      { name: 'CategorySearch', base: '↳ shadcn/ui Input', purpose: 'Searches across categories and item names.',
        props: 'value; onChange; placeholder; shortcut: "⌘K"', states: ['empty','typing','no-match'] },
      { name: 'CategorySection', base: '↳ shadcn/ui Accordion.Item', purpose: 'Collapsible section per layer with count badge + clear.',
        props: 'cat: Category; items: Item[]; open; onToggle; selectedId', states: ['collapsed','expanded','empty'] },
      { name: 'ItemTile',  purpose: 'Grid tile with pixel thumb + name; surfaces error chip when failed.',
        props: 'item; selected; error?; onClick()', states: ['default','selected','error','hover','focus'] },
      { name: 'ItemConfig', purpose: 'Inline panel under a selected item — variant chips + recolor swatch row.',
        props: 'item; variant; ramp; onVariantChange; onRampChange' },
      { name: 'RampSwatch', purpose: '4-cell horizontal ramp swatch; tooltip with the named palette.',
        props: 'rampKey; selected; onClick(); title' },
      { name: 'VariantChip', base: '↳ shadcn/ui Toggle', purpose: 'Pill chip for choosing item sub-variant.',
        props: 'value; selected; onClick()', states: ['selected','hover','focus','disabled'] },
    ],
  },
  {
    title: 'Preview (center)',
    items: [
      { name: 'PixelCharacter', purpose: 'Canvas-based animated character renderer. image-rendering: pixelated.',
        props: 'state: EditorState; scale: 1|2|4|8; playing; frameLocked?; onFrameChange?' },
      { name: 'AnimationSelect', base: '↳ shadcn/ui Tabs', purpose: 'Horizontal scrollable list of animation IDs.',
        props: 'value; onChange; options: Animation[]', states: ['selected','hover','focus','scroll'] },
      { name: 'DirectionPad', purpose: '3×3 compass (N/S/E/W) for facing direction.',
        props: 'value: "N"|"S"|"E"|"W"; onChange(v)' },
      { name: 'FrameScrubber', base: '↳ shadcn/ui Slider', purpose: 'Per-frame discrete scrubber tied to the active animation.',
        props: 'frames; frame; onChange(f)', states: ['playing','paused','dragging'] },
      { name: 'ZoomStepper', purpose: '1×/2×/4×/8× steps + inc/dec.',
        props: 'value; onChange(z); steps: [1,2,4,8]' },
      { name: 'FpsControl', purpose: 'Numeric input bound to the active animation.',
        props: 'value; onChange(fps); min=1; max=30' },
    ],
  },
  {
    title: 'Attribution & export (right)',
    items: [
      { name: 'AttributionPanel', purpose: 'Always-visible credit list + effective-license hero card.',
        props: 'layers: ActiveLayer[]; effective: License' },
      { name: 'LicenseBadge', base: '↳ shadcn/ui Badge', purpose: 'Color-coded badge per license family (GPL/CC-BY/CC-BY-SA/OGA-BY/CC0).',
        props: 'license: string; dense?: boolean' },
      { name: 'AttributionRow', purpose: 'Single layer row: category eyebrow, item name, author, source link, license badge.',
        props: 'cat; item' },
      { name: 'EffectiveLicenseCard', purpose: 'Hero card that computes the strictest license across active layers.',
        props: 'license; count' },
      { name: 'ExportPanel', purpose: 'Spritesheet PNG, current strip, animated GIF, share-link copy.',
        props: 'onExport(kind); shareUrl; dimensions' },
      { name: 'ShareLinkRow', base: '↳ shadcn/ui Input + Button', purpose: 'Truncated URL + copy.',
        props: 'url; onCopy()', states: ['idle','copied'] },
    ],
  },
  {
    title: 'Mobile',
    items: [
      { name: 'MobileEditor', purpose: 'Single-screen shell with bottom tab bar.',
        props: 'theme; initialState; tab' },
      { name: 'BottomTabs',  purpose: 'Preview / Layers / Credits / Export.',
        props: 'tab; setTab', states: ['active','inactive'] },
      { name: 'MobilePreview',  purpose: 'Big preview + anim chips + transport. Direction pad floats top-right.' },
      { name: 'MobileLayers',  purpose: 'Search + collapsible accordion list (DOM-native <details>).' },
      { name: 'LayerSheet', base: '↳ shadcn/ui Sheet (bottom)', purpose: 'Optional alternative: bottom-sheet picker over the preview.',
        props: 'open; onClose; cat' },
    ],
  },
  {
    title: 'Feedback',
    items: [
      { name: 'CatalogLoading', base: '↳ shadcn/ui Skeleton', purpose: 'Skeleton + progress bar while sprite catalog indexes.', states: ['loading'] },
      { name: 'EmptyCharacter', purpose: 'Bare body only — shows a coachmark to nudge dressing.', states: ['empty'] },
      { name: 'SearchNoResults', purpose: 'Empty-state card inside left panel when nothing matches.', props: 'query; onClear()' },
      { name: 'LayerErrorChip', purpose: 'Inline error on item tile + sidebar callout with retry/pick-another.',
        props: 'cat; itemId; reason; onRetry()', states: ['error'] },
      { name: 'CopiedToast', base: '↳ shadcn/ui Toast', purpose: 'Fires when share URL is copied to clipboard.', states: ['idle','visible'] },
    ],
  },
];

Object.assign(window, { InventoryCard, INVENTORY });
