# Knight Outfit Preset Update Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Update the default Knight outfit preset to use a custom-specified male outfit and expand `CLOTHING_TYPES` to clear/apply arms and gloves.

**Architecture:** Update `CLOTHING_TYPES` and the `PRESETS` array in `packages/web/src/presets.ts`.

**Tech Stack:** TypeScript, Vitest

---

### Task 1: Update presets.ts

**Files:**
- Modify: [presets.ts](file:///Users/william/gitRepo/lpc-toolkit-2026-1/packages/web/src/presets.ts)
- Test: [presets.test.ts](file:///Users/william/gitRepo/lpc-toolkit-2026-1/packages/web/test/presets.test.ts)

- [ ] **Step 1: Add arms and gloves to CLOTHING_TYPES**

Update the `CLOTHING_TYPES` set in [presets.ts](file:///Users/william/gitRepo/lpc-toolkit-2026-1/packages/web/src/presets.ts):

```typescript
export const CLOTHING_TYPES: ReadonlySet<TypeName> = new Set<TypeName>([
  'torso',
  'legs',
  'feet',
  'clothes',
  'overalls',
  'apron',
  'armour',
  'chainmail',
  'shoes',
  'cape',
  'hat',
  'weapon',
  'weapon_magic_crystal',
  'shield',
  'quiver',
  'arms',
  'gloves',
]);
```

- [ ] **Step 2: Write the updated Knight preset config**

Update the `knight` item in the `PRESETS` array inside [presets.ts](file:///Users/william/gitRepo/lpc-toolkit-2026-1/packages/web/src/presets.ts) to the following:

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
      { typeName: 'armour', name: 'Plate' },
      { typeName: 'legs', name: 'Armour' },
      { typeName: 'shoes', name: 'Armour', variant: 'steel' },
      { typeName: 'hat', name: 'Armet' },
      { typeName: 'weapon', name: 'Longsword', variant: 'longsword' },
      { typeName: 'shield', name: 'Kite', variant: 'kite blue gray' },
      { typeName: 'arms', name: 'Armour' },
      { typeName: 'gloves', name: 'Gloves', recolor: 'all.lpcr.smoke' },
    ],
  },
```

- [ ] **Step 3: Run verification tests**

Verify that all presets are valid according to the catalog, and test assertions are satisfied.

Run: `rtk pnpm --filter @lpc-toolkit/web exec vitest run test/presets.test.ts`
Expected: PASS

- [ ] **Step 4: Run full typecheck**

Run: `rtk proxy pnpm -r typecheck`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
rtk git add packages/web/src/presets.ts
rtk git commit -m "feat: update default knight preset to new armet/plate armor setup"
```
