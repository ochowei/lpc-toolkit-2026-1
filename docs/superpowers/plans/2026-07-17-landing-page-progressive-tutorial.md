# Landing Page Progressive Tutorial Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the reference-heavy landing page with an outcome-led hero, an attributed farmer preview, and a progressive CLI tutorial that reaches a visible result in three commands.

**Architecture:** Keep the page in the web presentation layer and preserve the existing `LandingPage` callback API. Bundle one CLI-generated preview and its matching TXT/CSV credits through Vite imports so both the normal site and CLI embedded build contain the complete attributed visual set; keep detailed CLI discovery and pagination in the canonical README and help.

**Tech Stack:** TypeScript strict mode, React 18, Vite 6, Tailwind CSS v4, Vitest, pnpm workspaces, existing Node CLI

## Global Constraints

- The hero must present exactly two paths: `Open Composer` and `Use the CLI`.
- The primary CLI path is exactly install, create `hero` from `farmer`, and preview `hero`.
- State that Node.js 22 or newer is required.
- State that the first asset-dependent command downloads approximately 205 MB once, verifies it, and reuses the cache.
- Keep `hero.preview.png`, `hero.credits.txt`, and `hero.credits.csv` together under `packages/web/src/landing-artifacts/`.
- Import the two credit files with Vite `?url`; do not use `publicDir`, because the CLI embedded build disables it.
- Keep mandatory metadata plus TXT/CSV attribution guidance for preview and render output.
- Add no dependency, clipboard state, tabs, accordion, runtime composition, CLI behavior, or Composer-route change.
- Do not modify or initialize `upstream/`.
- Run every terminal command with the `rtk` prefix and use pnpm for repository workflows.
- After each completed task, check its plan items, add an implementation note, record the full commit hash, and record each exact verification command with PASS/FAIL.

## File Structure

- Create `packages/web/src/landing-artifacts/hero.preview.png`: CLI-generated 64×64 farmer preview bundled by Vite.
- Create `packages/web/src/landing-artifacts/hero.credits.txt`: matching human-readable attribution for the preview.
- Create `packages/web/src/landing-artifacts/hero.credits.csv`: matching machine-readable attribution for the preview.
- Create `packages/web/test/landing-artifacts.test.ts`: enforce that the preview and both non-empty credit files remain together.
- Modify `packages/web/test/landing-page.test.tsx`: specify the progressive tutorial, links, output tree, and removed reference content.
- Modify `packages/web/test/app-shell.test.tsx`: keep the `/` route integration assertion aligned with the new outcome headline.
- Modify `packages/web/src/components/landing-page.tsx`: own the static hero, tutorial, output, customization, render, and documentation-link presentation.
- Modify `docs/superpowers/specs/2026-07-17-landing-page-progressive-tutorial-design.md`: record the embedded-build asset-location correction.
- Modify `docs/superpowers/plans/2026-07-17-landing-page-progressive-tutorial.md`: record completed steps, commits, verification, and the final documentation-impact reassessment.

---

### Task 1: Add the Attributed Farmer Preview Set

**Files:**
- Create: `packages/web/src/landing-artifacts/hero.preview.png`
- Create: `packages/web/src/landing-artifacts/hero.credits.txt`
- Create: `packages/web/src/landing-artifacts/hero.credits.csv`
- Create: `packages/web/test/landing-artifacts.test.ts`
- Modify: `docs/superpowers/specs/2026-07-17-landing-page-progressive-tutorial-design.md`
- Modify: `docs/superpowers/plans/2026-07-17-landing-page-progressive-tutorial.md`

**Interfaces:**
- Consumes: public CLI commands `character create` and `character preview`, the verified managed asset cache, and Vite static-asset imports.
- Produces: three co-located landing assets named `hero.preview.png`, `hero.credits.txt`, and `hero.credits.csv`; Task 2 imports all three.

- [x] **Step 1: Write the failing artifact-integrity test**

Create `packages/web/test/landing-artifacts.test.ts` with:

```ts
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

function landingArtifact(name: string): string {
  return fileURLToPath(new URL(`../src/landing-artifacts/${name}`, import.meta.url));
}

describe('landing preview artifacts', () => {
  it('keeps the generated preview with both matching credit formats', () => {
    const preview = readFileSync(landingArtifact('hero.preview.png'));
    const creditsTxt = readFileSync(
      landingArtifact('hero.credits.txt'),
      'utf8',
    );
    const creditsCsv = readFileSync(
      landingArtifact('hero.credits.csv'),
      'utf8',
    );

    expect(preview.subarray(0, 8)).toEqual(
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    );
    expect(creditsTxt).toContain('\t- Licenses:');
    expect(creditsTxt).toContain('\t- Authors:');
    expect(creditsCsv).toMatch(
      /^filename,notes,authors,licenses,urls\n"/u,
    );
  });
});
```

- [x] **Step 2: Run the artifact test and confirm RED**

Run:

```sh
rtk pnpm --filter @lpc-toolkit/web test -- landing-artifacts.test.ts
```

Expected: FAIL with `ENOENT` for
`packages/web/src/landing-artifacts/hero.preview.png`. The failure must be missing
artifacts, not a TypeScript or test-discovery error.

- [x] **Step 3: Generate the preview and copy only the attributed visual set**

Run these commands from the repository root:

```sh
rtk mkdir -p /private/tmp/lpc-landing-preview-2026-07-17
rtk mkdir -p packages/web/src/landing-artifacts
rtk lpc-toolkit character create hero --preset farmer --selection /private/tmp/lpc-landing-preview-2026-07-17/hero.selection.json
rtk lpc-toolkit character preview --selection /private/tmp/lpc-landing-preview-2026-07-17/hero.selection.json --out /private/tmp/lpc-landing-preview-2026-07-17/output
rtk cp /private/tmp/lpc-landing-preview-2026-07-17/output/hero.preview.png packages/web/src/landing-artifacts/hero.preview.png
rtk cp /private/tmp/lpc-landing-preview-2026-07-17/output/hero.credits.txt packages/web/src/landing-artifacts/hero.credits.txt
rtk cp /private/tmp/lpc-landing-preview-2026-07-17/output/hero.credits.csv packages/web/src/landing-artifacts/hero.credits.csv
```

Expected: installed public CLI version `0.1.4` reports the explicit selection
path, `character preview` reports four attributed artifacts in the temporary
output directory, and only the PNG plus matching TXT/CSV credits are copied
into web source. Source execution is intentionally not used because release
configuration is bundled beside the built `dist/index.js` entrypoint.

- [x] **Step 4: Run the artifact test and confirm GREEN**

Run:

```sh
rtk pnpm --filter @lpc-toolkit/web test -- landing-artifacts.test.ts
```

Expected: PASS with one passing test.

- [x] **Step 5: Commit the attributed visual set**

Run:

```sh
rtk git add packages/web/src/landing-artifacts/hero.preview.png packages/web/src/landing-artifacts/hero.credits.txt packages/web/src/landing-artifacts/hero.credits.csv packages/web/test/landing-artifacts.test.ts docs/superpowers/specs/2026-07-17-landing-page-progressive-tutorial-design.md docs/superpowers/plans/2026-07-17-landing-page-progressive-tutorial.md
rtk git commit -m "feat(web): add attributed landing preview"
```

After committing, append the implementation note, full hash, and RED/GREEN
command results under this task before beginning Task 2.

- Implementation note: Added an integrity test, then generated a real 64×64
  farmer preview with installed public CLI `0.1.4` and copied its matching TXT
  and CSV credits into Vite-bundled web source. The trackable
  `src/landing-artifacts/` path avoids the repository-wide ignored `assets/`
  directory name. Direct `src/index.ts` execution was rejected because release
  configuration is intentionally bundled beside `dist/index.js`; the plan now
  uses the installed public entrypoint.
- Verification: `rtk pnpm --filter @lpc-toolkit/web test -- landing-artifacts.test.ts`
  RED as expected with `ENOENT` for `hero.preview.png`.
- Verification: `rtk pnpm --filter @lpc-toolkit/web test -- landing-artifacts.test.ts`
  PASS (1 test).
- Commit: `f1810b9ab02df2a37d9e59bb8da0f9d168f1c557`

---

### Task 2: Replace the Reference-Heavy Page with the Progressive Tutorial

**Files:**
- Modify: `packages/web/test/landing-page.test.tsx`
- Modify: `packages/web/test/app-shell.test.tsx`
- Modify: `packages/web/src/components/landing-page.tsx`
- Modify: `docs/superpowers/plans/2026-07-17-landing-page-progressive-tutorial.md`

**Interfaces:**
- Consumes: `LandingPageProps.onNavigate(route: NavigableAppRoute): void`, the existing `Button` component with `asChild`, and Task 1's three bundled asset URLs.
- Produces: unchanged `LandingPage({ onNavigate }: LandingPageProps): JSX.Element`; one Composer callback action, one `#cli-quick-start` anchor, and bundled credit links.

- [x] **Step 1: Replace the focused test with progressive-tutorial expectations**

Replace `packages/web/test/landing-page.test.tsx` with:

```tsx
import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { LandingPage } from '../src/components/landing-page';

describe('LandingPage', () => {
  it('leads with the product outcome and a three-command CLI success path', () => {
    const html = renderToStaticMarkup(<LandingPage onNavigate={() => {}} />);

    expect(html).toContain('LPC Toolkit');
    expect(html).toContain('Create attributed LPC characters');
    expect(html).toContain('Farmer character preview generated by LPC Toolkit');
    expect(html).toContain('hero.preview.png');
    expect(html).toContain('hero.credits.txt');
    expect(html).toContain('hero.credits.csv');

    expect(html.match(/Open Composer/g)).toHaveLength(1);
    expect(html).toContain('href="#cli-quick-start"');
    expect(html).toContain('Use the CLI');
    expect(html).toContain('id="cli-quick-start"');

    const quickStartCommands = [
      'npm install -g @lpc-toolkit/cli',
      'lpc-toolkit character create hero --preset farmer',
      'lpc-toolkit character preview hero',
    ];
    const quickStartPositions = quickStartCommands.map((command) => {
      expect(html).toContain(command);
      return html.indexOf(command);
    });
    expect(quickStartPositions).toEqual(
      [...quickStartPositions].sort((left, right) => left - right),
    );

    expect(html).toContain('npx @lpc-toolkit/cli --help');
    expect(html).toContain('Node.js 22 or newer');
    expect(html).toContain('about 205 MB');
    expect(html).toContain('characters/previews/hero/');
    expect(html).toContain('hero.metadata.json');
    expect(html).toContain('Keep both credit files with the generated sprite.');

    const customizationCommands = [
      'lpc-toolkit character search hero --type hair --query braid',
      'lpc-toolkit catalog item hair_braid',
      'lpc-toolkit character set hero --type hair --item hair_braid --recolor lpcr.brown',
      'lpc-toolkit character render hero --out ./dist/hero --animation walk --bundle zip',
    ];
    for (const command of customizationCommands) expect(html).toContain(command);

    expect(html).toContain(
      'https://github.com/ochowei/lpc-toolkit-2026-1/blob/main/packages/cli/README.md',
    );
    expect(html).not.toContain('page.nextOffset');
    expect(html).not.toContain('lpc-toolkit selection validate');
    expect(html).not.toContain('lpc-toolkit token encode');
  });
});
```

- [x] **Step 2: Run the focused page test and confirm RED**

Run:

```sh
rtk pnpm --filter @lpc-toolkit/web test -- landing-page.test.tsx
```

Expected: FAIL because the current page lacks the outcome headline, attributed
preview image, CLI anchor, 205 MB guidance, and reduced reference content.

- [x] **Step 3: Implement the progressive landing page**

Replace `packages/web/src/components/landing-page.tsx` with:

```tsx
import heroPreviewUrl from '../landing-artifacts/hero.preview.png';
import heroCreditsTxtUrl from '../landing-artifacts/hero.credits.txt?url';
import heroCreditsCsvUrl from '../landing-artifacts/hero.credits.csv?url';
import type { NavigableAppRoute } from '../lib/app-route';
import { Button } from './ui/button';

interface LandingPageProps {
  readonly onNavigate: (route: NavigableAppRoute) => void;
}

const quickStartSteps = [
  {
    title: 'Install the CLI',
    description: 'Install the published package globally.',
    command: 'npm install -g @lpc-toolkit/cli',
  },
  {
    title: 'Create a starting character',
    description: 'Start from the built-in farmer preset and save it as hero.',
    command: 'lpc-toolkit character create hero --preset farmer',
  },
  {
    title: 'Preview the result',
    description: 'Render one attributed frame using the default walk preview.',
    command: 'lpc-toolkit character preview hero',
  },
] as const;

const customizationSteps = [
  {
    title: 'Find compatible hair',
    description: 'Search the catalog using readable terminal output.',
    command: 'lpc-toolkit character search hero --type hair --query braid',
  },
  {
    title: 'Inspect exact credits',
    description: 'Review the selected item and its complete attribution.',
    command: 'lpc-toolkit catalog item hair_braid',
  },
  {
    title: 'Apply the item',
    description: 'Select the braid and apply its brown recolor.',
    command:
      'lpc-toolkit character set hero --type hair --item hair_braid --recolor lpcr.brown',
  },
] as const;

const cliReadmeUrl =
  'https://github.com/ochowei/lpc-toolkit-2026-1/blob/main/packages/cli/README.md';

const codeClassName =
  'block overflow-x-auto rounded-md bg-[var(--bg-deep)] px-3 py-2 font-mono text-sm text-text';

export function LandingPage({ onNavigate }: LandingPageProps) {
  return (
    <main className="min-h-screen bg-app text-text">
      <div className="mx-auto flex min-h-screen w-full max-w-6xl flex-col gap-8 px-5 py-6 sm:px-8 lg:px-10">
        <header className="grid items-center gap-8 border-b border-border pb-8 lg:grid-cols-[minmax(0,1fr)_320px]">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-text-mute">
              LPC Toolkit
            </p>
            <h1 className="mt-3 max-w-3xl text-3xl font-semibold text-text sm:text-5xl">
              Create attributed LPC characters, visually or from the command line.
            </h1>
            <p className="mt-4 max-w-2xl text-base text-text-2">
              Compose game-ready pixel characters, preview the result, and keep
              the matching licenses and credits with every export.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Button variant="primary" onClick={() => onNavigate('compose')}>
                Open Composer
              </Button>
              <Button asChild>
                <a href="#cli-quick-start">Use the CLI</a>
              </Button>
            </div>
          </div>

          <figure className="rounded-md border border-border bg-surface p-5 text-center">
            <div className="flex min-h-56 items-center justify-center rounded-md bg-[var(--bg-deep)]">
              <img
                src={heroPreviewUrl}
                alt="Farmer character preview generated by LPC Toolkit"
                width={64}
                height={64}
                className="size-48 [image-rendering:pixelated]"
              />
            </div>
            <figcaption className="mt-3 text-sm text-text-2">
              Farmer preset preview ·{' '}
              <a className="underline hover:text-text" href={heroCreditsTxtUrl}>
                Read TXT credits
              </a>{' '}
              ·{' '}
              <a className="underline hover:text-text" href={heroCreditsCsvUrl}>
                Download CSV credits
              </a>
            </figcaption>
          </figure>
        </header>

        <section
          id="cli-quick-start"
          className="scroll-mt-6 rounded-md border border-border bg-surface p-5"
        >
          <h2 className="text-2xl font-semibold text-text">
            Preview your first character
          </h2>
          <p className="mt-2 max-w-3xl text-sm text-text-2">
            Run these three commands in order. Node.js 22 or newer is required.
            To inspect the CLI without installing it, run{' '}
            <code>npx @lpc-toolkit/cli --help</code>.
          </p>
          <ol className="mt-5 grid gap-4 lg:grid-cols-3">
            {quickStartSteps.map((step, index) => (
              <li
                key={step.command}
                className="min-w-0 rounded-md border border-border bg-surface-2 p-4"
              >
                <p className="text-xs font-semibold uppercase tracking-wide text-text-mute">
                  Step {index + 1}
                </p>
                <h3 className="mt-2 text-lg font-semibold text-text">{step.title}</h3>
                <p className="mt-1 text-sm text-text-2">{step.description}</p>
                <code className={`${codeClassName} mt-4`}>{step.command}</code>
              </li>
            ))}
          </ol>
          <p className="mt-5 rounded-md border border-border bg-surface-2 p-3 text-sm text-text-2">
            The first asset-dependent command downloads about 205 MB of pinned
            assets once, verifies them, and reuses the local cache afterward.
          </p>
        </section>

        <section className="grid gap-5 lg:grid-cols-2">
          <div className="rounded-md border border-border bg-surface p-5">
            <h2 className="text-xl font-semibold text-text">What preview creates</h2>
            <p className="mt-2 text-sm text-text-2">
              Named previews use a predictable directory and keep attribution
              beside the image.
            </p>
            <pre className={`${codeClassName} mt-4`}><code>{`characters/previews/hero/
├── hero.preview.png
├── hero.metadata.json
├── hero.credits.txt
└── hero.credits.csv`}</code></pre>
          </div>
          <div className="rounded-md border border-border bg-surface p-5">
            <h2 className="text-xl font-semibold text-text">Attribution travels with it</h2>
            <p className="mt-2 text-sm text-text-2">
              Metadata records the preview settings and effective license. Keep
              both credit files with the generated sprite when you copy,
              modify, or redistribute it.
            </p>
          </div>
        </section>

        <section className="rounded-md border border-border bg-surface p-5">
          <h2 className="text-2xl font-semibold text-text">Customize the character</h2>
          <p className="mt-2 text-sm text-text-2">
            Once the first preview works, discover a compatible item, inspect
            its exact credits, and persist the selection.
          </p>
          <ol className="mt-5 space-y-4">
            {customizationSteps.map((step, index) => (
              <li
                key={step.command}
                className="rounded-md border border-border bg-surface-2 p-4"
              >
                <div className="flex gap-3">
                  <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-[var(--accent)] text-sm font-semibold text-[var(--accent-ink)]">
                    {index + 1}
                  </span>
                  <div className="min-w-0">
                    <h3 className="text-lg font-semibold text-text">{step.title}</h3>
                    <p className="mt-1 text-sm text-text-2">{step.description}</p>
                    <code className={`${codeClassName} mt-3`}>{step.command}</code>
                  </div>
                </div>
              </li>
            ))}
          </ol>
        </section>

        <section className="rounded-md border border-border bg-surface p-5">
          <h2 className="text-2xl font-semibold text-text">Render final output</h2>
          <p className="mt-2 text-sm text-text-2">
            Export the walk sheet and attributed ZIP after the character looks right.
          </p>
          <code className={`${codeClassName} mt-4`}>
            lpc-toolkit character render hero --out ./dist/hero --animation walk --bundle zip
          </code>
          <p className="mt-4 text-sm text-text-2">
            Render output includes the composed sheet, metadata, TXT and CSV
            credits, and the requested ZIP. Attribution artifacts are required,
            not optional extras.
          </p>
        </section>

        <section className="rounded-md border border-border bg-surface p-5">
          <h2 className="text-xl font-semibold text-text">More CLI workflows</h2>
          <p className="mt-2 text-sm text-text-2">
            Run <code>lpc-toolkit --help</code> for command discovery, or read the{' '}
            <a
              className="underline hover:text-text"
              href={cliReadmeUrl}
              target="_blank"
              rel="noreferrer"
            >
              complete CLI guide
            </a>{' '}
            for selection files, pagination, tokens, cache locations, and troubleshooting.
          </p>
        </section>
      </div>
    </main>
  );
}
```

- [x] **Step 4: Run focused tests and confirm GREEN**

Run:

```sh
rtk pnpm --filter @lpc-toolkit/web test -- landing-page.test.tsx landing-artifacts.test.ts
```

Expected: PASS with both focused test files and two passing tests.

- [x] **Step 5: Commit the progressive tutorial**

Run:

```sh
rtk git add packages/web/src/components/landing-page.tsx packages/web/test/landing-page.test.tsx docs/superpowers/plans/2026-07-17-landing-page-progressive-tutorial.md
rtk git commit -m "feat(web): add progressive landing tutorial"
```

After committing, append the implementation note, full hash, and RED/GREEN
command results under this task before beginning Task 3.

- Implementation note: Replaced the linear reference inventory with an
  outcome-led hero, one Composer action, a CLI anchor, three-command quick
  start, bundled farmer preview and credit links, exact preview output tree,
  secondary customization, one final render command, and a canonical README
  link. Removed landing-level pagination, selection-file, and token reference
  content.
- Verification: `rtk pnpm --filter @lpc-toolkit/web test -- landing-page.test.tsx`
  RED as expected at the missing outcome headline.
- Verification: `rtk pnpm --filter @lpc-toolkit/web test -- landing-page.test.tsx landing-artifacts.test.ts`
  initially FAIL because the required attribution sentence contained an added
  clause before its period; production copy was split without weakening it.
- Verification: `rtk pnpm --filter @lpc-toolkit/web test -- landing-page.test.tsx landing-artifacts.test.ts`
  PASS (2 tests).
- Commit: `35aadc4cbba617aeec2678d579e075bb97399d79`

---

### Task 3: Verify Normal, Embedded, Responsive, and Repository Contracts

**Files:**
- Modify: `docs/superpowers/plans/2026-07-17-landing-page-progressive-tutorial.md`

**Interfaces:**
- Consumes: Task 1's attributed assets and Task 2's `LandingPage` implementation.
- Produces: verification evidence for the web package, embedded CLI build input, architecture boundary, responsive layout, and repository-wide gate.

- [x] **Step 1: Run focused and package checks**

Run each command independently:

```sh
rtk pnpm --filter @lpc-toolkit/web test -- landing-page.test.tsx landing-artifacts.test.ts
rtk pnpm --filter @lpc-toolkit/web run typecheck
rtk pnpm --filter @lpc-toolkit/web build
rtk pnpm --filter @lpc-toolkit/web build:embedded
rtk pnpm check:boundaries
```

Expected: every command exits zero. Confirm both build output directories
contain emitted `hero.preview`, `hero.credits`, or hashed equivalents referenced
by the built HTML/JavaScript.

- Verification: `rtk pnpm --filter @lpc-toolkit/web test -- landing-page.test.tsx landing-artifacts.test.ts`
  PASS (2 tests).
- Verification: `rtk pnpm --filter @lpc-toolkit/web run typecheck` PASS.
- Verification: `rtk pnpm --filter @lpc-toolkit/web build` PASS. The normal
  bundle contains the inline preview PNG and CSV data plus an emitted credits
  TXT asset; only the repository's existing Vite chunk warnings were reported.
- Verification: `rtk pnpm --filter @lpc-toolkit/web build:embedded` PASS. The
  embedded bundle contains the same attributed preview artifacts.
- Verification: `rtk pnpm check:boundaries` PASS.

- [x] **Step 2: Verify desktop and 375-pixel rendering in a browser**

Start the local page:

```sh
rtk pnpm --filter @lpc-toolkit/web exec vite --host 127.0.0.1
```

Inspect `/` at the default desktop viewport and at 375×844. Confirm:

- the hero shows the crisp farmer preview and both actions;
- the CLI anchor reaches `#cli-quick-start`;
- the page has no horizontal overflow (`scrollWidth === clientWidth`);
- every long command scrolls inside its code block;
- the TXT and CSV links resolve successfully; and
- the page presents one `h1` with ordered `h2`/`h3` sections.

- Verification: desktop browser inspection PASS at 1265 pixels wide: one
  `h1`, six `h2` elements, six `h3` elements, ten code blocks, a loaded 64×64
  preview, a working `#cli-quick-start` anchor, and no horizontal overflow.
- Verification: responsive browser inspection PASS at the browser's 360-pixel
  client width for the requested 375×844 viewport: page `scrollWidth` equals
  `clientWidth`, all seven long command blocks scroll internally, the output
  tree preserves line breaks, and the preview remains fully visible.
- Verification: local HTTP requests for `hero.credits.txt` and
  `hero.credits.csv` PASS with the expected eight matching attribution rows.
- Implementation note: Added non-wrapping, horizontally scrollable command
  blocks and preserved whitespace in the generated-file tree after visual
  inspection exposed mobile command wrapping.

- [x] **Step 3: Run the common repository gate**

Run:

```sh
rtk pnpm verify
```

Expected: PASS for asset preparation, source-pin verification, boundaries,
CLI documentation policy tests, plugin verification, workspace typechecks, and
workspace Vitest suites.

- Verification: the first `rtk pnpm verify` run FAILed only because
  `packages/web/test/app-shell.test.tsx` still asserted the removed
  `CLI quick start` heading. The integration assertion was updated to the new
  outcome headline.
- Verification: `rtk pnpm --filter @lpc-toolkit/web test -- app-shell.test.tsx landing-page.test.tsx landing-artifacts.test.ts`
  PASS (5 tests).
- Verification: the second `rtk pnpm verify` run PASSed: core 171 tests,
  presets 3 tests, CLI 355 passed with 1 skipped, and web 684 passed with 1
  skipped, together with source pins, boundaries, documentation policy,
  plugin verification, and workspace typechecks.

- [x] **Step 4: Reassess CLI documentation impact**

Record this final matrix unless verification exposes a changed contract:

```text
help: N/A — no command, option, default, output, or help contract changes
cli-readme: N/A — remains the authoritative complete CLI workflow and reference
root-readme: N/A — its existing complete character-authoring quick start remains valid
landing: update
architecture: N/A — no package ownership or attribution contract changes
engineering: N/A — no command, test, or CI mapping changes
releasing: N/A — no package, version, or publication changes
plugin: N/A — no plugin workflow or supported CLI contract changes
```

- Final reassessment: unchanged from the matrix above. This work updates only
  the landing tutorial presentation and its bundled attributed example; it
  does not change any CLI or plugin contract.

- [x] **Step 5: Commit the completed plan record**

After adding every exact PASS/FAIL result and the full hashes from Tasks 1 and
2, run:

```sh
rtk git add docs/superpowers/plans/2026-07-17-landing-page-progressive-tutorial.md
rtk git commit -m "docs(plan): record landing tutorial verification"
```

Record this final commit's full hash in the plan before handoff.

- Implementation note: Preserved long commands as single horizontally
  scrollable lines, aligned the app-shell route assertion with the new landing
  outcome, and recorded the normal, embedded, responsive, and repository-wide
  verification evidence above.
- Commit: `c73ee8c221fad537d7ba015824edfaa5c6b578b6`
