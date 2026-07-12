import { Button } from './ui/button';
import type { NavigableAppRoute } from '../lib/app-route';

interface LandingPageProps {
  readonly onNavigate: (route: NavigableAppRoute) => void;
}

const installCommands = [
  'npm install -g @lpc-toolkit/cli',
  'npx @lpc-toolkit/cli --help',
] as const;

const selectionExample = `{
  "schema": "lpc-toolkit.selection.v1",
  "name": "hero",
  "bodyType": "male",
  "items": {
    "body": { "name": "Body Color", "recolor": "light" }
  }
}`;

const customSelectionCommands = [
  'lpc-toolkit selection validate --selection selection.json',
  'lpc-toolkit render --selection selection.json --out ./rendered --animation walk --frames all --bundle zip',
] as const;

const cliCommands = [
  'lpc-toolkit catalog types',
  'lpc-toolkit catalog items --type hair',
  'lpc-toolkit token encode --selection selection.json',
  'lpc-toolkit web',
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
          <Button variant="primary" onClick={() => onNavigate('compose')}>
            Open Composer
          </Button>
        </header>

        <section className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(280px,360px)]">
          <div className="rounded-md border border-border bg-surface p-5">
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

        <section>
          <h2 className="text-xl font-semibold text-text">CLI examples</h2>
          <div className="mt-4 grid gap-5 lg:grid-cols-2">
            <article className="rounded-md border border-border bg-surface p-5">
              <h3 className="text-lg font-semibold text-text">Render a preset</h3>
              <p className="mt-2 text-sm text-text-2">
                Generate the built-in farmer and its walking animation in one
                command.
              </p>
              <code className={`${codeClassName} mt-4`}>
                lpc-toolkit preset render farmer --out ./farmer --animation walk
              </code>
            </article>

            <article className="rounded-md border border-border bg-surface p-5">
              <h3 className="text-lg font-semibold text-text">
                Render a custom selection
              </h3>
              <p className="mt-2 text-sm text-text-2">
                Save this as <code>selection.json</code>, validate it, then render
                the sheet, frames, and ZIP bundle.
              </p>
              <pre className={`${codeClassName} mt-4`}>
                <code>{selectionExample}</code>
              </pre>
              <div className="mt-3 space-y-3">
                {customSelectionCommands.map((command) => (
                  <code key={command} className={codeClassName}>
                    {command}
                  </code>
                ))}
              </div>
            </article>
          </div>
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
          <h2 className="text-xl font-semibold text-text">Common commands</h2>
          <div className="mt-4 grid gap-2">
            {cliCommands.map((command) => (
              <code key={command} className="block overflow-x-auto rounded-md bg-surface-2 px-3 py-2 font-mono text-sm text-text">
                {command}
              </code>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}
