# Design Spec - Update Mage Outfit Preset

Change the default Mage outfit preset to use a custom-specified male outfit.

## Background

The user requested to change the Mage outfit preset to:
`#sex=male&body=Body_Color_light&head=Human_Male_light&expression=Neutral_light&clothes=Longsleeve_laced_black&legs=Pants_black&shoes=Basic_Shoes_black&cape=Solid_purple&hat=Wizard_Hat_Base_purple&weapon=Gnarled_staff_dark&weapon_magic_crystal=Crystal_purple`

## Proposed Changes

### Configuration Update

Update the `mage` preset definition in [presets.ts](file:///Users/william/gitRepo/lpc-toolkit-2026-1/packages/web/src/presets.ts):
- Set `bodyType: 'male'`
- Items:
  - `body`: `Body Color` (recolor: `light`)
  - `head`: `Human Male` (recolor: `light`)
  - `expression`: `Neutral` (recolor: `light`)
  - `clothes`: `Longsleeve laced` (variant: `black`)
  - `legs`: `Pants` (recolor: `black`)
  - `shoes`: `Basic Shoes` (variant: `black`)
  - `cape`: `Solid` (variant: `purple`)
  - `hat`: `Wizard Hat Base` (variant: `purple`)
  - `weapon`: `Gnarled staff` (variant: `dark`)
  - `weapon_magic_crystal`: `Crystal` (variant: `purple`)

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
Open the app, open Presets, click "Mage", and verify the character matches the new configuration.
