# Web Landing Character Guide Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the web landing page into a single-column first-use guide that teaches the complete named-character CLI workflow and contains two clearly positioned Composer links.

**Architecture:** Keep the change local to the existing server-renderable `LandingPage` component and its focused test. Represent the primary workflow as ordered static content, retain secondary CLI examples below it, and preserve the attribution explanation without adding state, hooks, adapters, or dependencies.

**Tech Stack:** TypeScript strict mode, React 18, Tailwind CSS v4, Vitest, pnpm workspaces

## Global Constraints

- Use a single content column at every viewport width.
- Show the named-character workflow in this order: `create`, `search`, `set`, `preview`, `render`.
- Explain that named characters are stored under `./characters/` and avoid hand-written selection JSON.
- Preserve mandatory metadata plus TXT and CSV attribution guidance for rendered sprites.
- Render exactly two `Open Composer` actions: one beside the Logo in the header and one in the final Web Composer section.
- Keep preset, selection JSON, catalog, token, and `lpc-toolkit web` workflows discoverable as secondary commands.
- Do not add dependencies, modify `upstream/`, or change CLI, Composer, composition, attribution, or export behavior.
- Run every terminal command with the `rtk` prefix and use pnpm.
- After each completed step, check it off and record an implementation note, commit hash, and verification status in this plan.

## Plan Amendment (2026-07-13)

After review, the landing page keeps the existing final Web Composer button and
adds a second `Open Composer` button beside the `LPC Toolkit` Logo in the
header. Task 1 records the original single-action guide implementation; Task 2
below supersedes only its Composer action count and placement.

---

### Task 1: Build the Single-Column CLI Guide

**Files:**
- Modify: `packages/web/test/landing-page.test.tsx`
- Modify: `packages/web/src/components/landing-page.tsx`
- Modify: `docs/superpowers/plans/2026-07-13-web-landing-character-guide.md`

**Interfaces:**
- Consumes: `LandingPageProps` with `onNavigate: (route: NavigableAppRoute) => void` and the existing shared `Button` component.
- Produces: the unchanged `LandingPage({ onNavigate }: LandingPageProps)` component API with new static guide content.

- [x] **Step 1: Specify the complete guide and verify RED**

  Replace the current test body in `packages/web/test/landing-page.test.tsx` with:

  ```tsx
  it('renders a complete single-entry CLI guide and one composer action', () => {
    const html = renderToStaticMarkup(<LandingPage onNavigate={() => {}} />);

    expect(html).toContain('LPC Toolkit');
    expect(html).toContain('CLI quick start');
    expect(html).toContain('npm install -g @lpc-toolkit/cli');
    expect(html).toContain('npx @lpc-toolkit/cli --help');
    expect(html).toContain('Node.js 22 or newer');
    expect(html).toContain('Create and edit a named character');
    expect(html).toContain('./characters/');

    const workflowCommands = [
      'lpc-toolkit character create hero --preset farmer',
      'lpc-toolkit character search hero --type hair --query braid',
      'lpc-toolkit character set hero --type hair --item hair_braid --recolor lpcr.brown',
      'lpc-toolkit character preview hero',
      'lpc-toolkit character render hero --out ./dist/hero --animation walk --bundle zip',
    ];
    const workflowPositions = workflowCommands.map((command) => {
      expect(html).toContain(command);
      return html.indexOf(command);
    });
    expect(workflowPositions).toEqual([...workflowPositions].sort((a, b) => a - b));

    expect(html).toContain('lpc-toolkit preset render farmer');
    expect(html).toContain('lpc-toolkit selection validate --selection selection.json');
    expect(html).toContain('lpc-toolkit catalog types');
    expect(html).toContain('lpc-toolkit token encode --selection selection.json');
    expect(html).toContain('lpc-toolkit web');
    expect(html).toContain('.credits.txt');
    expect(html).toContain('.credits.csv');
    expect(html).toContain('Keep both attribution files with exported sprites.');
    expect(html.match(/Open Composer/g)).toHaveLength(1);
  });
  ```

  Run:

  ```sh
  rtk pnpm --filter @lpc-toolkit/web test -- landing-page.test.tsx
  ```

  Expected: FAIL because the current page lacks the character workflow and
  `./characters/`, and renders `Open Composer` twice. The failure must be an
  assertion failure caused by missing behavior, not an import or render error.

  Commit the failing test:

  ```sh
  rtk git add packages/web/test/landing-page.test.tsx
  rtk git commit -m "test(web): cover landing character guide"
  ```

  Then update this checkbox with an implementation note, the test commit hash,
  and `Focused landing-page test RED as expected`; include that record in the
  next commit.

  - Implementation note: Replaced the landing-page test with assertions for the
    ordered named-character workflow, persistent `./characters/` storage,
    secondary CLI workflows, attribution artifacts, and one Composer action.
  - Commit: fbca03b139b59a533158858672f1acf40b00f865
  - Verification: Focused landing-page test RED as expected (assertion failure
    for the missing named-character guide).

- [x] **Step 2: Implement the guide and verify GREEN**

  In `packages/web/src/components/landing-page.tsx`, remove `selectionExample`,
  `customSelectionCommands`, and `cliCommands`. Add these exact data constants:

  ```tsx
  const characterSteps = [
    {
      title: 'Create a starting character',
      description: 'Start from the farmer preset and save it as hero.',
      command: 'lpc-toolkit character create hero --preset farmer',
    },
    {
      title: 'Search compatible items',
      description: 'Find hair choices that work with the stored character.',
      command: 'lpc-toolkit character search hero --type hair --query braid',
    },
    {
      title: 'Update the character',
      description: 'Select the braid and apply a brown recolor.',
      command:
        'lpc-toolkit character set hero --type hair --item hair_braid --recolor lpcr.brown',
    },
    {
      title: 'Preview the result',
      description: 'Render an attributed frame for a quick visual check.',
      command: 'lpc-toolkit character preview hero',
    },
    {
      title: 'Render final output',
      description: 'Export the walk animation and an attributed ZIP bundle.',
      command:
        'lpc-toolkit character render hero --out ./dist/hero --animation walk --bundle zip',
    },
  ] as const;

  const secondaryCommandGroups = [
    {
      title: 'Presets and selection files',
      commands: [
        'lpc-toolkit preset render farmer --out ./farmer --animation walk',
        'lpc-toolkit selection validate --selection selection.json',
        'lpc-toolkit render --selection selection.json --out ./rendered --animation walk --frames all --bundle zip',
      ],
    },
    {
      title: 'Explore and share',
      commands: [
        'lpc-toolkit catalog types',
        'lpc-toolkit catalog items --type hair',
        'lpc-toolkit token encode --selection selection.json',
        'lpc-toolkit web',
      ],
    },
  ] as const;
  ```

  Make these JSX changes without extracting components:

  1. Remove the header Composer button and every `lg:grid-cols-*` class.
  2. Keep the installation card first.
  3. Add `Create and edit a named character` with copy explaining that `hero`
     is persisted under `./characters/` and no selection JSON is required.
  4. Render `characterSteps` as an `<ol>`; each vertical item includes its step
     number, title, description, and a copyable command using `codeClassName`.
  5. Keep `What render creates` immediately afterward, including the exact
     sentence `Keep both attribution files with exported sprites.`
  6. Add `More CLI workflows` and map `secondaryCommandGroups` vertically; each
     group renders its title and commands without responsive column classes.
  7. End with one `Web Composer` section containing the only `Button`, preserving
     `onClick={() => onNavigate('compose')}` and label `Open Composer`.

  Reuse the existing card, typography, spacing, and `codeClassName` utilities.
  Do not add state, hooks, error handling, dependencies, or unrelated refactors.

  Run:

  ```sh
  rtk pnpm --filter @lpc-toolkit/web test -- landing-page.test.tsx
  ```

  Expected: PASS with one passing test.

  Commit the production change together with the completed Step 1 record:

  ```sh
  rtk git add packages/web/src/components/landing-page.tsx docs/superpowers/plans/2026-07-13-web-landing-character-guide.md
  rtk git commit -m "feat(web): teach character workflow on landing"
  ```

  Then update this checkbox with an implementation note, the implementation
  commit hash, and `Focused landing-page test PASS`; include that record in the
  final verification commit.

  - Implementation note: Reworked `LandingPage` into a single-column linear
    guide with the five-step named-character workflow, persistent character
    storage guidance, secondary CLI command groups, preserved attribution
    instructions, and one final Web Composer action.
  - Commit: 53a67bc9de387a1ab535fded67266dfe7e236dbd
  - Verification: Focused landing-page test PASS.

- [x] **Step 3: Run final verification and record results**

  Run each command independently:

  ```sh
  rtk pnpm --filter @lpc-toolkit/web typecheck
  rtk pnpm --filter @lpc-toolkit/web test -- landing-page.test.tsx
  rtk pnpm check:boundaries
  rtk git diff --check main...HEAD
  ```

  Expected: all commands exit `0`; the focused test reports one passing test;
  the boundary checker reports no architecture violations; the diff check emits
  no whitespace errors.

  Check off this step and record the implementation commit hash plus these exact
  statuses: `Web typecheck PASS; focused landing-page test PASS; boundary check
  PASS; git diff check PASS.` Commit the completed Step 2 and Step 3 records:

  ```sh
  rtk git add docs/superpowers/plans/2026-07-13-web-landing-character-guide.md
  rtk git commit -m "docs(plan): record landing guide verification"
  ```

  - Implementation note: Completed the required final verification commands
    independently after the landing guide implementation.
  - Commit: 53a67bc9de387a1ab535fded67266dfe7e236dbd
  - Verification: Web typecheck PASS; focused landing-page test PASS; boundary
    check PASS; git diff check PASS.

---

### Task 2: Add the Header Composer Entry

**Files:**
- Modify: `packages/web/test/landing-page.test.tsx`
- Modify: `packages/web/src/components/landing-page.tsx`
- Modify: `docs/superpowers/plans/2026-07-13-web-landing-character-guide.md`

**Interfaces:**
- Consumes: the unchanged `LandingPageProps` and shared `Button` component.
- Produces: the unchanged `LandingPage({ onNavigate }: LandingPageProps)` API
  with header and final-section Composer entry points.

- [x] **Step 1: Specify two Composer actions and verify RED**

  Update the focused test in `packages/web/test/landing-page.test.tsx` so the
  final assertions read:

  ```tsx
    const headerStart = html.indexOf('<header');
    const headerEnd = html.indexOf('</header>');
    expect(html.slice(headerStart, headerEnd)).toContain('Open Composer');
    expect(html.match(/Open Composer/g)).toHaveLength(2);
  ```

  Run:

  ```sh
  rtk pnpm --filter @lpc-toolkit/web test -- landing-page.test.tsx
  ```

  Expected: FAIL with an assertion failure because the current implementation
  has only the final-section button and no header Composer action.

  Commit only the test change:

  ```sh
  rtk git add packages/web/test/landing-page.test.tsx
  rtk git commit -m "test(web): require header composer action"
  ```

  Then check off this step with its test commit hash and
  `Focused landing-page test RED as expected`.

  - Implementation note: Extended the landing-page test to require a Composer
    action inside the header and exactly two total `Open Composer` actions.
  - Commit: d7937405c05c86dc9118080d2c4e8cfd47f795b2
  - Verification: Focused landing-page test RED as expected (assertion failure
    for the missing header Composer action).

- [ ] **Step 2: Add the header action and verify GREEN**

  In `packages/web/src/components/landing-page.tsx`, keep the existing final
  Web Composer `Button` unchanged. Add this Button after the Logo wrapper inside
  the existing header:

  ```tsx
          <Button
            className="shrink-0"
            variant="primary"
            onClick={() => onNavigate('compose')}
          >
            Open Composer
          </Button>
  ```

  Keep the header's existing flex layout so the button sits to the right of the
  Logo on wide screens and wraps safely on narrow screens. Do not add state,
  hooks, dependencies, responsive grid columns, or unrelated refactors.

  Run:

  ```sh
  rtk pnpm --filter @lpc-toolkit/web test -- landing-page.test.tsx
  ```

  Expected: PASS with one passing test and exactly two `Open Composer` strings.
  Commit the production change:

  ```sh
  rtk git add packages/web/src/components/landing-page.tsx
  rtk git commit -m "feat(web): add header composer action"
  ```

  Then record the implementation commit hash and `Focused landing-page test
  PASS` in this plan.

- [ ] **Step 3: Run final verification and record results**

  Run each command independently:

  ```sh
  rtk pnpm --filter @lpc-toolkit/web run typecheck
  rtk pnpm --filter @lpc-toolkit/web test -- landing-page.test.tsx
  rtk pnpm check:boundaries
  rtk git diff --check main...HEAD
  ```

  Expected: all commands exit `0`; the focused test reports one passing test;
  the boundary checker reports no architecture violations; and the diff check
  emits no whitespace errors. Record the implementation commit hash plus these
  exact statuses: `Web typecheck PASS; focused landing-page test PASS; boundary
  check PASS; git diff check PASS.` Commit the completed plan records:

  ```sh
  rtk git add docs/superpowers/plans/2026-07-13-web-landing-character-guide.md
  rtk git commit -m "docs(plan): record header composer verification"
  ```
