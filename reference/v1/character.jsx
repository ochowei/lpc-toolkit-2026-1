// Procedural pixel-art character renderer.
// Draws a 24×32 character on a canvas using the layer state from the editor.
// Not pixel-perfect to LPC's 64×64 spec but visually conveys the system —
// the editor design treats these as placeholders for real LPC sprite data.

const { useEffect, useRef, useState } = React;

const RAMPS = window.LPC_DATA.RAMPS;

// Map ramp key → 4 colors [shadow, mid, light, hi]
function ramp(key) {
  return (RAMPS[key] || RAMPS.skin_ivory).swatches;
}

// Pixel character canvas. Width/height are CSS-level pixel-art logical
// dimensions (the canvas backing is also that size, the CSS `width` scales
// it crisply via image-rendering: pixelated).
//
// Props:
//   state            current editor state
//   scale            visual zoom (1..8)
//   playing          bool
//   frameLocked      number | null — if set, render this frame only
//   onFrameChange    (frame, total) => void   (for scrubber sync)
//   size             'lg' | 'sm' (sm = card thumbnails)
function PixelCharacter({ state, scale = 4, playing = true, frameLocked = null, onFrameChange, size = 'lg' }) {
  const W = 32, H = 32;
  const canvasRef = useRef(null);
  const [frame, setFrame] = useState(0);

  // Resolve the active animation spec
  const anim = window.LPC_DATA.ANIMATIONS.find(a => a.id === state.anim) || window.LPC_DATA.ANIMATIONS[0];

  // Animate
  useEffect(() => {
    if (!playing || frameLocked !== null) {
      const f = frameLocked !== null ? frameLocked : 0;
      setFrame(f);
      return;
    }
    let raf, last = performance.now(), acc = 0, f = 0;
    const ms = 1000 / (state.fps || anim.fps);
    const loop = (t) => {
      acc += t - last; last = t;
      while (acc >= ms) {
        acc -= ms;
        f = (f + 1) % anim.frames;
        setFrame(f);
        onFrameChange && onFrameChange(f, anim.frames);
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [playing, frameLocked, anim.id, anim.frames, state.fps, anim.fps]);

  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    c.width = W; c.height = H;
    const ctx = c.getContext('2d');
    ctx.clearRect(0, 0, W, H);
    drawCharacter(ctx, state, frame, anim, W, H);
  }, [state, frame, anim.id]);

  return (
    <canvas
      ref={canvasRef}
      width={W}
      height={H}
      style={{
        width: W * scale,
        height: H * scale,
        display: 'block',
        imageRendering: 'pixelated',
      }}
    />
  );
}

// Drawing routine. Resolves chosen items + palettes to actual pixels.
function drawCharacter(ctx, st, frame, anim, W, H) {
  const dir = st.dir || 'S';
  const facing = { S: 0, E: 1, N: 2, W: 3 }[dir] || 0;

  // Animation offsets — small movement to convey animation
  const bob = computeBob(anim.id, frame, anim.frames);
  const armSwing = computeArmSwing(anim.id, frame, anim.frames);
  const legSwing = computeLegSwing(anim.id, frame, anim.frames);

  const cx = 16; // center
  const baseY = 22 + bob; // foot baseline

  const skin = ramp(st.palettes.body || 'skin_ivory');
  const hair = ramp(st.palettes.hair || 'hair_brown');
  const shirt = ramp(st.palettes.torso || 'cloth_blue');
  const pants = ramp(st.palettes.legs || 'cloth_brown');
  const boots = ramp(st.palettes.feet || 'cloth_brown');
  const eyes = ramp(st.palettes.eyes || 'eyes_blue');
  const cape = ramp(st.palettes.cape || 'cloth_red');
  const metal = ramp(st.palettes.weapon || 'metal_steel');
  const shieldR = ramp(st.palettes.shield || 'metal_iron');

  // Cape (behind body) — only if present and facing S/E/W
  if (st.layers.cape && dir !== 'N') {
    px(ctx, cx-3, baseY-13, 6, 10, cape[1]);
    px(ctx, cx-3, baseY-13, 1, 10, cape[0]);
    px(ctx, cx+2, baseY-13, 1, 10, cape[0]);
    px(ctx, cx-2, baseY-3, 4, 1, cape[0]);
    // collar
    px(ctx, cx-2, baseY-14, 4, 1, cape[2]);
  }

  // Legs ----
  const legBaseY = baseY - 4;
  // left leg
  px(ctx, cx-2, legBaseY + Math.max(0,legSwing), 2, 4, pants[1]);
  px(ctx, cx-2, legBaseY + Math.max(0,legSwing), 1, 4, pants[0]);
  // right leg
  px(ctx, cx, legBaseY + Math.max(0,-legSwing), 2, 4, pants[1]);
  px(ctx, cx+1, legBaseY + Math.max(0,-legSwing), 1, 4, pants[0]);

  // Boots
  if (st.layers.feet) {
    px(ctx, cx-2, legBaseY+4 + Math.max(0,legSwing), 2, 1, boots[1]);
    px(ctx, cx-2, legBaseY+4 + Math.max(0,legSwing), 1, 1, boots[0]);
    px(ctx, cx, legBaseY+4 + Math.max(0,-legSwing), 2, 1, boots[1]);
    px(ctx, cx+1, legBaseY+4 + Math.max(0,-legSwing), 1, 1, boots[0]);
  }

  // Torso ----
  const torsoY = baseY - 12;
  // shirt body
  px(ctx, cx-3, torsoY, 6, 8, shirt[1]);
  px(ctx, cx-3, torsoY, 1, 8, shirt[0]);   // left shade
  px(ctx, cx+2, torsoY, 1, 8, shirt[0]);   // right shade
  px(ctx, cx-3, torsoY, 6, 1, shirt[2]);   // top highlight (collar)
  // belt if present
  if (st.layers.belt) {
    px(ctx, cx-3, torsoY+5, 6, 1, ramp(st.palettes.belt || 'cloth_brown')[0]);
    px(ctx, cx,   torsoY+5, 1, 1, metal[2]); // buckle
  }
  // armor overlay
  if (st.layers.torso === 'plate' || st.layers.torso === 'chainmail') {
    const m = metal;
    px(ctx, cx-3, torsoY, 6, 4, m[1]);
    px(ctx, cx-3, torsoY, 1, 4, m[0]);
    px(ctx, cx+2, torsoY, 1, 4, m[0]);
    px(ctx, cx-2, torsoY+1, 4, 1, m[2]);
  }
  // Shoulders pauldron
  if (st.layers.shoulders) {
    px(ctx, cx-4, torsoY-1, 2, 2, metal[1]);
    px(ctx, cx-4, torsoY-1, 1, 2, metal[0]);
    px(ctx, cx+2, torsoY-1, 2, 2, metal[1]);
    px(ctx, cx+3, torsoY-1, 1, 2, metal[0]);
  }

  // Arms ----
  const armY = torsoY + 1;
  // left arm (swings opposite to legs)
  px(ctx, cx-4, armY - Math.min(0, armSwing), 1, 5, shirt[1]);
  // right arm
  px(ctx, cx+3, armY - Math.min(0, -armSwing), 1, 5, shirt[1]);
  // Hands
  px(ctx, cx-4, armY+5 - Math.min(0, armSwing), 1, 1, skin[2]);
  px(ctx, cx+3, armY+5 - Math.min(0, -armSwing), 1, 1, skin[2]);

  // Weapon (right hand)
  if (st.layers.weapon) {
    drawWeapon(ctx, st.layers.weapon, cx+3, armY+5 - Math.min(0, -armSwing), metal, hair, dir, anim, frame);
  }
  // Shield (left hand)
  if (st.layers.shield) {
    drawShield(ctx, st.layers.shield, cx-4, armY+1 - Math.min(0, armSwing), shieldR);
  }

  // Head ----
  const headY = torsoY - 7;
  // neck
  px(ctx, cx-1, headY+6, 2, 1, skin[0]);
  // head skin
  px(ctx, cx-3, headY, 6, 6, skin[2]);
  px(ctx, cx-3, headY+5, 6, 1, skin[1]); // jaw shading
  px(ctx, cx-3, headY, 1, 6, skin[1]);   // left shade
  px(ctx, cx+2, headY, 1, 6, skin[1]);   // right shade
  // ears
  if (dir === 'S' || dir === 'N') {
    px(ctx, cx-4, headY+2, 1, 2, skin[1]);
    px(ctx, cx+3, headY+2, 1, 2, skin[1]);
  }

  // Eyes (only S/E/W face)
  if (dir !== 'N' && st.layers.eyes) {
    if (dir === 'S') {
      px(ctx, cx-2, headY+3, 1, 1, eyes[1]);
      px(ctx, cx+1, headY+3, 1, 1, eyes[1]);
    } else if (dir === 'E') {
      px(ctx, cx+1, headY+3, 1, 1, eyes[1]);
    } else if (dir === 'W') {
      px(ctx, cx-2, headY+3, 1, 1, eyes[1]);
    }
  }
  // Mouth / expression
  if (dir === 'S' && st.layers.expression) {
    const x = cx-1, y = headY+4;
    if (st.layers.expression === 'smile') {
      px(ctx, x, y+1, 2, 1, skin[0]);
    } else if (st.layers.expression === 'frown') {
      px(ctx, x, y, 2, 1, skin[0]);
    } else if (st.layers.expression === 'angry') {
      px(ctx, cx-2, headY+2, 1, 1, hair[0]);
      px(ctx, cx+2, headY+2, 1, 1, hair[0]);
      px(ctx, x, y+1, 2, 1, skin[0]);
    } else {
      px(ctx, x, y+1, 2, 1, skin[0]);
    }
  }

  // Hair (drawn on top of head)
  if (st.layers.hair) {
    drawHair(ctx, st.layers.hair, cx, headY, hair, dir);
  }
  // Facial hair
  if (st.layers.facial && st.layers.facial !== 'none' && (dir === 'S' || dir === 'E' || dir === 'W')) {
    drawFacial(ctx, st.layers.facial, cx, headY, hair, dir);
  }
  // Hat
  if (st.layers.head) {
    drawHat(ctx, st.layers.head, cx, headY, hair, dir);
  }
}

function drawHair(ctx, kind, cx, headY, hair, dir) {
  const top = headY - 1;
  switch (kind) {
    case 'spiked':
      px(ctx, cx-3, top, 6, 1, hair[0]);
      px(ctx, cx-3, top-1, 1, 1, hair[1]);
      px(ctx, cx-1, top-1, 1, 1, hair[1]);
      px(ctx, cx+1, top-1, 1, 1, hair[1]);
      px(ctx, cx+3, top-1, 1, 1, hair[1]);
      break;
    case 'long': case 'shoulderlen':
      px(ctx, cx-3, top, 6, 2, hair[1]);
      px(ctx, cx-4, headY+1, 1, 5, hair[1]);
      px(ctx, cx+3, headY+1, 1, 5, hair[1]);
      px(ctx, cx-3, top, 1, 2, hair[0]);
      px(ctx, cx+2, top, 1, 2, hair[0]);
      break;
    case 'ponytail':
      px(ctx, cx-3, top, 6, 2, hair[1]);
      px(ctx, cx-3, top, 6, 1, hair[0]);
      if (dir !== 'N') px(ctx, cx+3, headY+1, 1, 4, hair[1]);
      break;
    case 'bunches':
      px(ctx, cx-3, top, 6, 2, hair[1]);
      px(ctx, cx-4, headY+1, 1, 2, hair[1]);
      px(ctx, cx+3, headY+1, 1, 2, hair[1]);
      break;
    case 'buns':
      px(ctx, cx-3, top, 6, 1, hair[1]);
      px(ctx, cx-3, top-1, 2, 1, hair[1]);
      px(ctx, cx+1, top-1, 2, 1, hair[1]);
      break;
    case 'mohawk':
      px(ctx, cx-1, top-2, 2, 3, hair[1]);
      px(ctx, cx-1, top-2, 1, 3, hair[0]);
      break;
    case 'curly':
      px(ctx, cx-3, top, 6, 2, hair[1]);
      px(ctx, cx-4, top, 1, 2, hair[1]);
      px(ctx, cx+3, top, 1, 2, hair[1]);
      px(ctx, cx-3, top, 1, 2, hair[2]);
      break;
    case 'bedhead':
      px(ctx, cx-3, top, 6, 1, hair[1]);
      px(ctx, cx-2, top-1, 1, 1, hair[0]);
      px(ctx, cx+1, top-1, 2, 1, hair[1]);
      break;
    case 'pixie':
      px(ctx, cx-3, top, 6, 1, hair[1]);
      px(ctx, cx-3, top, 6, 1, hair[0]);
      px(ctx, cx-3, top+1, 1, 1, hair[1]);
      px(ctx, cx+2, top+1, 1, 1, hair[1]);
      break;
    case 'bangs':
      px(ctx, cx-3, top, 6, 1, hair[1]);
      if (dir === 'S') px(ctx, cx-2, headY, 4, 1, hair[0]);
      break;
    case 'topknot':
      px(ctx, cx-1, top-2, 2, 1, hair[1]);
      px(ctx, cx-2, top-1, 4, 1, hair[1]);
      px(ctx, cx-3, top, 6, 1, hair[0]);
      break;
    case 'swoop':
      px(ctx, cx-3, top, 6, 1, hair[1]);
      px(ctx, cx, top, 3, 2, hair[1]);
      break;
    case 'page':
      px(ctx, cx-3, top, 6, 2, hair[1]);
      px(ctx, cx-3, top, 1, 2, hair[0]);
      px(ctx, cx+2, top, 1, 2, hair[0]);
      break;
    case 'mop':
      px(ctx, cx-3, top, 6, 2, hair[1]);
      px(ctx, cx-4, top+1, 1, 2, hair[1]);
      px(ctx, cx+3, top+1, 1, 2, hair[1]);
      break;
    default: // plain
      px(ctx, cx-3, top, 6, 1, hair[1]);
      px(ctx, cx-3, top, 1, 2, hair[0]);
      px(ctx, cx+2, top, 1, 2, hair[0]);
  }
}

function drawFacial(ctx, kind, cx, headY, hair, dir) {
  if (kind === 'stubble' || kind === 'sideburns') {
    px(ctx, cx-3, headY+4, 1, 1, hair[0]);
    px(ctx, cx+2, headY+4, 1, 1, hair[0]);
  } else if (kind === 'goatee') {
    px(ctx, cx-1, headY+5, 2, 1, hair[1]);
    px(ctx, cx, headY+6, 1, 1, hair[1]);
  } else if (kind === 'mustache') {
    px(ctx, cx-1, headY+4, 2, 1, hair[1]);
  } else if (kind === 'full') {
    px(ctx, cx-2, headY+4, 4, 2, hair[1]);
    px(ctx, cx-1, headY+6, 2, 1, hair[1]);
  }
}

function drawHat(ctx, kind, cx, headY, hair, dir) {
  // Simple cap
  px(ctx, cx-3, headY-1, 6, 1, '#3a2a14');
  px(ctx, cx-4, headY-1, 8, 1, '#3a2a14');
  px(ctx, cx-2, headY-3, 4, 2, '#5a3e1a');
  px(ctx, cx-2, headY-3, 1, 2, '#3a2a14');
}

function drawWeapon(ctx, kind, hx, hy, metal, wood, dir, anim, frame) {
  const offX = anim.id === 'slash' ? Math.min(2, frame) : 0;
  const wx = hx + 1 + offX, wy = hy - 3;
  switch (kind) {
    case 'sword':
      px(ctx, wx, wy-3, 1, 6, metal[2]);
      px(ctx, wx, wy-4, 1, 1, metal[3]);
      px(ctx, wx-1, wy+3, 3, 1, '#7a4a18'); // crossguard
      px(ctx, wx, wy+4, 1, 1, '#5a3a14'); // hilt
      break;
    case 'dagger':
      px(ctx, wx, wy, 1, 3, metal[2]);
      px(ctx, wx-1, wy+3, 3, 1, '#7a4a18');
      break;
    case 'axe':
      px(ctx, wx, wy, 1, 5, '#7a4a18');
      px(ctx, wx+1, wy-1, 2, 3, metal[2]);
      px(ctx, wx+1, wy-1, 1, 3, metal[1]);
      break;
    case 'spear':
      px(ctx, wx, wy-5, 1, 9, '#7a4a18');
      px(ctx, wx, wy-7, 1, 2, metal[2]);
      break;
    case 'mace':
      px(ctx, wx, wy, 1, 5, '#7a4a18');
      px(ctx, wx-1, wy-2, 3, 3, metal[1]);
      px(ctx, wx-1, wy-2, 1, 3, metal[0]);
      break;
    case 'bow':
      px(ctx, wx, wy-3, 1, 7, '#7a4a18');
      px(ctx, wx-1, wy-2, 1, 1, '#7a4a18');
      px(ctx, wx-1, wy+3, 1, 1, '#7a4a18');
      px(ctx, wx+1, wy-2, 1, 6, '#bcbcbc'); // string
      break;
    case 'crossbow':
      px(ctx, wx-1, wy, 3, 1, '#7a4a18');
      px(ctx, wx, wy+1, 1, 3, '#7a4a18');
      break;
    case 'staff':
      px(ctx, wx, wy-4, 1, 8, '#7a4a18');
      px(ctx, wx-1, wy-5, 3, 1, metal[2]);
      px(ctx, wx, wy-6, 1, 1, metal[3]);
      break;
    case 'wand':
      px(ctx, wx, wy-1, 1, 4, '#7a4a18');
      px(ctx, wx, wy-2, 1, 1, metal[3]);
      break;
    case 'pickaxe':
      px(ctx, wx, wy-2, 1, 6, '#7a4a18');
      px(ctx, wx-1, wy-3, 3, 1, metal[1]);
      break;
  }
}

function drawShield(ctx, kind, sx, sy, m) {
  switch (kind) {
    case 'buckler':
      px(ctx, sx-1, sy, 2, 3, m[1]);
      px(ctx, sx-1, sy, 1, 3, m[0]);
      px(ctx, sx, sy+1, 1, 1, m[2]);
      break;
    case 'kite':
      px(ctx, sx-1, sy, 2, 5, m[1]);
      px(ctx, sx-1, sy, 1, 5, m[0]);
      px(ctx, sx, sy+5, 1, 1, m[0]);
      break;
    case 'tower':
      px(ctx, sx-1, sy-1, 2, 7, m[1]);
      px(ctx, sx-1, sy-1, 1, 7, m[0]);
      px(ctx, sx, sy, 1, 2, m[2]);
      break;
    case 'round':
      px(ctx, sx-1, sy+1, 2, 3, m[1]);
      px(ctx, sx-1, sy+2, 1, 1, m[2]);
      px(ctx, sx, sy+1, 1, 1, m[2]);
      break;
  }
}

function px(ctx, x, y, w, h, color) {
  ctx.fillStyle = color;
  ctx.fillRect(x | 0, y | 0, w, h);
}

function computeBob(animId, f, total) {
  if (animId === 'idle') return f % 2 === 0 ? 0 : -1;
  if (animId === 'walk') return (f % 2 === 0) ? 0 : -1;
  if (animId === 'run')  return (f % 2 === 0) ? -1 : 0;
  if (animId === 'jump') return f < 3 ? -f : -(5 - f);
  if (animId === 'cast') return -1;
  return 0;
}
function computeArmSwing(animId, f, total) {
  if (animId === 'walk' || animId === 'run') return Math.sin((f/total) * Math.PI * 2) * 1.5;
  if (animId === 'slash') return -f;
  if (animId === 'thrust') return -Math.min(2, f);
  if (animId === 'shoot') return f < 4 ? -2 : 0;
  if (animId === 'cast')  return -2;
  return 0;
}
function computeLegSwing(animId, f, total) {
  if (animId === 'walk') return Math.sin((f/total) * Math.PI * 2) * 1.5;
  if (animId === 'run')  return Math.sin((f/total) * Math.PI * 2) * 2.5;
  if (animId === 'jump') return f < 3 ? -1 : 0;
  return 0;
}

// Tiny thumbnail for an item — 16×16 logical, scaled by parent CSS sizing.
function ItemThumb({ kind, item, palettes, size = 32 }) {
  const ref = useRef(null);
  useEffect(() => {
    const c = ref.current; if (!c) return;
    c.width = 16; c.height = 16;
    const ctx = c.getContext('2d');
    ctx.clearRect(0, 0, 16, 16);
    drawThumb(ctx, kind, item, palettes);
  }, [kind, item, palettes]);
  return (
    <canvas ref={ref} width={16} height={16} style={{ width: size, height: size, imageRendering: 'pixelated', display: 'block' }} />
  );
}

function drawThumb(ctx, kind, item, palettes = {}) {
  const cx = 8;
  if (kind === 'body' || kind === 'head') {
    const sk = ramp(palettes.body || 'skin_ivory');
    px(ctx, cx-3, 4, 6, 6, sk[2]);
    px(ctx, cx-3, 9, 6, 1, sk[1]);
    px(ctx, cx-3, 4, 1, 6, sk[1]);
    px(ctx, cx+2, 4, 1, 6, sk[1]);
    px(ctx, cx-2, 7, 1, 1, '#2a2440');
    px(ctx, cx+1, 7, 1, 1, '#2a2440');
    return;
  }
  if (kind === 'eyes') {
    const sk = ramp(palettes.body || 'skin_ivory');
    const ey = ramp(palettes.eyes || 'eyes_blue');
    px(ctx, cx-3, 5, 6, 4, sk[2]);
    px(ctx, cx-2, 7, 1, 1, ey[1]);
    px(ctx, cx+1, 7, 1, 1, ey[1]);
    return;
  }
  if (kind === 'eyebrows') {
    const h = ramp(palettes.hair || 'hair_brown');
    px(ctx, cx-2, 6, 2, 1, h[1]);
    px(ctx, cx+1, 6, 2, 1, h[1]);
    return;
  }
  if (kind === 'nose') {
    const sk = ramp(palettes.body || 'skin_ivory');
    px(ctx, cx, 6, 1, 3, sk[1]);
    return;
  }
  if (kind === 'ears') {
    const sk = ramp(palettes.body || 'skin_ivory');
    px(ctx, cx-3, 6, 1, 3, sk[1]);
    px(ctx, cx+3, 6, 1, 3, sk[1]);
    return;
  }
  if (kind === 'hair') {
    const sk = ramp('skin_ivory');
    const h = ramp(palettes.hair || 'hair_brown');
    px(ctx, cx-3, 5, 6, 5, sk[2]);
    drawHair(ctx, item.id, cx, 4, h, 'S');
    return;
  }
  if (kind === 'facial') {
    const sk = ramp('skin_ivory');
    const h = ramp(palettes.hair || 'hair_brown');
    px(ctx, cx-3, 4, 6, 6, sk[2]);
    drawFacial(ctx, item.id, cx, 4, h, 'S');
    return;
  }
  if (kind === 'expression') {
    const sk = ramp('skin_ivory');
    px(ctx, cx-3, 4, 6, 6, sk[2]);
    px(ctx, cx-2, 6, 1, 1, '#2a2440');
    px(ctx, cx+1, 6, 1, 1, '#2a2440');
    if (item.id === 'smile') { px(ctx, cx-1, 8, 2, 1, '#2a2440'); }
    else if (item.id === 'frown') { px(ctx, cx-1, 8, 2, 1, '#2a2440'); }
    else { px(ctx, cx, 8, 1, 1, '#2a2440'); }
    return;
  }
  if (kind === 'torso' || kind === 'shoulders' || kind === 'arms' || kind === 'cape') {
    const c = ramp(palettes[kind] || 'cloth_blue');
    px(ctx, cx-3, 4, 6, 8, c[1]);
    px(ctx, cx-3, 4, 1, 8, c[0]);
    px(ctx, cx+2, 4, 1, 8, c[0]);
    px(ctx, cx-3, 4, 6, 1, c[2]);
    return;
  }
  if (kind === 'legs' || kind === 'feet' || kind === 'belt' || kind === 'neck' || kind === 'wrists' || kind === 'hands' || kind === 'backpack' || kind === 'quiver') {
    const c = ramp(palettes[kind] || 'cloth_brown');
    px(ctx, cx-3, 5, 6, 6, c[1]);
    px(ctx, cx-3, 5, 1, 6, c[0]);
    px(ctx, cx+2, 5, 1, 6, c[0]);
    return;
  }
  if (kind === 'weapon') {
    const m = ramp(palettes.weapon || 'metal_steel');
    drawWeapon(ctx, item.id, cx-1, 9, m, ramp('cloth_brown'), 'E', { id: 'idle' }, 0);
    return;
  }
  if (kind === 'shield') {
    const m = ramp(palettes.shield || 'metal_iron');
    drawShield(ctx, item.id, cx, 5, m);
    return;
  }
  // fallback
  px(ctx, 4, 4, 8, 8, '#666');
}

Object.assign(window, { PixelCharacter, ItemThumb });
