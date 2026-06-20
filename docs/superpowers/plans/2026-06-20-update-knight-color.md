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

- [x] **Step 1: Write the updated Knight preset config**
  - Implementation: Set Plate, Armour legs, Armet hat, and Armour arms to `recolor: 'steel'` in presets.ts.
- [x] **Step 2: Run verification tests**
  - Verification: `rtk pnpm --filter @lpc-toolkit/web exec vitest run test/presets.test.ts` passed (6 tests).
- [x] **Step 3: Run full typecheck**
  - Verification: `rtk proxy pnpm -r typecheck` passed.
- [x] **Step 4: Commit**
  - Commit: `3c42a13b0`

