# Mage Outfit Preset Update Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Update the default Mage outfit preset to use a custom-specified male outfit.

**Architecture:** Update the predefined `PRESETS` configuration array in `packages/web/src/presets.ts` to replace the items of the `mage` preset.

**Tech Stack:** TypeScript, Vitest

---

### Task 1: Update presets.ts

**Files:**
- Modify: [presets.ts](file:///Users/william/gitRepo/lpc-toolkit-2026-1/packages/web/src/presets.ts)
- Test: [presets.test.ts](file:///Users/william/gitRepo/lpc-toolkit-2026-1/packages/web/test/presets.test.ts)

- [ ] **Step 1: Write the updated Mage preset config**

Update the `mage` item in the `PRESETS` array inside [presets.ts](file:///Users/william/gitRepo/lpc-toolkit-2026-1/packages/web/src/presets.ts) to the following:

```typescript
  {
    id: 'mage',
    labelKey: 'preset.mage',
    emoji: '🔮',
    bodyType: 'male',
    items: [
      { typeName: 'body', name: 'Body Color', recolor: 'light' },
      { typeName: 'head', name: 'Human Male', recolor: 'light' },
      { typeName: 'expression', name: 'Neutral', recolor: 'light' },
      { typeName: 'clothes', name: 'Longsleeve laced', variant: 'black' },
      { typeName: 'legs', name: 'Pants', recolor: 'black' },
      { typeName: 'shoes', name: 'Basic Shoes', variant: 'black' },
      { typeName: 'cape', name: 'Solid', variant: 'purple' },
      { typeName: 'hat', name: 'Wizard Hat Base', variant: 'purple' },
      { typeName: 'weapon', name: 'Gnarled staff', variant: 'dark' },
      { typeName: 'weapon_magic_crystal', name: 'Crystal', variant: 'purple' },
    ],
  },
```

- [ ] **Step 2: Run verification tests**

Verify that all new presets are valid according to the catalog and types.

Run: `rtk pnpm --filter @lpc-toolkit/web exec vitest run test/presets.test.ts`
Expected: PASS

- [ ] **Step 3: Run full typecheck**

Run: `rtk pnpm recursive typecheck`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
rtk git add packages/web/src/presets.ts
rtk git commit -m "feat: update default mage preset to new wizard outfit"
```
