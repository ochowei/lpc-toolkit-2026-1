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

- [x] **Step 1: Write the updated Mage preset config**
  - Implementation: Updated the `mage` preset config array in presets.ts.
- [x] **Step 2: Run verification tests**
  - Verification: `rtk pnpm --filter @lpc-toolkit/web exec vitest run test/presets.test.ts` passed (6 tests).
- [x] **Step 3: Run full typecheck**
  - Verification: `rtk proxy pnpm -r typecheck` passed (no errors).
- [x] **Step 4: Commit**
  - Commit: `7aa0d5690`
