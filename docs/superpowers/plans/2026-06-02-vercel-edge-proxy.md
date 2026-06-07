# Vercel Edge Cache Proxy Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Resolve the 0% loading lag for random outfit generations by routing upstream spritesheet requests through a same-origin Vercel Edge Proxy CDN, with local Vite proxying for development.

**Architecture:** We will change the upstream base URL to a relative same-origin path (`/upstream-assets/`). We will then add reverse proxy rewrites and aggressive caching headers in Vercel (`vercel.json`) and proxy fallback in local development (`vite.config.ts`).

**Tech Stack:** React 18, Vite 6, Vercel SPA routing/headers configuration, TypeScript.

---

### Task 1: Reconfigure Upstream Base URL to Same-Origin

**Files:**
- Modify: `packages/web/src/adapter/asset-source.ts:5-6`
- Test: `packages/web/test/asset-source.test.ts`

- [ ] **Step 1: Modify UPSTREAM_SPRITESHEET_BASE_URL**
  Open [packages/web/src/adapter/asset-source.ts](file:///Users/william/gitRepo/lpc-toolkit-2026-1/packages/web/src/adapter/asset-source.ts) and modify `UPSTREAM_SPRITESHEET_BASE_URL` to point to `/upstream-assets/`.

  ```typescript
  // Target replacement at line 5-6:
  export const UPSTREAM_SPRITESHEET_BASE_URL = '/upstream-assets/';
  ```

- [ ] **Step 2: Run unit tests to verify resolution**
  Run unit tests to ensure that the URL builder correctly constructs same-origin relative URLs:
  Run: `rtk pnpm test packages/web/test/asset-source.test.ts`
  Expected: PASS. All three tests in `asset-source.test.ts` must pass.

- [ ] **Step 3: Commit changes**
  Run:
  ```bash
  rtk git add packages/web/src/adapter/asset-source.ts
  rtk git commit -m "feat: change upstream spritesheet base URL to relative same-origin path"
  ```

---

### Task 2: Configure Local Vite Development Server Proxy

**Files:**
- Modify: `packages/web/vite.config.ts:18-19`

- [ ] **Step 1: Add proxy config to server block**
  Open [packages/web/vite.config.ts](file:///Users/william/gitRepo/lpc-toolkit-2026-1/packages/web/vite.config.ts) and add the `proxy` property to the `server` block to map `/upstream-assets` to the external generator URL.

  ```typescript
  // Target replacement at line 18 in server block:
    server: { 
      fs: { allow: ['../..'] },
      proxy: {
        '/upstream-assets': {
          target: 'https://liberatedpixelcup.github.io/Universal-LPC-Spritesheet-Character-Generator',
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/upstream-assets/, ''),
        },
      },
    },
  ```

- [ ] **Step 2: Verify typecheck**
  Ensure that TypeScript does not complain about configuration changes in Vite config.
  Run: `rtk pnpm --filter @lpc-toolkit/web typecheck`
  Expected: Success with no typecheck errors.

- [ ] **Step 3: Commit changes**
  Run:
  ```bash
  rtk git add packages/web/vite.config.ts
  rtk git commit -m "chore: add /upstream-assets proxy mapping to local Vite server config"
  ```

---

### Task 3: Configure Vercel Routing & Cache Headers

**Files:**
- Modify: `packages/web/vercel.json:5-10`

- [ ] **Step 1: Add Vercel rewrites and headers**
  Open [packages/web/vercel.json](file:///Users/william/gitRepo/lpc-toolkit-2026-1/packages/web/vercel.json) and configure the reverse proxy mapping under `rewrites` (placing it BEFORE the universal SPA routing fallback), and configure the `Cache-Control` header under `headers`.

  ```json
  {
    "framework": "vite",
    "buildCommand": "pnpm build",
    "outputDirectory": "dist",
    "rewrites": [
      {
        "source": "/upstream-assets/:path*",
        "destination": "https://liberatedpixelcup.github.io/Universal-LPC-Spritesheet-Character-Generator/:path*"
      },
      {
        "source": "/(.*)",
        "destination": "/"
      }
    ],
    "headers": [
      {
        "source": "/upstream-assets/(.*)",
        "headers": [
          {
            "key": "Cache-Control",
            "value": "public, max-age=31536000, immutable"
          }
        ]
      }
    ]
  }
  ```

- [ ] **Step 2: Commit changes**
  Run:
  ```bash
  rtk git add packages/web/vercel.json
  rtk git commit -m "chore: configure vercel rewrites proxy and immutable caching headers"
  ```

---

### Task 4: Integration and E2E Verification

**Files:**
- Test: `packages/web/e2e/random-no-console-errors.spec.ts`
- Test: `packages/web/e2e/random-upstream-parity.spec.ts`

- [ ] **Step 1: Run unit tests**
  Ensure the entire monorepo unit test suite passes.
  Run: `rtk pnpm test`
  Expected: All 36 test files and 275 tests PASS.

- [ ] **Step 2: Run E2E parity tests**
  Ensure E2E comparison passes.
  Run: `rtk pnpm --filter @lpc-toolkit/web test:e2e:parity`
  Expected: All random seeded parity comparisons pass with 0 pixel mismatch.

- [ ] **Step 3: Run standard E2E tests**
  Ensure standard user interactions pass.
  Run: `rtk pnpm --filter @lpc-toolkit/web test:e2e`
  Expected: PASS.
