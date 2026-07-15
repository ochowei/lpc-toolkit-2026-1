import { Button } from './ui/button';
import type { NavigableAppRoute } from '../lib/app-route';

interface LandingPageProps {
  readonly onNavigate: (route: NavigableAppRoute) => void;
}

const installCommands = [
  'npm install -g @lpc-toolkit/cli',
  'npx @lpc-toolkit/cli --help',
] as const;

const developmentInstallCommands = [
  'rtk pnpm --filter @lpc-toolkit/cli pack --pack-destination /tmp',
  'npm install -g /tmp/lpc-toolkit-cli-0.1.4-beta-1.tgz',
] as const;

const characterSteps = [
  {
    title: 'Create a starting character',
    description: 'Start from the farmer preset and save it as hero.',
    command: 'lpc-toolkit character create hero --preset farmer',
  },
  {
    title: 'Search compatible items',
    description: 'Request a bounded JSON page of hair choices for the stored character.',
    command:
      'lpc-toolkit character search hero --type hair --query braid --limit 20 --json',
  },
  {
    title: 'Inspect exact credits',
    description: 'Review the selected item and its complete raw credit entries.',
    command: 'lpc-toolkit catalog item hair_braid --json',
  },
  {
    title: 'Update the character',
    description: 'After reviewing credits, select the braid and apply a brown recolor.',
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
      'lpc-toolkit catalog items --type hair --limit 20 --json',
      'lpc-toolkit token encode --selection selection.json',
      'lpc-toolkit web',
    ],
  },
] as const;

const codeClassName =
  'block overflow-x-auto rounded-md bg-[var(--bg-deep)] px-3 py-2 font-mono text-sm text-text';

export function LandingPage({ onNavigate }: LandingPageProps) {
  return (
    <main className="min-h-screen bg-app text-text">
      <div className="mx-auto flex min-h-screen w-full max-w-6xl flex-col gap-8 px-5 py-6 sm:px-8 lg:px-10">
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-text-mute">
              Local sprite composition toolkit
            </p>
            <h1 className="mt-2 text-3xl font-semibold text-text sm:text-4xl">
              LPC Toolkit
            </h1>
          </div>
          <Button
            className="shrink-0"
            variant="primary"
            onClick={() => onNavigate('compose')}
          >
            Open Composer
          </Button>
        </header>

        <section className="rounded-md border border-border bg-surface p-5">
          <h2 className="text-xl font-semibold text-text">CLI quick start</h2>
          <p className="mt-2 max-w-2xl text-sm text-text-2">
            Install the published CLI globally, or try it once with npx.
            Node.js 22 or newer is required.
          </p>
          <div className="mt-5 space-y-3">
            {installCommands.map((command) => (
              <code key={command} className={codeClassName}>
                {command}
              </code>
            ))}
          </div>
          <p className="mt-5 max-w-2xl text-sm text-text-2">
            The agent workflow below targets the locally packed development CLI.
            0.1.4-beta-1 is a development version and is not published to npm.
          </p>
          <div className="mt-3 space-y-3">
            {developmentInstallCommands.map((command) => (
              <code key={command} className={codeClassName}>
                {command}
              </code>
            ))}
          </div>
        </section>

        <section className="rounded-md border border-border bg-surface p-5">
          <h2 className="text-xl font-semibold text-text">
            Create and edit a named character
          </h2>
          <p className="mt-2 text-sm text-text-2">
            Use the named character commands in order to create and update
            <code className="mx-1">hero</code>. The character is persisted under
            <code className="mx-1">./characters/</code>, so you do not need to
            hand-write a selection JSON file.
          </p>
          <ol className="mt-5 space-y-4">
            {characterSteps.map((step, index) => (
              <li
                key={step.command}
                className="rounded-md border border-border bg-surface-2 p-4"
              >
                <div className="flex gap-3">
                  <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-[var(--accent)] text-sm font-semibold text-[var(--accent-ink)]">
                    {index + 1}
                  </span>
                  <div className="min-w-0">
                    <h3 className="text-lg font-semibold text-text">
                      {step.title}
                    </h3>
                    <p className="mt-1 text-sm text-text-2">{step.description}</p>
                    <code className={`${codeClassName} mt-3`}>
                      {step.command}
                    </code>
                  </div>
                </div>
              </li>
            ))}
          </ol>
          <p className="mt-5 text-sm text-text-2">
            Searches return 20 items by default. When
            <code className="mx-1">page.hasMore</code> is true, continue with
            <code className="mx-1">--offset page.nextOffset</code>. Restart from
            offset zero after changing the catalog source, custom overlay, query
            filters, or character selection.
          </p>
        </section>

        <section className="rounded-md border border-border bg-surface p-5">
          <h2 className="text-xl font-semibold text-text">What render creates</h2>
          <p className="mt-2 text-sm text-text-2">
            Every render includes the composed sprite sheet, metadata JSON,
            <code className="mx-1">.credits.txt</code> and
            <code className="mx-1">.credits.csv</code>. Keep both attribution
            files with exported sprites.
          </p>
        </section>

        <section className="rounded-md border border-border bg-surface p-5">
          <h2 className="text-xl font-semibold text-text">More CLI workflows</h2>
          <p className="mt-2 text-sm text-text-2">
            These secondary commands cover presets, explicit selection JSON,
            catalog exploration, token sharing, and the packaged local web
            server.
          </p>
          <div className="mt-4 space-y-4">
            {secondaryCommandGroups.map((group) => (
              <article key={group.title}>
                <h3 className="text-lg font-semibold text-text">{group.title}</h3>
                <div className="mt-3 space-y-3">
                  {group.commands.map((command) => (
                    <code key={command} className={codeClassName}>
                      {command}
                    </code>
                  ))}
                </div>
              </article>
            ))}
          </div>
        </section>

        <section className="rounded-md border border-border bg-surface p-5">
          <h2 className="text-xl font-semibold text-text">Web Composer</h2>
          <p className="mt-2 text-sm text-text-2">
            Prefer visual composition? Open the browser composer for live
            preview, export controls, and attribution.
          </p>
          <Button
            className="mt-5"
            variant="primary"
            onClick={() => onNavigate('compose')}
          >
            Open Composer
          </Button>
        </section>
      </div>
    </main>
  );
}
