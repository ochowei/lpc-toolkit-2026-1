# Knight Preset Color Update Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Set all metal armor components of the Knight preset to steel silver recolor in `presets.ts`.

**Architecture:** Update the `knight` preset config in `packages/web/src/presets.ts`.

**Tech Stack:** TypeScript, Vitest

---

### Task 1: Update presets.ts

**Files:**
- Modify: [presets.ts](file:///Users/william/gitRepo/lpc-toolkit-2026-1/packages/web/src/presets.ts)
- Test: [presets.test.ts](file:///Users/william/gitRepo/lpc-toolkit-2026-1/packages/web/test/presets.test.ts)

- [ ] **Step 1: Write the updated Knight preset config**

Update the `knight` item in the `PRESETS` array inside [presets.ts](file:///Users/william/gitRepo/lpc-toolkit-2026-1/packages/web/src/presets.ts) to set `recolor: 'steel'` for Plate armour, Armour legs, Armet hat, and Armour arms:

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

- [ ] **Step 2: Run verification tests**

Verify that all presets are valid according to the catalog and tests.

Run: `rtk pnpm --filter @lpc-toolkit/web exec vitest run test/presets.test.ts`
Expected: PASS

- [ ] **Step 3: Run full typecheck**

Run: `rtk proxy pnpm -r typecheck`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add packages/web/src/presets.ts
git commit -m "feat: set knight preset armor parts to steel recolor"
```
