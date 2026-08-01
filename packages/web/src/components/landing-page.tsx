import { useState } from 'react';
import heroPreviewUrl from '../landing-artifacts/hero.preview.png';
import heroCreditsTxtUrl from '../landing-artifacts/hero.credits.txt?url';
import heroCreditsCsvUrl from '../landing-artifacts/hero.credits.csv?url';
import type { NavigableAppRoute } from '../lib/app-route';
import { Button } from './ui/button';

interface CopyCodeProps {
  readonly children: string;
  readonly className?: string;
  readonly multiline?: boolean;
  readonly showCopy?: boolean;
}

function CopyCode({
  children,
  className,
  multiline = false,
  showCopy = true,
}: CopyCodeProps) {
  const [copied, setCopied] = useState(false);

  async function copyCode() {
    try {
      await navigator.clipboard.writeText(children);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div
      className={`${codeClassName.replace('overflow-x-auto', 'overflow-hidden')} min-w-0 max-w-full flex items-center gap-3 ${className ?? ''}`}
    >
      <code className={`min-w-0 max-w-full flex-1 ${multiline ? 'whitespace-pre-wrap break-words' : 'whitespace-normal break-words'}`}>
        {children}
      </code>
      {showCopy && (
        <button
          type="button"
          aria-label={copied ? 'Copied' : 'Copy code'}
          title={copied ? 'Copied' : 'Copy code'}
          onClick={() => void copyCode()}
          className="flex size-8 shrink-0 items-center justify-center rounded border border-border-strong text-text-2 transition-colors hover:bg-surface-3 hover:text-text"
        >
          {copied ? (
            <span aria-hidden="true" className="text-sm text-[var(--success)]">✓</span>
          ) : (
            <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
              <rect x="9" y="9" width="11" height="11" rx="2" />
              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
            </svg>
          )}
        </button>
      )}
    </div>
  );
}

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
    description: 'Select the braid and apply its brown primary color.',
    command:
      'lpc-toolkit character set hero --type hair --item hair_braid --recolor lpcr.brown',
  },
  {
    title: 'Set an asset color channel',
    description: 'Give the selected expression its own eye color.',
    command:
      'lpc-toolkit character set-color hero --type expression --channel eyes --color green',
  },
] as const;

const artistWorkflowCommands = [
  'npm install -g @lpc-toolkit/cli',
  'lpc-toolkit asset workspace init ./my-lpc-art',
  'cd ./my-lpc-art',
  'lpc-toolkit asset init --new --pack-id acme.fantasy-hair --asset-id moon-braid --display-name "Moon Braid" --type hair --body-type male --body-type female --animation walk --animation climb --author Alice --license "CC-BY-SA 4.0" --url https://example.com/acme/fantasy-hair',
  'lpc-toolkit asset validate ./artist-packs/<pack-id>',
  'lpc-toolkit asset preview ./artist-packs/<pack-id>',
  'lpc-toolkit asset sync ./artist-packs/<pack-id>',
  'lpc-toolkit asset pack ./artist-packs/<pack-id>',
  'lpc-toolkit asset workspace init ../consumer-workspace',
  'cd ../consumer-workspace',
  'lpc-toolkit asset install ../my-lpc-art/artist-packs/<pack-id>-<version>.lpc-assets.zip',
  'lpc-toolkit asset doctor',
] as const;

const cliReadmeUrl =
  'https://github.com/ochowei/lpc-toolkit-2026-1/blob/main/packages/cli/README.md';

const pluginReadmeUrl =
  'https://github.com/ochowei/lpc-toolkit-2026-1#codex-plugin';

const codeClassName =
  'block min-h-10 rounded-md border border-border bg-[var(--bg-deep)] px-3 py-2 font-mono text-sm leading-5 text-text';

export function LandingPage({ onNavigate }: LandingPageProps) {
  return (
    <main className="min-h-screen bg-app text-text">
      <div className="mx-auto flex min-h-screen min-w-0 w-full max-w-6xl flex-col gap-8 overflow-x-hidden px-5 py-6 sm:px-8 lg:px-10">
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
          <ol className="mt-5 grid min-w-0 gap-4">
            {quickStartSteps.map((step, index) => (
              <li
                key={step.command}
                className="min-w-0 rounded-md border border-border bg-surface-2 p-4"
              >
                <p className="text-xs font-semibold uppercase tracking-wide text-text-mute">
                  Step {index + 1}
                </p>
                <h3 className="mt-2 text-lg font-semibold text-text">
                  {step.title}
                </h3>
                <p className="mt-1 text-sm text-text-2">{step.description}</p>
                <CopyCode className="mt-4" children={step.command} />
              </li>
            ))}
          </ol>
          <p className="mt-5 rounded-md border border-border bg-surface-2 p-3 text-sm text-text-2">
            The first asset-dependent command downloads about 205 MB of pinned
            assets once, verifies them, and reuses the local cache afterward.
          </p>
        </section>

        <section
          id="codex-plugin"
          className="scroll-mt-6 rounded-md border border-border bg-surface p-5"
        >
          <h2 className="text-2xl font-semibold text-text">
            Install the Codex plugin
          </h2>
          <p className="mt-2 max-w-3xl text-sm text-text-2">
            Give Codex a focused workflow for creating, editing, previewing,
            and rendering attributed LPC characters. Install the CLI first,
            then add the beta marketplace and enable the plugin.
          </p>
          <ol className="mt-5 grid min-w-0 gap-4">
            {[
              'npm install -g @lpc-toolkit/cli',
              'codex plugin marketplace add ochowei/lpc-toolkit-2026-1',
              'codex plugin add lpc-toolkit@lpc-toolkit',
            ].map((command, index) => (
              <li
                key={command}
                className="min-w-0 rounded-md border border-border bg-surface-2 p-4"
              >
                <p className="text-xs font-semibold uppercase tracking-wide text-text-mute">
                  Step {index + 1}
                </p>
                <CopyCode className="mt-3" children={command} />
              </li>
            ))}
          </ol>
          <p className="mt-4 text-sm text-text-2">
            The plugin requires Node.js 22 or newer and an installed
            compatible CLI.{' '}
            <a
              className="underline hover:text-text"
              href={pluginReadmeUrl}
              target="_blank"
              rel="noreferrer"
            >
              Read the plugin details
            </a>
            .
          </p>
        </section>

        <section className="rounded-md border border-border bg-surface p-5">
          <h2 className="text-2xl font-semibold text-text">
            Author your own LPC asset pack
          </h2>
          <p className="mt-2 max-w-3xl text-sm text-text-2">
            You do not need to clone this repository. The published CLI creates
            a standalone artist workspace, validates complete animation PNGs,
            renders attributed previews, packages a deterministic archive, and
            installs it into a second standalone workspace.
          </p>
          <ol className="mt-5 space-y-3">
            {artistWorkflowCommands.map((command, index) => (
              <li key={`${index}-${command}`}>
                <CopyCode children={command} />
              </li>
            ))}
          </ol>
          <p className="mt-4 text-sm text-text-2">
            Put PNGs under <code>artist-packs/&lt;pack-id&gt;/sprites/</code>.
            Keep the preview metadata and credit files with the generated
            image.
          </p>
          <p className="mt-2 text-sm text-text-2">
            The browser can inspect, validate, repair, and assemble an uploaded
            asset pack locally. The CLI owns package inspection, install,
            upgrade, removal, and lifecycle diagnosis; Web edits happen
            in-memory and do not write an artist workspace. Browser drafts carry
            <code>status: "draft"</code> and the CLI refuses to install them
            until a formal release is downloaded.
          </p>
        </section>

        <section className="grid gap-5 lg:grid-cols-2">
          <div className="rounded-md border border-border bg-surface p-5">
            <h2 className="text-xl font-semibold text-text">
              What preview creates
            </h2>
            <p className="mt-2 text-sm text-text-2">
              Named previews use a predictable directory and keep attribution
              beside the image.
            </p>
            <CopyCode multiline showCopy={false} className="mt-4" children={`characters/previews/hero/
├── hero.preview.png
├── hero.metadata.json
├── hero.credits.txt
└── hero.credits.csv`} />
          </div>
          <div className="rounded-md border border-border bg-surface p-5">
            <h2 className="text-xl font-semibold text-text">
              Attribution travels with it
            </h2>
            <p className="mt-2 text-sm text-text-2">
              Metadata records the preview settings and effective license. Keep
              both credit files with the generated sprite. Carry them forward
              when you copy, modify, or redistribute it.
            </p>
          </div>
        </section>

        <section className="rounded-md border border-border bg-surface p-5">
          <h2 className="text-2xl font-semibold text-text">
            Customize the character
          </h2>
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
                    <h3 className="text-lg font-semibold text-text">
                      {step.title}
                    </h3>
                    <p className="mt-1 text-sm text-text-2">
                      {step.description}
                    </p>
                    <CopyCode className="mt-3" children={step.command} />
                  </div>
                </div>
              </li>
            ))}
          </ol>
        </section>

        <section className="rounded-md border border-border bg-surface p-5">
          <h2 className="text-2xl font-semibold text-text">
            Render final output
          </h2>
          <p className="mt-2 text-sm text-text-2">
            Export the walk sheet and attributed ZIP after the character looks
            right.
          </p>
          <CopyCode className="mt-4" children="lpc-toolkit character render hero --out ./dist/hero --animation walk --bundle zip" />
          <p className="mt-4 text-sm text-text-2">
            Render output includes the composed sheet, metadata, TXT and CSV
            credits, and the requested ZIP. Attribution artifacts are required,
            not optional extras.
          </p>
          <p className="mt-2 text-sm text-text-2">
            Final render output also includes <code>hero.viewer.html</code>, a
            standalone offline animation viewer.
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
            for selection files, pagination, tokens, cache locations, and
            troubleshooting.
          </p>
        </section>
      </div>
    </main>
  );
}
