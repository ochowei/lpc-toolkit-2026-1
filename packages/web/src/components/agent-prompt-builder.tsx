import { useState } from 'react';
import type { Locale } from '../i18n';

function localized(locale: Locale, english: string, chinese: string): string {
  return locale === 'zh-TW' ? chinese : english;
}

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

export function buildCreateCharacterPrompt(fields: CreateCharacterFields, locale: Locale = 'en'): string {
  const start = fields.startingPoint === 'Let the agent choose'
    ? 'Let the agent choose a suitable starting point'
    : `Start from ${fields.startingPoint}`;
  if (locale === 'zh-TW') {
    const chineseStart = fields.startingPoint === 'Let the agent choose'
      ? '讓 Agent 選擇合適的起始點'
      : `從 ${fields.startingPoint} 開始`;
    return `使用現有 catalog 素材，依照「${fields.concept.trim()}」構想建立 LPC 角色。${chineseStart}，組合 ${fields.details.trim()}，產生附帶署名資訊的預覽，並詢問我接下來想調整什麼。不要建立或編輯來源素材像素。`;
  }
  return `Build an LPC character from existing catalog art based on a ${fields.concept.trim()} concept. ${start}, assemble ${fields.details.trim()}, generate an attributed preview, and ask what I want to refine next. Do not create or edit source asset pixels.`;
}

export function buildAnimationExtensionPrompt(fields: AnimationExtensionFields, locale: Locale = 'en'): string {
  if (locale === 'zh-TW') return `$lpc-animation-asset-audit\n\n尋找現有 LPC catalog 素材 ${fields.item.trim()}，並對 ${fields.animations.trim()} 執行唯讀稽核。先向我顯示有界證據與保留的素材 identity。如果 ${fields.details.trim()}，請提出動畫擴充修訂、說明會受影響的來源檔與署名資訊，並在修改素材或使用 provider 前取得我的明確確認。停在已驗證、附帶署名資訊且可供審查的預覽；不要發布或安裝。`;
  return `$lpc-animation-asset-audit\n\nFind the existing LPC catalog item ${fields.item.trim()} and run a read-only audit for ${fields.animations.trim()}. Show me the bounded evidence and retained item identity first. If ${fields.details.trim()}, propose an animation-extension revision, explain the source files and credits that would be affected, and ask for my explicit confirmation before modifying assets or using a provider. Stop at a validated, attributed review-ready preview; do not release or install it.`;
}

export function buildNewAssetPrompt(fields: NewAssetFields, locale: Locale = 'en'): string {
  if (locale === 'zh-TW') return `依照 ${fields.concept.trim()} 建立一個附帶署名資訊的新 LPC ${fields.assetType.trim()} 素材，涵蓋 ${fields.animations.trim()}。先搜尋 catalog、將工作限制在支援的 LPC layout，接著在產生像素前向我索取署名草稿。說明任何 provider 或參考資料揭露，並在使用前取得我的明確同意。匯入並驗證結果，然後停在附帶署名資訊且可供審查的預覽；不要發布或安裝。`;
  return `Create a new attributed LPC ${fields.assetType.trim()} asset based on ${fields.concept.trim()}, covering ${fields.animations.trim()}. Check the catalog first, constrain the work to supported LPC layouts, then ask me for draft attribution before generating pixels. Explain any provider or reference disclosure and get my explicit consent before use. Import and validate the result, then stop at an attributed review-ready preview; do not release or install it.`;
}

export function buildCreateCharacterResult(concept: string, locale: Locale = 'en'): string {
  if (locale === 'zh-TW') return `${concept.trim()} 的附署名預覽、metadata、署名 TXT 與署名 CSV，以及用於調整或匯出的對話式下一步。`;
  return `An attributed preview for ${concept.trim()}, its metadata, credits TXT and credits CSV, plus a conversational next step for refinement or export.`;
}

export function buildAnimationExtensionResult(item: string, locale: Locale = 'en'): string {
  if (locale === 'zh-TW') return `先提供 ${item.trim()} 的唯讀發現。另行確認後：保留相同素材 identity、套用所選動畫修訂、具備最新驗證，並產生附帶署名資訊且可供審查的預覽。`;
  return `First, a read-only finding for ${item.trim()}. After separate confirmation: the same item identity with the selected animation revision, current validation, and an attributed review-ready preview.`;
}

export function buildNewAssetResult(assetType: string, locale: Locale = 'en'): string {
  if (locale === 'zh-TW') return `一個新的 ${assetType.trim()} identity，包含已匯入來源、最新驗證與附帶署名資訊且可供審查的預覽。正式發布與安裝仍是分開的操作。`;
  return `One new ${assetType.trim()} identity with imported source, current validation, and an attributed review-ready preview. Formal release and installation remain separate.`;
}

const fieldClassName = 'mt-1 w-full rounded-md border border-border-strong bg-surface-2 px-3 py-2 text-sm text-text outline-none focus:border-accent';

function TextField({ label, value, onChange }: { readonly label: string; readonly value: string; readonly onChange: (value: string) => void }) {
  return <label className="text-sm text-text-2">{label}<input data-prompt-input="true" className={fieldClassName} value={value} onChange={(event) => onChange(event.target.value)} /></label>;
}

function AuthorityStages({ stages, locale }: { readonly stages: readonly { label: string; authority: string }[]; readonly locale: Locale }) {
  return (
    <ol aria-label={localized(locale, 'Journey stages', '流程階段')} className="mt-4 grid gap-2 sm:grid-cols-3">
      {stages.map((stage, index) => (
        <li key={stage.label} className="rounded-md border border-border bg-surface-2 p-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-text-mute">{localized(locale, 'Stage', '階段')} {index + 1}</p>
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
  executorGuidance,
  children,
  locale,
}: {
  readonly title: string;
  readonly term: string;
  readonly prompt: string;
  readonly result: string;
  readonly valid: boolean;
  readonly onReset: () => void;
  readonly stages: readonly { label: string; authority: string }[];
  readonly executorGuidance?: React.ReactNode;
  readonly children: React.ReactNode;
  readonly locale: Locale;
}) {
  const [copyStatus, setCopyStatus] = useState('');
  async function copyPrompt() {
    if (!valid) return;
    try {
      await navigator.clipboard.writeText(prompt);
      setCopyStatus(localized(locale, 'Copied', '已複製'));
      window.setTimeout(() => setCopyStatus(''), 1600);
    } catch {
      setCopyStatus(localized(locale, 'Copy failed', '複製失敗'));
    }
  }
  return (
    <article className="rounded-md border border-border bg-surface p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-text-mute">{term}</p>
          <h3 className="mt-1 text-xl font-semibold text-text">{title}</h3>
        </div>
        <button type="button" onClick={onReset} className="text-sm text-text-2 underline hover:text-text">{localized(locale, 'Reset', '重設')}</button>
      </div>
      <AuthorityStages stages={stages} locale={locale} />
      {executorGuidance && (
        <div className="mt-4 rounded-md border border-accent/40 bg-accent/10 p-3 text-sm leading-6 text-text-2">
          {executorGuidance}
        </div>
      )}
      <div className="mt-5 grid gap-3 sm:grid-cols-3">{children}</div>
      <div className="mt-4 rounded-md border border-border bg-[var(--bg-deep)] p-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-text-mute">{localized(locale, 'Prompt preview', '提示預覽')}</p>
        <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-text">{prompt}</p>
      </div>
      <details className="mt-3 rounded-md border border-border px-3 py-2 text-sm text-text-2">
        <summary className="cursor-pointer font-semibold text-text">{localized(locale, 'Expected result and files', '預期結果與檔案')}</summary>
        <p className="mt-2 leading-6">{result}</p>
      </details>
      <div className="mt-4 flex items-center gap-3">
        <button type="button" disabled={!valid} onClick={() => void copyPrompt()} className="rounded-md border border-border-strong bg-accent px-4 py-2 text-sm font-semibold text-[var(--accent-ink)] disabled:cursor-not-allowed disabled:opacity-50">{localized(locale, 'Copy kickoff prompt', '複製啟動提示')}</button>
        <span aria-live="polite" className="text-sm text-text-2">{copyStatus}</span>
      </div>
      {!valid && <p className="mt-2 text-xs text-[var(--danger)]">{localized(locale, 'Complete every field to copy this prompt.', '請填寫所有欄位後再複製提示。')}</p>}
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

export function AgentPromptBuilders({ initialJourney = 'compose', locale = 'en' }: { readonly initialJourney?: JourneyId; readonly locale?: Locale } = {}) {
  const [active, setActive] = useState<JourneyId>(initialJourney);
  const [compose, setCompose] = useState<CreateCharacterFields>(composeDefaults);
  const [extend, setExtend] = useState<AnimationExtensionFields>(extendDefaults);
  const [newAsset, setNewAsset] = useState<NewAssetFields>(newDefaults);

  return (
    <div>
      <div role="tablist" aria-label={localized(locale, 'Choose your goal', '選擇你的目標')} className="grid gap-3 lg:grid-cols-3">
        {journeys.map((journey) => (
          <button key={journey.id} type="button" role="tab" aria-selected={active === journey.id} onClick={() => setActive(journey.id)} className={`rounded-md border p-4 text-left ${active === journey.id ? 'border-accent bg-accent/10' : 'border-border bg-surface'}`}>
            <span className="text-xs font-semibold uppercase tracking-wide text-text-mute">{locale === 'zh-TW' ? ({ compose: 'Sprite 合成', extend: '動畫擴充', new: '新素材製作' } as const)[journey.id] : journey.term}</span>
            <span className="mt-1 block font-semibold text-text">{locale === 'zh-TW' ? ({ compose: '用現有素材建立角色', extend: '新增缺少的動畫', new: '建立新素材' } as const)[journey.id] : journey.title}</span>
            <span className="mt-2 block text-sm leading-5 text-text-2">{locale === 'zh-TW' ? ({ compose: '選擇並組合 catalog 素材，不會變更來源像素。', extend: '先稽核，再確認一項有界修訂。', new: '為支援的 LPC layout 建立一個新 identity。' } as const)[journey.id] : journey.description}</span>
          </button>
        ))}
      </div>

      <div className="mt-4">
        {active === 'compose' && (
          <PromptPanel locale={locale} title={localized(locale, 'Build a character from existing art', '用現有素材建立角色')} term={localized(locale, 'Sprite composition', 'Sprite 合成')} prompt={buildCreateCharacterPrompt(compose, locale)} result={buildCreateCharacterResult(compose.concept, locale)} valid={Object.values(compose).every((value) => value.trim())} onReset={() => setCompose(composeDefaults)} stages={locale === 'zh-TW' ? [{ label: '選擇現有素材', authority: '讀取 catalog' }, { label: '合成並驗證', authority: '寫入角色檔' }, { label: '審查附署名預覽', authority: '僅預覽' }] : [{ label: 'Choose existing art', authority: 'Read catalog' }, { label: 'Compose and validate', authority: 'Write character file' }, { label: 'Review attributed preview', authority: 'Preview only' }]}>
            <TextField label={localized(locale, 'Character idea', '角色構想')} value={compose.concept} onChange={(concept) => setCompose({ ...compose, concept })} />
            <label className="text-sm text-text-2">{localized(locale, 'Starting point', '起始點')}<select data-prompt-input="true" className={fieldClassName} value={compose.startingPoint} onChange={(event) => setCompose({ ...compose, startingPoint: event.target.value })}>{['Let the agent choose', 'farmer preset', 'villager preset', 'no preset'].map((value) => <option key={value}>{locale === 'zh-TW' ? ({ 'Let the agent choose': '讓 Agent 選擇', 'farmer preset': '農夫預設', 'villager preset': '村民預設', 'no preset': '不使用預設' } as Readonly<Record<string, string>>)[value] : value}</option>)}</select></label>
            <TextField label={localized(locale, 'Important details', '重要細節')} value={compose.details} onChange={(details) => setCompose({ ...compose, details })} />
          </PromptPanel>
        )}
        {active === 'extend' && (
          <PromptPanel locale={locale} title={localized(locale, 'Add a missing animation', '新增缺少的動畫')} term={localized(locale, 'Animation extension', '動畫擴充')} prompt={buildAnimationExtensionPrompt(extend, locale)} result={buildAnimationExtensionResult(extend.item, locale)} valid={Object.values(extend).every((value) => value.trim())} onReset={() => setExtend(extendDefaults)} stages={locale === 'zh-TW' ? [{ label: '稽核缺口', authority: '唯讀' }, { label: '確認修訂', authority: '需要使用者核准' }, { label: '匯入並預覽', authority: '寫入有界來源' }] : [{ label: 'Audit the gap', authority: 'Read-only' }, { label: 'Confirm revision', authority: 'User approval required' }, { label: 'Import and preview', authority: 'Write bounded source' }]} executorGuidance={<p>{locale === 'zh-TW' ? <>複製啟動提示只會複製這項請求。貼到 Codex task 後，<code>$lpc-animation-asset-audit</code> 會先執行並保持唯讀。你確認一項有界修訂後，它會在同一 task 中交接給 <code>$lpc-asset-authoring</code>。若任一 Skill 無法使用，請採用嚴格 CLI 流程。</> : <>Copy kickoff prompt only copies this request. Paste it into a Codex task; <code>$lpc-animation-asset-audit</code> runs first and stays read-only. After you confirm one bounded revision, it hands off to <code>$lpc-asset-authoring</code> in the same Codex task. If either Skill is unavailable, use the strict CLI workflow.</>}</p>}>
            <TextField label={localized(locale, 'Existing item', '現有素材')} value={extend.item} onChange={(item) => setExtend({ ...extend, item })} />
            <TextField label={localized(locale, 'Missing animation', '缺少的動畫')} value={extend.animations} onChange={(animations) => setExtend({ ...extend, animations })} />
            <TextField label={localized(locale, 'When to proceed', '何時繼續')} value={extend.details} onChange={(details) => setExtend({ ...extend, details })} />
          </PromptPanel>
        )}
        {active === 'new' && (
          <PromptPanel locale={locale} title={localized(locale, 'Create a new asset', '建立新素材')} term={localized(locale, 'New asset authoring', '新素材製作')} prompt={buildNewAssetPrompt(newAsset, locale)} result={buildNewAssetResult(newAsset.assetType, locale)} valid={Object.values(newAsset).every((value) => value.trim())} onReset={() => setNewAsset(newDefaults)} stages={locale === 'zh-TW' ? [{ label: '界定支援範圍', authority: '讀取 catalog' }, { label: '確認署名與 provider', authority: '需要使用者核准' }, { label: '匯入並預覽', authority: '寫入新來源' }] : [{ label: 'Define supported scope', authority: 'Read catalog' }, { label: 'Confirm credits and provider', authority: 'User approval required' }, { label: 'Import and preview', authority: 'Write new source' }]}>
            <TextField label={localized(locale, 'Asset idea', '素材構想')} value={newAsset.concept} onChange={(concept) => setNewAsset({ ...newAsset, concept })} />
            <TextField label={localized(locale, 'Asset type', '素材類型')} value={newAsset.assetType} onChange={(assetType) => setNewAsset({ ...newAsset, assetType })} />
            <TextField label={localized(locale, 'Animations', '動畫')} value={newAsset.animations} onChange={(animations) => setNewAsset({ ...newAsset, animations })} />
          </PromptPanel>
        )}
      </div>
    </div>
  );
}
