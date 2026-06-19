# Design Spec - Update Knight Outfit Preset

Change the default Knight outfit preset to use a custom-specified male outfit and support clearing/applying arms and gloves.

## Background

The user requested to change the Knight outfit preset to:
`sex=male&body=Body_Color_light&head=Human_Male_light&expression=Neutral_light&armour=Plate&legs=Armour&shoes=Armour_steel&hat=Armet&weapon=Longsword_longsword&shield=Kite_kite%20blue%20gray&arms=Armour&gloves=Gloves_all.lpcr.smoke`

## Proposed Changes

### Clothing Types Update

Add `'arms'` and `'gloves'` to `CLOTHING_TYPES` in `packages/web/src/presets.ts`. This ensures they are cleared before presets are applied.

### Configuration Update

Update the `knight` preset definition in [presets.ts](file:///Users/william/gitRepo/lpc-toolkit-2026-1/packages/web/src/presets.ts):
- Set `bodyType: 'male'`
- Items:
  - `body`: `Body Color` (recolor: `light`)
  - `head`: `Human Male` (recolor: `light`)
  - `expression`: `Neutral` (recolor: `light`)
  - `armour`: `Plate`
  - `legs`: `Armour`
  - `shoes`: `Armour` (variant: `steel`)
  - `hat`: `Armet`
  - `weapon`: `Longsword` (variant: `longsword`)
  - `shield`: `Kite` (variant: `kite blue gray`)
  - `arms`: `Armour`
  - `gloves`: `Gloves` (recolor: `all.lpcr.smoke`)

## Verification

### Automated Tests
Run Vitest on the web package presets tests:
```bash
rtk pnpm --filter @lpc-toolkit/web exec vitest run test/presets.test.ts
```

### Manual Verification
Run the dev server:
```bash
rtk pnpm --filter @lpc-toolkit/web run dev
```
Open the app, select the "Knight" preset, and verify the character matches the new configuration.
