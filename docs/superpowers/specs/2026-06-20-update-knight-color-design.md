# Design Spec - Update Knight Outfit Colors to Steel Silver

Set all metallic armor components of the Knight preset to steel silver.

## Background

The user requested that the metal armor components (breastplate, legs, helmet, and arms) of the Knight preset default to steel silver instead of the default ceramic brown.

## Proposed Changes

### Configuration Update

Update the `knight` preset definition in [presets.ts](file:///Users/william/gitRepo/lpc-toolkit-2026-1/packages/web/src/presets.ts) to specify `recolor: 'steel'` for:
- `armour`: `Plate`
- `legs`: `Armour`
- `hat`: `Armet`
- `arms`: `Armour`

Updated preset configuration:
```typescript
  {
    id: 'knight',
    labelKey: 'preset.knight',
    emoji: '⚔️',
    bodyType: 'male',
    items: [
      { typeName: 'body', name: 'Body Color', recolor: 'light' },
      { typeName: 'head', name: 'Human Male', recolor: 'light' },
      { typeName: 'expression', name: 'Neutral', recolor: 'light' },
      { typeName: 'armour', name: 'Plate', recolor: 'steel' },
      { typeName: 'legs', name: 'Armour', recolor: 'steel' },
      { typeName: 'shoes', name: 'Armour', variant: 'steel' },
      { typeName: 'hat', name: 'Armet', recolor: 'steel' },
      { typeName: 'weapon', name: 'Longsword', variant: 'longsword' },
      { typeName: 'shield', name: 'Kite', variant: 'kite blue gray' },
      { typeName: 'arms', name: 'Armour', recolor: 'steel' },
      { typeName: 'gloves', name: 'Gloves', recolor: 'all.lpcr.smoke' },
    ],
  },
```

## Verification

### Automated Tests
Run Vitest on the web package presets tests:
```bash
rtk pnpm --filter @lpc-toolkit/web exec vitest run test/presets.test.ts
```

### Manual Verification
Run the dev server, select the Knight preset, and verify that the armor pieces are rendered in steel silver (silver-grey).
