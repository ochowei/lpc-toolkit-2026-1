import { useState } from 'react';

interface CreateCharacterFields {
  readonly concept: string;
  readonly startingPoint: string;
  readonly details: string;
}

interface AnimationExtensionFields {
  readonly item: string;
  readonly animations: string;
  readonly details: string;
}

interface NewAssetFields {
  readonly concept: string;
  readonly assetType: string;
  readonly animations: string;
}

type JourneyId = 'compose' | 'extend' | 'new';

export function buildCreateCharacterPrompt(fields: CreateCharacterFields): string {
  const start = fields.startingPoint === 'Let the agent choose'
    ? 'Let the agent choose a suitable starting point'
    : `Start from ${fields.startingPoint}`;
  return `Build an LPC character from existing catalog art based on a ${fields.concept.trim()} concept. ${start}, assemble ${fields.details.trim()}, generate an attributed preview, and ask what I want to refine next. Do not create or edit source asset pixels.`;
}

export function buildAnimationExtensionPrompt(fields: AnimationExtensionFields): string {
  return `Find the existing LPC catalog item ${fields.item.trim()} and run a read-only audit for ${fields.animations.trim()}. Show me the bounded evidence and retained item identity first. If ${fields.details.trim()}, propose an animation-extension revision, explain the source files and credits that would be affected, and ask for my explicit confirmation before modifying assets or using a provider. Stop at a validated, attributed review-ready preview; do not release or install it.`;
}

export function buildNewAssetPrompt(fields: NewAssetFields): string {
  return `Create a new attributed LPC ${fields.assetType.trim()} asset based on ${fields.concept.trim()}, covering ${fields.animations.trim()}. Check the catalog first, constrain the work to supported LPC layouts, then ask me for draft attribution before generating pixels. Explain any provider or reference disclosure and get my explicit consent before use. Import and validate the result, then stop at an attributed review-ready preview; do not release or install it.`;
}

export function buildCreateCharacterResult(concept: string): string {
  return `An attributed preview for ${concept.trim()}, its metadata, credits TXT and credits CSV, plus a conversational next step for refinement or export.`;
}

export function buildAnimationExtensionResult(item: string): string {
  return `First, a read-only finding for ${item.trim()}. After separate confirmation: the same item identity with the selected animation revision, current validation, and an attributed review-ready preview.`;
}

export function buildNewAssetResult(assetType: string): string {
  return `One new ${assetType.trim()} identity with imported source, current validation, and an attributed review-ready preview. Formal release and installation remain separate.`;
}

const fieldClassName = 'mt-1 w-full rounded-md border border-border-strong bg-surface-2 px-3 py-2 text-sm text-text outline-none focus:border-accent';

function TextField({ label, value, onChange }: { readonly label: string; readonly value: string; readonly onChange: (value: string) => void }) {
  return <label className="text-sm text-text-2">{label}<input data-prompt-input="true" className={fieldClassName} value={value} onChange={(event) => onChange(event.target.value)} /></label>;
}

function AuthorityStages({ stages }: { readonly stages: readonly { label: string; authority: string }[] }) {
  return (
    <ol aria-label="Journey stages" className="mt-4 grid gap-2 sm:grid-cols-3">
      {stages.map((stage, index) => (
        <li key={stage.label} className="rounded-md border border-border bg-surface-2 p-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-text-mute">Stage {index + 1}</p>
          <p className="mt-1 text-sm font-semibold text-text">{stage.label}</p>
          <span className="mt-2 inline-flex rounded-full border border-border-strong px-2 py-0.5 text-xs text-text-2">{stage.authority}</span>
        </li>
      ))}
    </ol>
  );
}

function PromptPanel({
  title,
  term,
  prompt,
  result,
  valid,
  onReset,
  stages,
  children,
}: {
  readonly title: string;
  readonly term: string;
  readonly prompt: string;
  readonly result: string;
  readonly valid: boolean;
  readonly onReset: () => void;
  readonly stages: readonly { label: string; authority: string }[];
  readonly children: React.ReactNode;
}) {
  const [copyStatus, setCopyStatus] = useState('');
  async function copyPrompt() {
    if (!valid) return;
    try {
      await navigator.clipboard.writeText(prompt);
      setCopyStatus('Copied');
      window.setTimeout(() => setCopyStatus(''), 1600);
    } catch {
      setCopyStatus('Copy failed');
    }
  }
  return (
    <article className="rounded-md border border-border bg-surface p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-text-mute">{term}</p>
          <h3 className="mt-1 text-xl font-semibold text-text">{title}</h3>
        </div>
        <button type="button" onClick={onReset} className="text-sm text-text-2 underline hover:text-text">Reset</button>
      </div>
      <AuthorityStages stages={stages} />
      <div className="mt-5 grid gap-3 sm:grid-cols-3">{children}</div>
      <div className="mt-4 rounded-md border border-border bg-[var(--bg-deep)] p-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-text-mute">Prompt preview</p>
        <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-text">{prompt}</p>
      </div>
      <details className="mt-3 rounded-md border border-border px-3 py-2 text-sm text-text-2">
        <summary className="cursor-pointer font-semibold text-text">Expected result and files</summary>
        <p className="mt-2 leading-6">{result}</p>
      </details>
      <div className="mt-4 flex items-center gap-3">
        <button type="button" disabled={!valid} onClick={() => void copyPrompt()} className="rounded-md border border-border-strong bg-accent px-4 py-2 text-sm font-semibold text-[var(--accent-ink)] disabled:cursor-not-allowed disabled:opacity-50">Copy kickoff prompt</button>
        <span aria-live="polite" className="text-sm text-text-2">{copyStatus}</span>
      </div>
      {!valid && <p className="mt-2 text-xs text-[var(--danger)]">Complete every field to copy this prompt.</p>}
    </article>
  );
}

const composeDefaults = { concept: 'fisher', startingPoint: 'Let the agent choose', details: 'practical clothes, boots, and fishing gear' };
const extendDefaults = { item: 'a sword with incomplete run support', animations: 'run', details: 'the audit proves a supported missing animation' };
const newDefaults = { concept: 'a moonlit braided hairstyle', assetType: 'hair', animations: 'walk and idle' };

const journeys: readonly { id: JourneyId; title: string; term: string; description: string }[] = [
  { id: 'compose', title: 'Build a character from existing art', term: 'Sprite composition', description: 'Choose and combine catalog assets. No source pixels change.' },
  { id: 'extend', title: 'Add a missing animation', term: 'Animation extension', description: 'Audit first, then confirm one bounded revision.' },
  { id: 'new', title: 'Create a new asset', term: 'New asset authoring', description: 'Create one new identity for a supported LPC layout.' },
];

export function AgentPromptBuilders() {
  const [active, setActive] = useState<JourneyId>('compose');
  const [compose, setCompose] = useState<CreateCharacterFields>(composeDefaults);
  const [extend, setExtend] = useState<AnimationExtensionFields>(extendDefaults);
  const [newAsset, setNewAsset] = useState<NewAssetFields>(newDefaults);

  return (
    <div>
      <div role="tablist" aria-label="Choose your goal" className="grid gap-3 lg:grid-cols-3">
        {journeys.map((journey) => (
          <button key={journey.id} type="button" role="tab" aria-selected={active === journey.id} onClick={() => setActive(journey.id)} className={`rounded-md border p-4 text-left ${active === journey.id ? 'border-accent bg-accent/10' : 'border-border bg-surface'}`}>
            <span className="text-xs font-semibold uppercase tracking-wide text-text-mute">{journey.term}</span>
            <span className="mt-1 block font-semibold text-text">{journey.title}</span>
            <span className="mt-2 block text-sm leading-5 text-text-2">{journey.description}</span>
          </button>
        ))}
      </div>

      <div className="mt-4">
        {active === 'compose' && (
          <PromptPanel title="Build a character from existing art" term="Sprite composition" prompt={buildCreateCharacterPrompt(compose)} result={buildCreateCharacterResult(compose.concept)} valid={Object.values(compose).every((value) => value.trim())} onReset={() => setCompose(composeDefaults)} stages={[{ label: 'Choose existing art', authority: 'Read catalog' }, { label: 'Compose and validate', authority: 'Write character file' }, { label: 'Review attributed preview', authority: 'Preview only' }]}>
            <TextField label="Character idea" value={compose.concept} onChange={(concept) => setCompose({ ...compose, concept })} />
            <label className="text-sm text-text-2">Starting point<select data-prompt-input="true" className={fieldClassName} value={compose.startingPoint} onChange={(event) => setCompose({ ...compose, startingPoint: event.target.value })}>{['Let the agent choose', 'farmer preset', 'villager preset', 'no preset'].map((value) => <option key={value}>{value}</option>)}</select></label>
            <TextField label="Important details" value={compose.details} onChange={(details) => setCompose({ ...compose, details })} />
          </PromptPanel>
        )}
        {active === 'extend' && (
          <PromptPanel title="Add a missing animation" term="Animation extension" prompt={buildAnimationExtensionPrompt(extend)} result={buildAnimationExtensionResult(extend.item)} valid={Object.values(extend).every((value) => value.trim())} onReset={() => setExtend(extendDefaults)} stages={[{ label: 'Audit the gap', authority: 'Read-only' }, { label: 'Confirm revision', authority: 'User approval required' }, { label: 'Import and preview', authority: 'Write bounded source' }]}>
            <TextField label="Existing item" value={extend.item} onChange={(item) => setExtend({ ...extend, item })} />
            <TextField label="Missing animation" value={extend.animations} onChange={(animations) => setExtend({ ...extend, animations })} />
            <TextField label="When to proceed" value={extend.details} onChange={(details) => setExtend({ ...extend, details })} />
          </PromptPanel>
        )}
        {active === 'new' && (
          <PromptPanel title="Create a new asset" term="New asset authoring" prompt={buildNewAssetPrompt(newAsset)} result={buildNewAssetResult(newAsset.assetType)} valid={Object.values(newAsset).every((value) => value.trim())} onReset={() => setNewAsset(newDefaults)} stages={[{ label: 'Define supported scope', authority: 'Read catalog' }, { label: 'Confirm credits and provider', authority: 'User approval required' }, { label: 'Import and preview', authority: 'Write new source' }]}>
            <TextField label="Asset idea" value={newAsset.concept} onChange={(concept) => setNewAsset({ ...newAsset, concept })} />
            <TextField label="Asset type" value={newAsset.assetType} onChange={(assetType) => setNewAsset({ ...newAsset, assetType })} />
            <TextField label="Animations" value={newAsset.animations} onChange={(animations) => setNewAsset({ ...newAsset, animations })} />
          </PromptPanel>
        )}
      </div>
    </div>
  );
}
