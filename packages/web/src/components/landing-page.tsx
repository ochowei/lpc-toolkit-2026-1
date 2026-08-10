import { useState } from 'react';
import heroPreviewUrl from '../landing-artifacts/hero.preview.png';
import heroCreditsTxtUrl from '../landing-artifacts/hero.credits.txt?url';
import heroCreditsCsvUrl from '../landing-artifacts/hero.credits.csv?url';
import type { NavigableAppRoute } from '../lib/app-route';
import { AgentPromptBuilders } from './agent-prompt-builder';
import { ProductNavigation } from './product-navigation';

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

interface ProductPageProps {
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

const strictRemediationCommands = [
  'lpc-toolkit catalog audit-animations --animation climb --json',
  'lpc-toolkit asset authoring start --plan plan.json --workspace ./my-lpc-art --json',
  'lpc-toolkit asset authoring contract --session <session-id> --workspace ./my-lpc-art --json',
  'lpc-toolkit asset authoring import --session <session-id> --target <target-id> --candidate candidate.png --contract-digest <sha256> --workspace ./my-lpc-art --json',
  'lpc-toolkit asset authoring validate --session <session-id> --workspace ./my-lpc-art --json',
  'lpc-toolkit asset authoring preview --session <session-id> --workspace ./my-lpc-art --json',
] as const;

const phaseOneScaffoldCommand =
  'lpc-toolkit asset init --from-audit audit.json --item hair_braid --pack-id acme.audit --display-name "ACME Audit" --author Alice --license "CC-BY-SA 4.0" --url https://example.com/acme/audit';

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

const releaseAcceptanceCommands = [
  'lpc-toolkit asset authoring acknowledge --session <session-id> --acknowledgement <record.json> --confirm',
  'lpc-toolkit asset authoring declare --session <session-id> --declaration <declaration.json> --confirm',
  'lpc-toolkit asset authoring accept-preview --session <session-id> --preview-digest <sha256> --confirm',
] as const;

const releasePublicationCommands = [
  'lpc-toolkit asset authoring pack --session <session-id> --confirm',
  'lpc-toolkit asset authoring inspect --session <session-id> --archive <archive>',
] as const;

const releaseProvenanceCommands = [
  'lpc-toolkit asset authoring provenance --session <session-id> --confirm',
  'lpc-toolkit asset provenance verify --archive <archive> --provenance <receipt> --json',
] as const;

const releaseConsumerCommands = [
  'lpc-toolkit asset authoring install --session <session-id> --archive <archive> --consumer-workspace <directory> --confirm',
] as const;

const releaseRecoveryCommands = [
  'lpc-toolkit asset authoring draft --session <session-id>',
  'lpc-toolkit asset authoring sync --session <session-id> --confirm',
] as const;

const providerHandoffCommands = [
  'lpc-toolkit agent integration check --manifest manifest.json --json',
  'lpc-toolkit asset authoring provider discover --session <session-id> --contract-digest <sha256> --descriptors providers.json --json',
  'lpc-toolkit asset authoring provider preflight --session <session-id> --contract-digest <sha256> --descriptor provider.json --json',
  'lpc-toolkit asset authoring provider handoff --session <session-id> --descriptor provider.json --consent consent.json --confirm --json',
  'lpc-toolkit asset authoring provider result --session <session-id> --invocation invocation.json --result result.json --candidate candidate.png --workspace ./my-lpc-art --json',
] as const;

const authoringIntelligenceCommands = [
  'lpc-toolkit asset authoring intelligence route --request "Use hair braid" --catalog catalog-snapshot.json --json',
  'lpc-toolkit asset authoring intelligence stage --session <session-id> --operation operation.json --candidate candidate.png --consent consent.json --workspace ./my-lpc-art --confirm --json',
  'lpc-toolkit asset authoring intelligence recover --session <session-id> --operation-digest <sha256> --action resume --workspace ./my-lpc-art --json',
] as const;

const webCliHandoffCommands = [
  'lpc-toolkit asset authoring handoff inspect --handoff handoff.json --archive pack.lpc-assets.zip --json',
  'lpc-toolkit asset authoring handoff import --handoff handoff.json --archive pack.lpc-assets.zip --plan attach-pack-plan.json --workspace ./my-lpc-art --confirm --json',
  'lpc-toolkit asset authoring handoff recover --handoff handoff.json --archive pack.lpc-assets.zip --workspace ./my-lpc-art --action resume --confirm --json',
] as const;

const cliReadmeUrl =
  'https://github.com/ochowei/lpc-toolkit-2026-1/blob/main/packages/cli/README.md';

const pluginReadmeUrl =
  'https://github.com/ochowei/lpc-toolkit-2026-1#codex-plugin';

const codeClassName =
  'block min-h-10 rounded-md border border-border bg-[var(--bg-deep)] px-3 py-2 font-mono text-sm leading-5 text-text';

export function CliPage({ onNavigate }: ProductPageProps) {
  return (
    <main className="min-h-screen bg-app text-text">
      <ProductNavigation activeRoute="cli" onNavigate={onNavigate} />
      <div className="mx-auto flex min-h-screen min-w-0 w-full max-w-6xl flex-col gap-8 overflow-x-hidden px-5 py-6 sm:px-8 lg:px-10">
        <header className="grid items-center gap-8 border-b border-border pb-8 lg:grid-cols-[minmax(0,1fr)_320px]">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-text-mute">
              LPC Toolkit
            </p>
            <h1 className="mt-3 max-w-3xl text-3xl font-semibold text-text sm:text-5xl">
              Create attributed LPC characters from the command line.
            </h1>
            <p className="mt-4 max-w-2xl text-base text-text-2">
              Compose game-ready pixel characters, preview the result, and keep
              the matching licenses and credits with every export.
            </p>
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

        <section className="rounded-md border border-border bg-surface p-5">
          <h2 className="text-2xl font-semibold text-text">
            Author your own LPC asset pack
          </h2>
          <p className="mt-2 max-w-3xl text-sm text-text-2">
            You do not need to clone this repository. The published CLI creates
            a standalone artist workspace, validates complete animation PNGs,
            renders attributed previews, packages a deterministic archive, and
            installs it into a second standalone workspace. A session can also
            create a non-installable recovery draft or synchronize its
            manager-owned overlay after explicit confirmation.
          </p>
          <p className="mt-2 max-w-3xl text-sm text-text-2">
            Character composition, source asset creation, audit handoff,
            validation, formal archive publication, and installation are
            separate CLI responsibilities.
          </p>
          <div className="mt-6 rounded-md border border-accent/40 bg-accent/10 p-4">
            <h3 className="text-lg font-semibold text-text">
              Strict animation-remediation session
            </h3>
            <p className="mt-2 text-sm text-text-2">
              plan.json is explicit input prepared from one selected finding
              and human-provided draft attribution. The published npm package
              includes <code>examples/extend-item-plan.v1.json</code> as a
              complete post-consent field guide, and the Codex plugin carries
              the same template. Replace every example value with reviewed
              evidence. The CLI does not choose the finding, infer consent,
              invent attribution, invoke a provider, or create candidate
              pixels. Read the{' '}
              <a
                className="underline hover:text-text"
                href={cliReadmeUrl}
                target="_blank"
                rel="noreferrer"
              >
                complete CLI guide
              </a>{' '}
              for the plan schema and recovery paths.
            </p>
            <ol className="mt-4 space-y-3">
              {strictRemediationCommands.map((command, index) => (
                <li key={`${index}-${command}`}>
                  <CopyCode children={command} />
                </li>
              ))}
            </ol>
          </div>
          <div className="mt-6 rounded-md border border-border bg-surface-2 p-4">
            <h3 className="text-lg font-semibold text-text">
              Limited Phase 1 scaffold alternative
            </h3>
            <p className="mt-2 text-sm text-text-2">
              This is a mutating direct CLI authoring action. Use it only after
              you review one selected finding and explicitly consent to leave
              the read-only audit; the read-only audit Skill never runs it. It
              cannot scaffold <code>blankFrames</code>, audit errors never become
              drawing tasks, and it does not create a strict authoring session,
              contract, or receipt.
            </p>
            <CopyCode className="mt-4" children={phaseOneScaffoldCommand} />
          </div>
          <h3 className="mt-6 text-lg font-semibold text-text">
            Other direct asset-pack lifecycle commands
          </h3>
          <p className="mt-2 text-sm text-text-2">
            New-item scaffolding and the standalone pack lifecycle remain
            separate from strict animation remediation.
          </p>
          <ol className="mt-4 space-y-3">
            {artistWorkflowCommands.map((command, index) => (
              <li key={`${index}-${command}`}>
                <CopyCode children={command} />
              </li>
            ))}
          </ol>
          <div className="mt-6 rounded-md border border-border bg-surface-2 p-4">
            <h3 className="text-lg font-semibold text-text">
              Record the human release checkpoint separately
            </h3>
            <p className="mt-2 text-sm text-text-2">
              A valid preview is not a release. An authoring session can persist
              one exact warning acknowledgement, an explicit author/source and
              license declaration, and final acceptance of the exact PNG plus
              metadata, TXT-credit, and CSV-credit artifacts. Each command is a
              separate confirmation boundary; stale evidence remains visible in
              the session and never becomes release-ready silently.
            </p>
            <ol className="mt-4 space-y-3">
              {releaseAcceptanceCommands.map((command, index) => (
                <li key={`${index}-${command}`}>
                  <CopyCode children={command} />
                </li>
              ))}
            </ol>
            <p className="mt-4 text-sm text-text-2">
              These receipts govern the authoring session only. Formal archive
              publication and consumer installation remain separate CLI steps.
              Once every release gate is current, formal pack writes a
              non-draft archive below the session-owned release-artifacts
              directory; inspect records the exact archive digest only when it
              matches that formal receipt.
            </p>
            <ol className="mt-4 space-y-3">
              {releasePublicationCommands.map((command, index) => (
                <li key={`${index}-${command}`}>
                  <CopyCode children={command} />
                </li>
              ))}
            </ol>
            <h3 className="mt-5 text-lg font-semibold text-text">
              Carry optional generation provenance separately
            </h3>
            <p className="mt-2 text-sm text-text-2">
              Generation provenance is an optional external companion to the
              exact archive. It is not attribution, a license or authorship
              declaration, human release approval, a ZIP member, or an installer
              input. A copied archive and receipt can be verified read-only from
              a separate consumer root; no provider is invoked.
            </p>
            <ol className="mt-4 space-y-3">
              {releaseProvenanceCommands.map((command, index) => (
                <li key={`${index}-${command}`}>
                  <CopyCode children={command} />
                </li>
              ))}
            </ol>
            <h3 className="mt-5 text-lg font-semibold text-text">
              Optionally activate the exact archive in a consumer workspace
            </h3>
            <p className="mt-2 text-sm text-text-2">
              Consumer activation is explicit and separate from formal
              publication. The target must already be an initialized managed
              workspace outside the artist, repository, cache, and generated
              output roots. The command confirms the exact inspected digest,
              verifies the committed registry/output/source and matching
              <code>CREDITS.csv</code>, and records an installation receipt;
              unchanged retries are idempotent.
            </p>
            <ol className="mt-4 space-y-3">
              {releaseConsumerCommands.map((command, index) => (
                <li key={`${index}-${command}`}>
                  <CopyCode children={command} />
                </li>
              ))}
            </ol>
            <h3 className="mt-5 text-lg font-semibold text-text">
              Recover or synchronize the session separately
            </h3>
            <p className="mt-2 text-sm text-text-2">
              A recovery draft is deterministic evidence, not a formal archive:
              the CLI marks it <code>status: "draft"</code>, public inspect
              reports <code>asset_pack_draft</code>, and public install rejects
              it before changing a consumer workspace. Confirmed sync calls the
              existing linked-sync transaction and records the actual
              manager-owned output and registry generation. Stale source,
              registry, marker, or generated-output evidence remains visible
              instead of being silently replaced.
            </p>
            <ol className="mt-4 space-y-3">
              {releaseRecoveryCommands.map((command, index) => (
                <li key={`${index}-${command}`}>
                  <CopyCode children={command} />
                </li>
              ))}
            </ol>
            <h3 className="mt-5 text-lg font-semibold text-text">
              Optionally hand off a candidate through an Agent integration
            </h3>
            <p className="mt-2 text-sm text-text-2">
              The CLI has no built-in provider and does not trust or invoke one
              automatically. An external integration may supply a bounded
              descriptor, but discovery and preflight are read-only, handoff
              requires explicit consent and <code>--confirm</code>, and result
              bytes are re-digested before they enter the session-owned
              candidate staging root. The existing import, validation, preview,
              attribution, and human release gates remain authoritative.
              Refusals preserve the last valid checkpoint and return one safe
              next action.
            </p>
            <ol className="mt-4 space-y-3">
            {providerHandoffCommands.map((command, index) => (
                <li key={`${index}-${command}`}>
                  <CopyCode children={command} />
                </li>
              ))}
            </ol>
            <h3 className="mt-5 text-lg font-semibold text-text">
              Route and stage deterministic authoring candidates
            </h3>
            <p className="mt-2 text-sm text-text-2">
              Authoring intelligence is catalog-first and deterministic. It can
              route a bounded request, prepare a variant, recolor, explicit
              geometry, or multi-layer candidate, but it does not require a
              model, provider, backend, network, authentication, or persistent
              browser state. Route is read-only; staging requires exact consent
              and <code>--confirm</code>, writes only session-owned candidate
              evidence, and returns an explicit next action for the existing
              import, validation, attributed preview, and human review gates.
              Refusal and stale state remain recoverable. Provider handoff
              evidence is optional, and the Web-to-CLI handoff stays
              file-scoped.
            </p>
            <ol className="mt-4 space-y-3">
              {authoringIntelligenceCommands.map((command, index) => (
                <li key={`${index}-${command}`}>
                  <CopyCode children={command} />
                </li>
              ))}
            </ol>
            <h3 className="mt-5 text-lg font-semibold text-text">
              Transfer one Web revision to the CLI explicitly
            </h3>
            <p className="mt-2 text-sm text-text-2">
              The Workbench <strong>Export for CLI</strong> action downloads the
              existing asset archive and a strict handoff sidecar from one
              stable in-memory revision. It never uploads or persists browser
              authoring state. Inspect the pair first, then choose an explicit
              attach-pack plan and CLI confirmation; stale pairs stop before
              mutation, and the handoff never satisfies validation, preview,
              candidate-import, attribution, or release gates.
            </p>
            <ol className="mt-4 space-y-3">
              {webCliHandoffCommands.map((command, index) => (
                <li key={`${index}-${command}`}>
                  <CopyCode children={command} />
                </li>
              ))}
            </ol>
            <p className="mt-4 text-sm text-text-2">
              A successful import records a separate
              <code>web-handoff-receipt.json</code> sidecar. Older sessions
              remain readable, and <code>asset authoring status</code> exposes
              only bounded optional <code>webHandoff</code> evidence. Web handoff
              is not release approval.
            </p>
            <h3 className="mt-5 text-lg font-semibold text-text">
              Review cross-pack conflicts explicitly
            </h3>
            <p className="mt-2 text-sm text-text-2">
              Inspect competing pack or version evidence without choosing an
              automatic winner. Inspect is read-only; resolve requires a
              complete user selection, review evidence, and <code>--confirm</code>{' '}
              before writing only a workspace-owned staging receipt. Existing
              candidate import, validation, attributed preview, human review,
              and release gates remain downstream authorities.
            </p>
            <ol className="mt-4 space-y-3">
              <li>
                <CopyCode children="lpc-toolkit asset conflict inspect --conflict conflict.json --json" />
              </li>
              <li>
                <CopyCode children="lpc-toolkit asset conflict resolve --conflict conflict.json --selection selection.json --workspace ./my-lpc-art --confirm --json" />
              </li>
              <li>
                <CopyCode children="lpc-toolkit asset conflict recover --receipt .lpc-toolkit/asset-packs/staging/conflict-resolutions/<conflict-id>/receipt.json --action resume --workspace ./my-lpc-art --confirm --json" />
              </li>
            </ol>
            <p className="mt-4 text-sm text-text-2">
              Stale, tampered, incompatible, missing-attribution, and refused
              records return one safe next action. Provenance, provider,
              distribution, and authoring evidence is retained as evidence
              only; conflict review adds no remote registry, signing, backend,
              authentication, npm publication, or persistent browser authoring
              state.
            </p>
          </div>
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

export function AgentIntegrationsPage({ onNavigate }: ProductPageProps) {
  return (
    <main className="min-h-screen bg-app text-text">
      <ProductNavigation activeRoute="agents" onNavigate={onNavigate} />
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-5 py-8 sm:px-8 lg:px-10">
        <header className="border-b border-border pb-8">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-text-mute">
            LPC Toolkit
          </p>
          <h1 className="mt-3 text-3xl font-semibold text-text sm:text-5xl">
            Agent Integrations
          </h1>
          <p className="mt-4 max-w-2xl text-base text-text-2">
            Choose what you want to make. Codex guides the questions, shows
            when authority changes, and preserves attributed CLI output.
          </p>
        </header>

        <section aria-labelledby="agent-prompts-heading">
          <div className="mb-5">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-text-mute">
              Choose your goal
            </p>
            <h2 id="agent-prompts-heading" className="mt-2 text-2xl font-semibold text-text">
              Start with the outcome you need
            </h2>
            <p className="mt-2 max-w-3xl text-sm text-text-2">
              Customize one short kickoff prompt. Codex asks stage-specific
              follow-up questions instead of making you complete a technical form.
            </p>
            <p className="mt-2 max-w-3xl text-sm text-text-2">
              Copy kickoff prompt only copies the request; it does not run the
              journey. After you paste it into a Codex task,{' '}
              <code>$lpc-animation-asset-audit</code> performs the read-only audit.
              Once you confirm one bounded revision, <code>$lpc-asset-authoring</code>{' '}
              continues in the same Codex task through a strict local authoring
              session. If either Skill is unavailable, use the CLI directly with
              the same confirmation boundaries.
            </p>
            <p className="mt-2 max-w-3xl text-sm text-text-2">
              The default Agent-guided endpoint remains a review-ready preview.
              After a separately authorized installation succeeds, return in the
              same Codex task to <code>$lpc-animation-asset-audit</code> with the
              original animation, type, and body-type bounds. Inspect{' '}
              <code>unsupported</code>, <code>missingFiles</code>,{' '}
              <code>blankFrames</code>, and <code>errors</code>. Exit code zero
              only means the audit ran; it does not mean the remediation is
              closed.
            </p>
          </div>
          <AgentPromptBuilders />
        </section>

        <details className="rounded-md border border-border bg-surface p-5">
          <summary className="cursor-pointer text-xl font-semibold text-text">
            One-time setup for Codex
          </summary>
          <p className="mt-3 max-w-3xl text-sm text-text-2">
            Returning users can skip this section. New users need Node.js 22 or
            newer, a compatible CLI, the marketplace, and plugin <code>0.3.0</code>.
            Start a new task after installation.
          </p>
          <ol className="mt-5 grid min-w-0 gap-4">
            {[
              "npm install -g '@lpc-toolkit/cli@>=0.2.0 <0.3.0'",
              'codex plugin marketplace add ochowei/lpc-toolkit-2026-1',
              'codex plugin add lpc-toolkit@lpc-toolkit',
            ].map((command, index) => (
              <li key={command} className="min-w-0 rounded-md border border-border bg-surface-2 p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-text-mute">Step {index + 1}</p>
                <CopyCode className="mt-3" children={command} />
              </li>
            ))}
          </ol>
          <p className="mt-4 text-sm text-text-2">
            The plugin checks the installed CLI against <code>&gt;=0.2.0 &lt;0.3.0</code>
            and never upgrades it silently.{' '}
            <a className="underline hover:text-text" href={pluginReadmeUrl} target="_blank" rel="noreferrer">
              Read the plugin details
            </a>
            .
          </p>
        </details>

        <section className="rounded-md border border-accent/40 bg-accent/10 p-5">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-text-mute">Safety summary</p>
          <h2 className="mt-2 text-xl font-semibold text-text">You approve every authority change</h2>
          <p className="mt-2 max-w-3xl text-sm text-text-2">
            Catalog search and animation audit are read-only. Codex asks before
            source files change, before references or prompts leave the task,
            and before a provider is used. A review-ready preview is not a
            release or installation.
          </p>
        </section>

        <details className="rounded-md border border-border bg-surface p-5">
          <summary className="cursor-pointer text-xl font-semibold text-text">
            For integration developers: use the public CLI workflow
          </summary>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-text-mute">
            Connect through the CLI
          </p>
          <h2 className="mt-2 text-2xl font-semibold text-text">
            Agent integrations guide the handoff; the CLI validates it
          </h2>
          <p className="mt-2 max-w-3xl text-sm text-text-2">
            Use the public CLI interface with a provider description you
            explicitly supply. There is no built-in provider, remote registry,
            credential collection, hidden network call, or persistent browser
            authoring state. The integration checker reports missing required
            capabilities and whether the artist can continue without an
            external provider before any handoff.
          </p>
          <div className="mt-4 grid min-w-0 gap-3">
            <CopyCode children="lpc-toolkit agent integration check --manifest manifest.json --json" />
            <CopyCode children="lpc-toolkit asset authoring provider preflight --session <session-id> --contract-digest <sha256> --descriptor provider.json --json" />
          </div>
          <p className="mt-4 max-w-3xl text-sm text-text-2">
            A confirmed handoff persists only a bounded invocation. A returned
            PNG is re-digested and staged as a session candidate; the existing
            import, validation, attributed preview, attribution, and human
            release gates still decide whether it can become pack source or a
            formal release. Provider identity is provenance evidence, not
            authorship, licensing, consent, or approval.
          </p>
        </details>
      </div>
    </main>
  );
}
