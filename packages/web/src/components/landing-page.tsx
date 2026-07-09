import { Button } from './ui/button';
import type { NavigableAppRoute } from '../lib/app-route';

interface LandingPageProps {
  readonly onNavigate: (route: NavigableAppRoute) => void;
}

const installCommands = [
  'pnpm --filter @lpc-toolkit/cli build',
  'node packages/cli/dist/index.js --help',
] as const;

const cliCommands = [
  'lpc-toolkit catalog types',
  'lpc-toolkit catalog items --type <typeName>',
  'lpc-toolkit selection validate --selection <file>',
  'lpc-toolkit render --selection <file> --out <dir>',
  'lpc-toolkit token encode --selection <file>',
  'lpc-toolkit token decode --token <hash-or-token> --out <file>',
  'lpc-toolkit preset list',
  'lpc-toolkit preset materialize <preset-id> --out <file>',
  'lpc-toolkit preset render <preset-id> --out <dir>',
] as const;

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
          <Button variant="primary" onClick={() => onNavigate('compose')}>
            Open Composer
          </Button>
        </header>

        <section className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(280px,360px)]">
          <div className="rounded-md border border-border bg-surface p-5">
            <h2 className="text-xl font-semibold text-text">CLI quick start</h2>
            <p className="mt-2 max-w-2xl text-sm text-text-2">
              Build the local CLI, inspect the available commands, then render
              selections or presets with required metadata and credits.
            </p>

            <div className="mt-5 space-y-3">
              {installCommands.map((command) => (
                <code
                  key={command}
                  className="block overflow-x-auto rounded-md border border-border bg-[var(--bg-deep)] px-3 py-2 font-mono text-sm text-text"
                >
                  {command}
                </code>
              ))}
            </div>
          </div>

          <aside className="rounded-md border border-border bg-surface p-5">
            <h2 className="text-lg font-semibold text-text">Web UI</h2>
            <p className="mt-2 text-sm text-text-2">
              Prefer visual composition? Open the browser composer and build a
              character with live preview, export controls, and attribution.
            </p>
            <Button
              className="mt-5 w-full"
              variant="primary"
              onClick={() => onNavigate('compose')}
            >
              Open Composer
            </Button>
          </aside>
        </section>

        <section className="rounded-md border border-border bg-surface p-5">
          <h2 className="text-xl font-semibold text-text">Common commands</h2>
          <div className="mt-4 grid gap-2">
            {cliCommands.map((command) => (
              <code
                key={command}
                className="block overflow-x-auto rounded-md bg-surface-2 px-3 py-2 font-mono text-sm text-text"
              >
                {command}
              </code>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}
