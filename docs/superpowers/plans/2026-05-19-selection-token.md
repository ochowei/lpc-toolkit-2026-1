# Selection Token Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add reversible selection tokens to core and the web UI.

**Architecture:** Core owns versioned token encode/decode by wrapping the existing hash serializer/parser in Base64URL. Web owns turning decoded `Selections` into slice state and showing copy/apply controls.

**Tech Stack:** TypeScript, Vitest, React, Vite, pnpm workspace.

---

### Task 1: Core Token API

**Files:**
- Modify: `packages/core/test/hash.test.ts`
- Modify: `packages/core/src/hash.ts`
- Modify: `packages/core/src/index.ts`

- [ ] **Step 1: Write failing tests** for `encodeSelectionToken` and `decodeSelectionToken`, including round-trip, unsupported version, malformed Base64URL, and decoded parser warnings.
- [ ] **Step 2: Run** `pnpm --filter @lpc-toolkit/core test -- hash.test.ts` and confirm the new exports are missing.
- [ ] **Step 3: Implement minimal token helpers** in `hash.ts` with a `v1.` prefix and ASCII Base64URL encoder/decoder around `serializeHash`.
- [ ] **Step 4: Export the helpers** from `index.ts`.
- [ ] **Step 5: Re-run** `pnpm --filter @lpc-toolkit/core test -- hash.test.ts` and confirm green.

### Task 2: Web State Application

**Files:**
- Modify: `packages/web/test/selection.test.ts`
- Modify: `packages/web/src/slice/selection.ts`

- [ ] **Step 1: Write a failing test** that dispatching decoded selections updates `bodyType` and item names while preserving `anim`, `dir`, and `playing`.
- [ ] **Step 2: Run** `pnpm --filter @lpc-toolkit/web test -- selection.test.ts` and confirm failure.
- [ ] **Step 3: Add an `apply_selections` reducer action** that converts core `Selections.items` into the web state's `typeName -> name` shape.
- [ ] **Step 4: Re-run** `pnpm --filter @lpc-toolkit/web test -- selection.test.ts` and confirm green.

### Task 3: Web Token UI

**Files:**
- Modify: `packages/web/src/components/slice-harness.tsx`
- Modify: `packages/web/src/i18n.ts`

- [ ] **Step 1: Add token translations** for English and Traditional Chinese.
- [ ] **Step 2: Render current token** from `encodeSelectionToken(toSelections(state))`.
- [ ] **Step 3: Add copy/apply controls** that decode with `decodeSelectionToken`, reject warnings, dispatch `apply_selections`, and keep current state untouched on errors.
- [ ] **Step 4: Run** `pnpm --filter @lpc-toolkit/web typecheck` and targeted tests.
