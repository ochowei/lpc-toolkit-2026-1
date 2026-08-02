import { useState } from 'react';

interface CreateCharacterFields {
  readonly concept: string;
  readonly startingPoint: string;
  readonly details: string;
}

interface RefineCharacterFields {
  readonly characterName: string;
  readonly part: string;
  readonly result: string;
}

interface ExportCharacterFields {
  readonly characterName: string;
  readonly animations: string;
  readonly bundle: string;
}

interface AnimationAuditFields {
  readonly assetType: string;
  readonly animations: string;
  readonly worklistSize: string;
}

export function buildCreateCharacterPrompt(fields: CreateCharacterFields): string {
  const start = fields.startingPoint === 'Let the agent choose'
    ? 'Let the agent choose a suitable starting point'
    : fields.startingPoint === 'Start without a preset'
      ? 'Start without a preset'
      : `Start from the ${fields.startingPoint.replace('Start from ', '')} preset`;
  return `Create an LPC character based on a ${fields.concept.trim()} concept. ${start}, assemble ${fields.details.trim()} from available assets, generate an attributed preview, and help me refine the result.`;
}

export function buildRefineCharacterPrompt(fields: RefineCharacterFields): string {
  return `Refine my LPC character named ${fields.characterName.trim()} by changing its ${fields.part.trim()} to ${fields.result.trim()}. Preserve the rest of the character, validate the change, and show me an attributed preview.`;
}

export function buildExportCharacterPrompt(fields: ExportCharacterFields): string {
  return `Preview my LPC character named ${fields.characterName.trim()} using the ${fields.animations.trim()} animations, then render an ${fields.bundle.trim()}. Validate the character first and verify the metadata and both credits files before handing off the artifacts.`;
}

export function buildAnimationAuditPrompt(fields: AnimationAuditFields): string {
  return `Run a read-only animation audit for ${fields.assetType.trim()} assets covering ${fields.animations.trim()}. Return a bounded drawing worklist of at most ${fields.worklistSize.trim()} items, identify the missing or incomplete animation support, and do not modify source assets.`;
}

const fieldClassName = 'mt-1 w-full rounded-md border border-border-strong bg-surface-2 px-3 py-2 text-sm text-text outline-none focus:border-accent';

function PromptCard({
  title,
  tag,
  prompt,
  valid,
  onReset,
  children,
}: {
  readonly title: string;
  readonly tag: string;
  readonly prompt: string;
  readonly valid: boolean;
  readonly onReset: () => void;
  readonly children: React.ReactNode;
}) {
  const [copied, setCopied] = useState(false);

  async function copyPrompt() {
    if (!valid) return;
    try {
      await navigator.clipboard.writeText(prompt);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopied(false);
    }
  }

  return (
    <article className="flex min-w-0 flex-col rounded-md border border-border bg-surface p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-text-mute">{tag}</p>
          <h3 className="mt-1 text-lg font-semibold text-text">{title}</h3>
        </div>
        <button type="button" onClick={onReset} className="text-sm text-text-2 underline hover:text-text">Reset</button>
      </div>
      <div className="mt-4 grid gap-3">{children}</div>
      <div className="mt-4 rounded-md border border-border bg-[var(--bg-deep)] p-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-text-mute">Prompt preview</p>
        <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-text">{prompt}</p>
      </div>
      <button
        type="button"
        disabled={!valid}
        onClick={() => void copyPrompt()}
        className="mt-4 rounded-md border border-border-strong bg-accent px-4 py-2 text-sm font-semibold text-[var(--accent-ink)] disabled:cursor-not-allowed disabled:opacity-50"
      >
        {copied ? 'Copied' : 'Copy prompt'}
      </button>
      {!valid && <p className="mt-2 text-xs text-[var(--danger)]">Complete every field to copy this prompt.</p>}
    </article>
  );
}

function TextField({ label, value, onChange }: { readonly label: string; readonly value: string; readonly onChange: (value: string) => void }) {
  return <label className="text-sm text-text-2">{label}<input className={fieldClassName} value={value} onChange={(event) => onChange(event.target.value)} /></label>;
}

function AnimationChoices({ selected, onChange }: { readonly selected: readonly string[]; readonly onChange: (value: readonly string[]) => void }) {
  return (
    <fieldset>
      <legend className="text-sm text-text-2">Animations</legend>
      <div className="mt-2 flex flex-wrap gap-3">
        {['walk', 'idle', 'run'].map((animation) => (
          <label key={animation} className="flex items-center gap-2 text-sm text-text">
            <input
              type="checkbox"
              checked={selected.includes(animation)}
              onChange={(event) => onChange(event.target.checked ? [...selected, animation] : selected.filter((value) => value !== animation))}
            />
            {animation}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

const createDefaults = { concept: 'fisher', startingPoint: 'Let the agent choose', details: 'practical clothes, boots, and fishing gear' };
const refineDefaults = { characterName: 'fisher', part: 'hair', result: 'short brown hair that stays clear of the face' };

export function AgentPromptBuilders() {
  const [create, setCreate] = useState<CreateCharacterFields>(createDefaults);
  const [refine, setRefine] = useState<RefineCharacterFields>(refineDefaults);
  const [exportName, setExportName] = useState('fisher');
  const [exportAnimations, setExportAnimations] = useState<readonly string[]>(['walk', 'idle']);
  const [bundle, setBundle] = useState('attributed ZIP bundle');
  const [assetType, setAssetType] = useState('clothes');
  const [auditAnimations, setAuditAnimations] = useState<readonly string[]>(['walk', 'run']);
  const [worklistSize, setWorklistSize] = useState('20');
  const joined = (values: readonly string[]) => values.join(' and ');
  const worklistNumber = Number(worklistSize);

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <PromptCard title="Create a character" tag="Create character" prompt={buildCreateCharacterPrompt(create)} valid={Object.values(create).every((value) => value.trim())} onReset={() => setCreate(createDefaults)}>
        <TextField label="Character concept" value={create.concept} onChange={(concept) => setCreate({ ...create, concept })} />
        <label className="text-sm text-text-2">Starting point<select className={fieldClassName} value={create.startingPoint} onChange={(event) => setCreate({ ...create, startingPoint: event.target.value })}>
          {['Let the agent choose', 'Start without a preset', 'Start from farmer', 'Start from villager', 'Start from mage', 'Start from knight', 'Start from ranger', 'Start from noble'].map((option) => <option key={option}>{option}</option>)}
        </select></label>
        <TextField label="Appearance and details" value={create.details} onChange={(details) => setCreate({ ...create, details })} />
      </PromptCard>

      <PromptCard title="Refine a character" tag="Refine" prompt={buildRefineCharacterPrompt(refine)} valid={Object.values(refine).every((value) => value.trim())} onReset={() => setRefine(refineDefaults)}>
        <TextField label="Character name" value={refine.characterName} onChange={(characterName) => setRefine({ ...refine, characterName })} />
        <TextField label="Part to change" value={refine.part} onChange={(part) => setRefine({ ...refine, part })} />
        <TextField label="Desired result" value={refine.result} onChange={(result) => setRefine({ ...refine, result })} />
      </PromptCard>

      <PromptCard title="Preview and export" tag="Export" prompt={buildExportCharacterPrompt({ characterName: exportName, animations: joined(exportAnimations), bundle })} valid={Boolean(exportName.trim() && exportAnimations.length && bundle)} onReset={() => { setExportName('fisher'); setExportAnimations(['walk', 'idle']); setBundle('attributed ZIP bundle'); }}>
        <TextField label="Character name" value={exportName} onChange={setExportName} />
        <AnimationChoices selected={exportAnimations} onChange={setExportAnimations} />
        <label className="text-sm text-text-2">Bundle format<select className={fieldClassName} value={bundle} onChange={(event) => setBundle(event.target.value)}><option>attributed ZIP bundle</option><option>attributed render directory</option></select></label>
      </PromptCard>

      <PromptCard title="Audit animation assets" tag="Animation audit" prompt={buildAnimationAuditPrompt({ assetType, animations: joined(auditAnimations), worklistSize })} valid={Boolean(assetType.trim() && auditAnimations.length && Number.isInteger(worklistNumber) && worklistNumber >= 1 && worklistNumber <= 100)} onReset={() => { setAssetType('clothes'); setAuditAnimations(['walk', 'run']); setWorklistSize('20'); }}>
        <TextField label="Asset type" value={assetType} onChange={setAssetType} />
        <AnimationChoices selected={auditAnimations} onChange={setAuditAnimations} />
        <label className="text-sm text-text-2">Worklist size<input className={fieldClassName} type="number" min="1" max="100" value={worklistSize} onChange={(event) => setWorklistSize(event.target.value)} /></label>
      </PromptCard>
    </div>
  );
}
