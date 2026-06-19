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

- [x] **Step 1: Add arms and gloves to CLOTHING_TYPES**
  - Implementation: Added `'arms'` and `'gloves'` to `CLOTHING_TYPES` set.
- [x] **Step 2: Write the updated Knight preset config**
  - Implementation: Updated the `knight` preset config array in presets.ts.
- [x] **Step 3: Run verification tests**
  - Verification: `rtk pnpm --filter @lpc-toolkit/web exec vitest run test/presets.test.ts` passed (6 tests).
- [x] **Step 4: Run full typecheck**
  - Verification: `rtk proxy pnpm -r typecheck` passed (no errors).
- [x] **Step 5: Commit**
  - Commit: `dbeb3fec9`

