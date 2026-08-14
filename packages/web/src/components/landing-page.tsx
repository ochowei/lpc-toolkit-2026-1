import { useState } from 'react';
import heroPreviewUrl from '../landing-artifacts/hero.preview.png';
import heroCreditsTxtUrl from '../landing-artifacts/hero.credits.txt?url';
import heroCreditsCsvUrl from '../landing-artifacts/hero.credits.csv?url';
import type { NavigableAppRoute } from '../lib/app-route';
import type { Locale } from '../i18n';
import { AgentPromptBuilders } from './agent-prompt-builder';
import { ProductNavigation } from './product-navigation';

interface CopyCodeProps {
  readonly children: string;
  readonly className?: string;
  readonly multiline?: boolean;
  readonly showCopy?: boolean;
  readonly locale?: Locale;
}

function CopyCode({
  children,
  className,
  multiline = false,
  showCopy = true,
  locale = 'en',
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
          aria-label={copied ? (locale === 'en' ? 'Copied' : '已複製') : (locale === 'en' ? 'Copy code' : '複製指令')}
          title={copied ? (locale === 'en' ? 'Copied' : '已複製') : (locale === 'en' ? 'Copy code' : '複製指令')}
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
  readonly locale?: Locale;
  readonly onToggleLocale?: () => void;
}

function localized(locale: Locale, english: string, chinese: string): string {
  return locale === 'zh-TW' ? chinese : english;
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

export function CliPage({ onNavigate, locale = 'en', onToggleLocale }: ProductPageProps) {
  const quickStart = locale === 'zh-TW'
    ? [
        { ...quickStartSteps[0], title: '安裝 CLI', description: '將已發布的套件安裝到全域環境。' },
        { ...quickStartSteps[1], title: '建立起始角色', description: '從內建的農夫預設開始，並將角色儲存為 hero。' },
        { ...quickStartSteps[2], title: '預覽結果', description: '使用預設的行走預覽，渲染一個附帶署名資訊的影格。' },
      ]
    : quickStartSteps;
  const customization = locale === 'zh-TW'
    ? [
        { ...customizationSteps[0], title: '尋找相容的髮型', description: '使用易讀的終端輸出搜尋 catalog。' },
        { ...customizationSteps[1], title: '檢查精確署名', description: '檢視所選素材與其完整署名資訊。' },
        { ...customizationSteps[2], title: '套用素材', description: '選擇辮子髮型，並套用棕色主要顏色。' },
        { ...customizationSteps[3], title: '設定素材色彩通道', description: '替所選表情設定獨立的眼睛顏色。' },
      ]
    : customizationSteps;
  return (
    <main lang={locale} className="min-h-screen bg-app text-text">
      <ProductNavigation activeRoute="cli" onNavigate={onNavigate} locale={locale} onToggleLocale={onToggleLocale} />
      <div className="mx-auto flex min-h-screen min-w-0 w-full max-w-6xl flex-col gap-8 overflow-x-hidden px-5 py-6 sm:px-8 lg:px-10">
        <header className="grid items-center gap-8 border-b border-border pb-8 lg:grid-cols-[minmax(0,1fr)_320px]">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-text-mute">
              LPC Toolkit
            </p>
            <h1 className="mt-3 max-w-3xl text-3xl font-semibold text-text sm:text-5xl">
              {localized(locale, 'Create attributed LPC characters from the command line.', '從命令列建立附帶署名資訊的 LPC 角色。')}
            </h1>
            <p className="mt-4 max-w-2xl text-base text-text-2">
              {localized(locale, 'Compose game-ready pixel characters, preview the result, and keep the matching licenses and credits with every export.', '合成可直接用於遊戲的像素角色、預覽結果，並讓每次匯出都保留相符的授權與署名資訊。')}
            </p>
          </div>

          <figure className="rounded-md border border-border bg-surface p-5 text-center">
            <div className="flex min-h-56 items-center justify-center rounded-md bg-[var(--bg-deep)]">
              <img
                src={heroPreviewUrl}
                alt={localized(locale, 'Farmer character preview generated by LPC Toolkit', '由 LPC Toolkit 產生的農夫角色預覽')}
                width={64}
                height={64}
                className="size-48 [image-rendering:pixelated]"
              />
            </div>
            <figcaption className="mt-3 text-sm text-text-2">
              {localized(locale, 'Farmer preset preview', '農夫預設預覽')} ·{' '}
              <a className="underline hover:text-text" href={heroCreditsTxtUrl}>
                {localized(locale, 'Read TXT credits', '閱讀 TXT 署名')}
              </a>{' '}
              ·{' '}
              <a className="underline hover:text-text" href={heroCreditsCsvUrl}>
                {localized(locale, 'Download CSV credits', '下載 CSV 署名')}
              </a>
            </figcaption>
          </figure>
        </header>

        <section
          id="cli-quick-start"
          className="scroll-mt-6 rounded-md border border-border bg-surface p-5"
        >
          <h2 className="text-2xl font-semibold text-text">
            {localized(locale, 'Preview your first character', '預覽你的第一個角色')}
          </h2>
          <p className="mt-2 max-w-3xl text-sm text-text-2">
            {localized(locale, 'Run these three commands in order. Node.js 22 or newer is required. To inspect the CLI without installing it, run ', '依序執行以下三個指令。需要 Node.js 22 或更新版本。若想在不安裝的情況下查看 CLI，請執行 ')}
            <code>npx @lpc-toolkit/cli --help</code>.
          </p>
          <ol className="mt-5 grid min-w-0 gap-4 lg:grid-cols-3">
            {quickStart.map((step, index) => (
              <li
                key={step.command}
                className="min-w-0 rounded-md border border-border bg-surface-2 p-4"
              >
                <p className="text-xs font-semibold uppercase tracking-wide text-text-mute">
                  {localized(locale, 'Step', '步驟')} {index + 1}
                </p>
                <h3 className="mt-2 text-lg font-semibold text-text">
                  {step.title}
                </h3>
                <p className="mt-1 text-sm text-text-2">{step.description}</p>
                <CopyCode className="mt-4" children={step.command} locale={locale} />
              </li>
            ))}
          </ol>
          <p className="mt-5 rounded-md border border-border bg-surface-2 p-3 text-sm text-text-2">
            {localized(locale, 'The first asset-dependent command downloads about 205 MB of pinned assets once, verifies them, and reuses the local cache afterward.', '第一次執行需要素材的指令時，會下載約 205 MB 的固定版本素材並完成驗證；之後會重複使用本機快取。')}
          </p>
        </section>

        <details className="group rounded-md border border-border bg-surface">
          <summary className="cursor-pointer list-none p-5 [&::-webkit-details-marker]:hidden">
            <span className="flex items-start justify-between gap-4">
              <span>
                <span className="block text-xs font-semibold uppercase tracking-[0.16em] text-text-mute">
                  {localized(locale, 'Optional reference', '選用參考')}
                </span>
                <span className="mt-2 block text-xl font-semibold text-text">
                  {localized(locale, 'Advanced asset workflows', '進階素材流程')}
                </span>
                <span className="mt-2 block max-w-3xl text-sm font-normal text-text-2">
                  {localized(locale, 'Create, repair, release, install, or integrate LPC asset packs. Expand this only when you need source-asset commands.', '建立、修復、發布、安裝或整合 LPC 素材包。只有需要來源素材指令時才展開此區。')}
                </span>
              </span>
              <span
                aria-hidden="true"
                className="mt-1 text-lg text-text-mute transition-transform group-open:rotate-180"
              >
                ↓
              </span>
            </span>
          </summary>
          <div className="border-t border-border p-5">
            <h2 className="text-2xl font-semibold text-text">
              {localized(locale, 'Author your own LPC asset pack', '製作你自己的 LPC 素材包')}
            </h2>
            <p className="mt-2 max-w-3xl text-sm text-text-2">
            {localized(locale, 'You do not need to clone this repository. The published CLI creates a standalone artist workspace, validates complete animation PNGs, renders attributed previews, packages a deterministic archive, and installs it into a second standalone workspace. A session can also create a non-installable recovery draft or synchronize its manager-owned overlay after explicit confirmation.', '你不需要複製此 repository。已發布的 CLI 會建立獨立的創作者工作區、驗證完整的動畫 PNG、渲染附帶署名資訊的預覽、封裝可重現的封存檔，並安裝到另一個獨立工作區。經過明確確認後，工作階段也能建立不可安裝的復原草稿，或同步由管理器擁有的 overlay。')}
          </p>
          <p className="mt-2 max-w-3xl text-sm text-text-2">
            {localized(locale, 'Character composition, source asset creation, audit handoff, validation, formal archive publication, and installation are separate CLI responsibilities.', '角色合成、來源素材建立、稽核交接、驗證、正式封存檔發布與安裝，都是彼此分離的 CLI 職責。')}
          </p>
          <div className="mt-6 rounded-md border border-accent/40 bg-accent/10 p-4">
            <h3 className="text-lg font-semibold text-text">
              {localized(locale, 'Strict animation-remediation session', '嚴格的動畫修復工作階段')}
            </h3>
            <p className="mt-2 text-sm text-text-2">
              {locale === 'zh-TW' ? <>plan.json 是根據一項已選定發現與人工提供的署名草稿所準備的明確輸入。已發布的 npm 套件包含 <code>examples/extend-item-plan.v1.json</code>，作為同意後的完整欄位指南，Codex plugin 也附有相同範本。請用審查過的證據替換每個範例值。CLI 不會選擇發現、推定同意、杜撰署名、呼叫 provider 或建立候選像素。請閱讀 <a className="underline hover:text-text" href={cliReadmeUrl} target="_blank" rel="noreferrer">完整 CLI 指南</a>，了解 plan schema 與復原路徑。</> : <>plan.json is explicit input prepared from one selected finding
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
              for the plan schema and recovery paths.</>}
            </p>
            <ol className="mt-4 space-y-3">
              {strictRemediationCommands.map((command, index) => (
                <li key={`${index}-${command}`}>
                  <CopyCode locale={locale} children={command} />
                </li>
              ))}
            </ol>
          </div>
          <div className="mt-6 rounded-md border border-border bg-surface-2 p-4">
            <h3 className="text-lg font-semibold text-text">
              {localized(locale, 'Limited Phase 1 scaffold alternative', '有限的第一階段 scaffold 替代流程')}
            </h3>
            <p className="mt-2 text-sm text-text-2">
              {locale === 'zh-TW' ? <>這是會修改內容的直接 CLI 製作操作。只有在你審查一項選定發現，並明確同意離開唯讀稽核後才能使用；唯讀稽核 Skill 絕不會執行它。它無法 scaffold <code>blankFrames</code>，稽核錯誤也不會變成繪製任務，而且它不會建立嚴格的製作工作階段、contract 或 receipt。</> : <>This is a mutating direct CLI authoring action. Use it only after
              you review one selected finding and explicitly consent to leave
              the read-only audit; the read-only audit Skill never runs it. It
              cannot scaffold <code>blankFrames</code>, audit errors never become
              drawing tasks, and it does not create a strict authoring session,
              contract, or receipt.</>}
            </p>
            <CopyCode locale={locale} className="mt-4" children={phaseOneScaffoldCommand} />
          </div>
          <h3 className="mt-6 text-lg font-semibold text-text">
            {localized(locale, 'Other direct asset-pack lifecycle commands', '其他直接素材包生命週期指令')}
          </h3>
          <p className="mt-2 text-sm text-text-2">
            {localized(locale, 'New-item scaffolding and the standalone pack lifecycle remain separate from strict animation remediation.', '新素材 scaffold 與獨立素材包生命週期，仍和嚴格動畫修復流程分離。')}
          </p>
          <ol className="mt-4 space-y-3">
            {artistWorkflowCommands.map((command, index) => (
              <li key={`${index}-${command}`}>
                <CopyCode locale={locale} children={command} />
              </li>
            ))}
          </ol>
          <div className="mt-6 rounded-md border border-border bg-surface-2 p-4">
            <h3 className="text-lg font-semibold text-text">
              {localized(locale, 'Record the human release checkpoint separately', '另外記錄人工發布檢查點')}
            </h3>
            <p className="mt-2 text-sm text-text-2">
              {localized(locale, 'A valid preview is not a release. An authoring session can persist one exact warning acknowledgement, an explicit author/source and license declaration, and final acceptance of the exact PNG plus metadata, TXT-credit, and CSV-credit artifacts. Each command is a separate confirmation boundary; stale evidence remains visible in the session and never becomes release-ready silently.', '有效的預覽不等於發布。製作工作階段可以保存一份精確的警告確認、明確的作者／來源與授權聲明，以及對指定 PNG、metadata、TXT 與 CSV 署名成品的最終接受。每個指令都是獨立的確認邊界；過期證據會持續顯示，不會悄悄變成可發布狀態。')}
            </p>
            <ol className="mt-4 space-y-3">
              {releaseAcceptanceCommands.map((command, index) => (
                <li key={`${index}-${command}`}>
                  <CopyCode locale={locale} children={command} />
                </li>
              ))}
            </ol>
            <p className="mt-4 text-sm text-text-2">
              {localized(locale, 'These receipts govern the authoring session only. Formal archive publication and consumer installation remain separate CLI steps. Once every release gate is current, formal pack writes a non-draft archive below the session-owned release-artifacts directory; inspect records the exact archive digest only when it matches that formal receipt.', '這些 receipt 只治理製作工作階段。正式封存檔發布與使用端安裝仍是分開的 CLI 步驟。當所有發布 gate 都是最新狀態時，正式 pack 會在工作階段擁有的 release-artifacts 目錄下寫入非草稿封存檔；只有在 digest 與正式 receipt 相符時，inspect 才會記錄該封存檔的精確 digest。')}
            </p>
            <ol className="mt-4 space-y-3">
              {releasePublicationCommands.map((command, index) => (
                <li key={`${index}-${command}`}>
                  <CopyCode locale={locale} children={command} />
                </li>
              ))}
            </ol>
            <h3 className="mt-5 text-lg font-semibold text-text">
              {localized(locale, 'Carry optional generation provenance separately', '另外攜帶選用的產生來源證據')}
            </h3>
            <p className="mt-2 text-sm text-text-2">
              {localized(locale, 'Generation provenance is an optional external companion to the exact archive. It is not attribution, a license or authorship declaration, human release approval, a ZIP member, or an installer input. A copied archive and receipt can be verified read-only from a separate consumer root; no provider is invoked.', '產生來源證據是精確封存檔的選用外部伴隨檔。它不是署名、授權或作者聲明、人工發布核准、ZIP 成員或安裝器輸入。複製後的封存檔與 receipt 可從另一個使用端 root 進行唯讀驗證，過程不會呼叫 provider。')}
            </p>
            <ol className="mt-4 space-y-3">
              {releaseProvenanceCommands.map((command, index) => (
                <li key={`${index}-${command}`}>
                  <CopyCode locale={locale} children={command} />
                </li>
              ))}
            </ol>
            <h3 className="mt-5 text-lg font-semibold text-text">
              {localized(locale, 'Optionally activate the exact archive in a consumer workspace', '選擇在使用端工作區啟用指定封存檔')}
            </h3>
            <p className="mt-2 text-sm text-text-2">
              {locale === 'zh-TW' ? <>使用端啟用是明確操作，且與正式發布分離。目標必須是已初始化的受管理工作區，並位於創作者、repository、快取與產生輸出 root 之外。指令會確認已 inspect 的精確 digest、驗證已提交的 registry／output／source 與相符的 <code>CREDITS.csv</code>，並記錄安裝 receipt；內容未變的重試具有冪等性。</> : <>Consumer activation is explicit and separate from formal
              publication. The target must already be an initialized managed
              workspace outside the artist, repository, cache, and generated
              output roots. The command confirms the exact inspected digest,
              verifies the committed registry/output/source and matching
              <code>CREDITS.csv</code>, and records an installation receipt;
              unchanged retries are idempotent.</>}
            </p>
            <ol className="mt-4 space-y-3">
              {releaseConsumerCommands.map((command, index) => (
                <li key={`${index}-${command}`}>
                  <CopyCode locale={locale} children={command} />
                </li>
              ))}
            </ol>
            <h3 className="mt-5 text-lg font-semibold text-text">
              {localized(locale, 'Recover or synchronize the session separately', '另外復原或同步工作階段')}
            </h3>
            <p className="mt-2 text-sm text-text-2">
              {locale === 'zh-TW' ? <>復原草稿是可重現的證據，不是正式封存檔：CLI 會標記為 <code>status: "draft"</code>，公開 inspect 會回報 <code>asset_pack_draft</code>，公開 install 則會在變更使用端工作區之前拒絕它。經確認的 sync 會呼叫既有 linked-sync transaction，並記錄實際由管理器擁有的 output 與 registry generation。過期的 source、registry、marker 或 generated-output 證據會繼續顯示，不會被悄悄替換。</> : <>A recovery draft is deterministic evidence, not a formal archive:
              the CLI marks it <code>status: "draft"</code>, public inspect
              reports <code>asset_pack_draft</code>, and public install rejects
              it before changing a consumer workspace. Confirmed sync calls the
              existing linked-sync transaction and records the actual
              manager-owned output and registry generation. Stale source,
              registry, marker, or generated-output evidence remains visible
              instead of being silently replaced.</>}
            </p>
            <ol className="mt-4 space-y-3">
              {releaseRecoveryCommands.map((command, index) => (
                <li key={`${index}-${command}`}>
                  <CopyCode locale={locale} children={command} />
                </li>
              ))}
            </ol>
            <h3 className="mt-5 text-lg font-semibold text-text">
              {localized(locale, 'Optionally hand off a candidate through an Agent integration', '選擇透過 Agent 整合交接候選成品')}
            </h3>
            <p className="mt-2 text-sm text-text-2">
              {locale === 'zh-TW' ? <>CLI 沒有內建 provider，也不會自動信任或呼叫 provider。外部整合可提供有界的 descriptor，但 discovery 與 preflight 都是唯讀；handoff 需要明確同意與 <code>--confirm</code>，而 result bytes 在進入工作階段擁有的候選 staging root 前會重新計算 digest。既有的 import、validation、preview、attribution 與人工 release gate 仍具最終權威。拒絕時會保留最後一個有效檢查點，並回傳一項安全的下一步。</> : <>The CLI has no built-in provider and does not trust or invoke one
              automatically. An external integration may supply a bounded
              descriptor, but discovery and preflight are read-only, handoff
              requires explicit consent and <code>--confirm</code>, and result
              bytes are re-digested before they enter the session-owned
              candidate staging root. The existing import, validation, preview,
              attribution, and human release gates remain authoritative.
              Refusals preserve the last valid checkpoint and return one safe
              next action.</>}
            </p>
            <ol className="mt-4 space-y-3">
            {providerHandoffCommands.map((command, index) => (
                <li key={`${index}-${command}`}>
                  <CopyCode locale={locale} children={command} />
                </li>
              ))}
            </ol>
            <h3 className="mt-5 text-lg font-semibold text-text">
              {localized(locale, 'Route and stage deterministic authoring candidates', '路由並暫存可重現的製作候選成品')}
            </h3>
            <p className="mt-2 text-sm text-text-2">
              {locale === 'zh-TW' ? <>製作智慧會優先查詢 catalog，且具可重現性。它能路由有界請求，準備 variant、recolor、明確 geometry 或多 layer 候選成品，但不需要 model、provider、backend、network、authentication 或持久化瀏覽器狀態。Route 是唯讀；staging 需要精確同意與 <code>--confirm</code>，只會寫入工作階段擁有的候選證據，並針對既有 import、validation、attributed preview 與人工 review gate 回傳明確下一步。拒絕與過期狀態都可復原。Provider handoff 證據是選用的，Web-to-CLI handoff 則維持檔案範圍。</> : <>Authoring intelligence is catalog-first and deterministic. It can
              route a bounded request, prepare a variant, recolor, explicit
              geometry, or multi-layer candidate, but it does not require a
              model, provider, backend, network, authentication, or persistent
              browser state. Route is read-only; staging requires exact consent
              and <code>--confirm</code>, writes only session-owned candidate
              evidence, and returns an explicit next action for the existing
              import, validation, attributed preview, and human review gates.
              Refusal and stale state remain recoverable. Provider handoff
              evidence is optional, and the Web-to-CLI handoff stays
              file-scoped.</>}
            </p>
            <ol className="mt-4 space-y-3">
              {authoringIntelligenceCommands.map((command, index) => (
                <li key={`${index}-${command}`}>
                  <CopyCode locale={locale} children={command} />
                </li>
              ))}
            </ol>
            <h3 className="mt-5 text-lg font-semibold text-text">
              {localized(locale, 'Transfer one Web revision to the CLI explicitly', '明確將一個 Web 修訂版本交給 CLI')}
            </h3>
            <p className="mt-2 text-sm text-text-2">
              {locale === 'zh-TW' ? <>Workbench 的 <strong>Export for CLI</strong> 操作，會從同一個穩定的記憶體內修訂版本下載既有素材封存檔與嚴格 handoff sidecar。它絕不會上傳或持久化瀏覽器製作狀態。先 inspect 這組檔案，再選擇明確的 attach-pack plan 並進行 CLI 確認；過期配對會在修改前停止，而 handoff 永遠不會滿足 validation、preview、candidate-import、attribution 或 release gate。</> : <>The Workbench <strong>Export for CLI</strong> action downloads the
              existing asset archive and a strict handoff sidecar from one
              stable in-memory revision. It never uploads or persists browser
              authoring state. Inspect the pair first, then choose an explicit
              attach-pack plan and CLI confirmation; stale pairs stop before
              mutation, and the handoff never satisfies validation, preview,
              candidate-import, attribution, or release gates.</>}
            </p>
            <ol className="mt-4 space-y-3">
              {webCliHandoffCommands.map((command, index) => (
                <li key={`${index}-${command}`}>
                  <CopyCode locale={locale} children={command} />
                </li>
              ))}
            </ol>
            <p className="mt-4 text-sm text-text-2">
              {locale === 'zh-TW' ? <>成功 import 後會記錄獨立的 <code>web-handoff-receipt.json</code> sidecar。舊工作階段仍可讀取，而 <code>asset authoring status</code> 只會公開有界且選用的 <code>webHandoff</code> 證據。Web handoff 不等於發布核准。</> : <>A successful import records a separate
              <code>web-handoff-receipt.json</code> sidecar. Older sessions
              remain readable, and <code>asset authoring status</code> exposes
              only bounded optional <code>webHandoff</code> evidence. Web handoff
              is not release approval.</>}
            </p>
            <h3 className="mt-5 text-lg font-semibold text-text">
              {localized(locale, 'Review cross-pack conflicts explicitly', '明確審查跨素材包衝突')}
            </h3>
            <p className="mt-2 text-sm text-text-2">
              {locale === 'zh-TW' ? <>檢查互相競爭的素材包或版本證據，但不自動選出勝者。Inspect 是唯讀；resolve 需要完整的使用者選擇、審查證據與 <code>--confirm</code>，之後也只會寫入工作區擁有的 staging receipt。既有的 candidate import、validation、attributed preview、human review 與 release gate 仍是下游權威。</> : <>Inspect competing pack or version evidence without choosing an
              automatic winner. Inspect is read-only; resolve requires a
              complete user selection, review evidence, and <code>--confirm</code>{' '}
              before writing only a workspace-owned staging receipt. Existing
              candidate import, validation, attributed preview, human review,
              and release gates remain downstream authorities.</>}
            </p>
            <ol className="mt-4 space-y-3">
              <li>
                <CopyCode locale={locale} children="lpc-toolkit asset conflict inspect --conflict conflict.json --json" />
              </li>
              <li>
                <CopyCode locale={locale} children="lpc-toolkit asset conflict resolve --conflict conflict.json --selection selection.json --workspace ./my-lpc-art --confirm --json" />
              </li>
              <li>
                <CopyCode locale={locale} children="lpc-toolkit asset conflict recover --receipt .lpc-toolkit/asset-packs/staging/conflict-resolutions/<conflict-id>/receipt.json --action resume --workspace ./my-lpc-art --confirm --json" />
              </li>
            </ol>
            <p className="mt-4 text-sm text-text-2">
              {localized(locale, 'Stale, tampered, incompatible, missing-attribution, and refused records return one safe next action. Provenance, provider, distribution, and authoring evidence is retained as evidence only; conflict review adds no remote registry, signing, backend, authentication, npm publication, or persistent browser authoring state.', '過期、遭竄改、不相容、缺少署名或遭拒絕的記錄，只會回傳一項安全的下一步。Provenance、provider、distribution 與 authoring 資料只保留為證據；衝突審查不會新增遠端 registry、簽署、backend、authentication、npm 發布或持久化瀏覽器製作狀態。')}
            </p>
          </div>
          <p className="mt-4 text-sm text-text-2">
            {locale === 'zh-TW' ? <>將 PNG 放在 <code>artist-packs/&lt;pack-id&gt;/sprites/</code> 下。請讓預覽 metadata 與署名檔和產生的圖片放在一起。</> : <>Put PNGs under <code>artist-packs/&lt;pack-id&gt;/sprites/</code>. Keep the preview metadata and credit files with the generated image.</>}
          </p>
          <p className="mt-2 text-sm text-text-2">
            {locale === 'zh-TW' ? <>瀏覽器可在本機檢查、驗證、修復與組裝上傳的素材包。CLI 負責套件檢查、安裝、升級、移除與生命週期診斷；Web 編輯只存在記憶體中，不會寫入創作者工作區。瀏覽器草稿帶有 <code>status: "draft"</code>，CLI 會拒絕安裝，直到正式版本下載完成。</> : <>The browser can inspect, validate, repair, and assemble an uploaded
            asset pack locally. The CLI owns package inspection, install,
            upgrade, removal, and lifecycle diagnosis; Web edits happen
            in-memory and do not write an artist workspace. Browser drafts carry
            <code>status: "draft"</code> and the CLI refuses to install them
            until a formal release is downloaded.</>}
            </p>
          </div>
        </details>

        <section className="grid gap-5 lg:grid-cols-2">
          <div className="rounded-md border border-border bg-surface p-5">
            <h2 className="text-xl font-semibold text-text">
              {localized(locale, 'What preview creates', '預覽會建立什麼')}
            </h2>
            <p className="mt-2 text-sm text-text-2">
              {localized(locale, 'Named previews use a predictable directory and keep attribution beside the image.', '具名預覽使用可預期的目錄，並把署名資訊放在圖片旁。')}
            </p>
            <CopyCode locale={locale} multiline showCopy={false} className="mt-4" children={`characters/previews/hero/
├── hero.preview.png
├── hero.metadata.json
├── hero.credits.txt
└── hero.credits.csv`} />
          </div>
          <div className="rounded-md border border-border bg-surface p-5">
            <h2 className="text-xl font-semibold text-text">
              {localized(locale, 'Attribution travels with it', '署名資訊會隨成品一起移動')}
            </h2>
            <p className="mt-2 text-sm text-text-2">
              {localized(locale, 'Metadata records the preview settings and effective license. Keep both credit files with the generated sprite. Carry them forward when you copy, modify, or redistribute it.', 'Metadata 會記錄預覽設定與有效授權。請讓兩份署名檔與產生的 sprite 放在一起；複製、修改或重新散布時也要一併保留。')}
            </p>
          </div>
        </section>

        <section className="rounded-md border border-border bg-surface p-5">
          <h2 className="text-2xl font-semibold text-text">
            {localized(locale, 'Customize the character', '自訂角色')}
          </h2>
          <p className="mt-2 text-sm text-text-2">
            {localized(locale, 'Once the first preview works, discover a compatible item, inspect its exact credits, and persist the selection.', '第一次預覽成功後，尋找相容素材、檢查精確署名，並保存選擇。')}
          </p>
          <ol className="mt-5 grid gap-4 lg:grid-cols-2">
            {customization.map((step, index) => (
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
                    <CopyCode locale={locale} className="mt-3" children={step.command} />
                  </div>
                </div>
              </li>
            ))}
          </ol>
        </section>

        <section className="rounded-md border border-border bg-surface p-5">
          <h2 className="text-2xl font-semibold text-text">
            {localized(locale, 'Render final output', '渲染最終輸出')}
          </h2>
          <p className="mt-2 text-sm text-text-2">
            {localized(locale, 'Export the walk sheet and attributed ZIP after the character looks right.', '角色外觀確認無誤後，匯出行走圖表與附帶署名資訊的 ZIP。')}
          </p>
          <CopyCode locale={locale} className="mt-4" children="lpc-toolkit character render hero --out ./dist/hero --animation walk --bundle zip" />
          <p className="mt-4 text-sm text-text-2">
            {localized(locale, 'Render output includes the composed sheet, metadata, TXT and CSV credits, and the requested ZIP. Attribution artifacts are required, not optional extras.', '渲染輸出包含合成圖表、metadata、TXT 與 CSV 署名，以及要求的 ZIP。署名成品是必要項目，不是選用附件。')}
          </p>
          <p className="mt-2 text-sm text-text-2">
            {locale === 'zh-TW' ? <>最終渲染輸出也包含 <code>hero.viewer.html</code>，這是一個獨立的離線動畫檢視器。</> : <>Final render output also includes <code>hero.viewer.html</code>, a standalone offline animation viewer.</>}
          </p>
        </section>

        <section className="rounded-md border border-border bg-surface p-5">
          <h2 className="text-xl font-semibold text-text">{localized(locale, 'More CLI workflows', '更多 CLI 流程')}</h2>
          <p className="mt-2 text-sm text-text-2">
            {locale === 'zh-TW' ? <>執行 <code>lpc-toolkit --help</code> 探索指令，或閱讀 <a className="underline hover:text-text" href={cliReadmeUrl} target="_blank" rel="noreferrer">完整 CLI 指南</a>，了解 selection files、pagination、tokens、cache locations 與疑難排解。</> : <>Run <code>lpc-toolkit --help</code> for command discovery, or read the{' '}
            <a
              className="underline hover:text-text"
              href={cliReadmeUrl}
              target="_blank"
              rel="noreferrer"
            >
              complete CLI guide
            </a>{' '}
            for selection files, pagination, tokens, cache locations, and
            troubleshooting.</>}
          </p>
        </section>

      </div>
    </main>
  );
}

export function AgentIntegrationsPage({ onNavigate, locale = 'en', onToggleLocale }: ProductPageProps) {
  return (
    <main lang={locale} className="min-h-screen bg-app text-text">
      <ProductNavigation activeRoute="agents" onNavigate={onNavigate} locale={locale} onToggleLocale={onToggleLocale} />
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-5 py-8 sm:px-8 lg:px-10">
        <header className="border-b border-border pb-8">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-text-mute">
            LPC Toolkit
          </p>
          <h1 className="mt-3 text-3xl font-semibold text-text sm:text-5xl">
            {localized(locale, 'Agent Integrations', 'Agent 整合')}
          </h1>
          <p className="mt-4 max-w-2xl text-base text-text-2">
            {localized(locale, 'Choose what you want to make. Codex guides the questions, shows when authority changes, and preserves attributed CLI output.', '選擇你想製作的成果。Codex 會引導提問、標示權限何時改變，並保留附帶署名資訊的 CLI 輸出。')}
          </p>
        </header>

        <section aria-labelledby="agent-prompts-heading">
          <div className="mb-5">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-text-mute">
              {localized(locale, 'Choose your goal', '選擇你的目標')}
            </p>
            <h2 id="agent-prompts-heading" className="mt-2 text-2xl font-semibold text-text">
              {localized(locale, 'Start with the outcome you need', '從你需要的成果開始')}
            </h2>
            <p className="mt-2 max-w-3xl text-sm text-text-2">
              {localized(locale, 'Customize one short kickoff prompt. Codex asks stage-specific follow-up questions instead of making you complete a technical form.', '自訂一段簡短的啟動提示。Codex 會依階段提出後續問題，不需要你先填完技術表單。')}
            </p>
            <p className="mt-2 max-w-3xl text-sm text-text-2">
              {locale === 'zh-TW' ? <>「複製啟動提示」只會複製請求，不會執行流程。貼到 Codex task 後，<code>$lpc-animation-asset-audit</code> 會執行唯讀稽核。你確認一項有界修訂後，<code>$lpc-asset-authoring</code> 會在同一個 Codex task 中繼續嚴格的本機製作工作階段。若任一 Skill 無法使用，請直接使用 CLI，並遵守相同的確認邊界。</> : <>Copy kickoff prompt only copies the request; it does not run the
              journey. After you paste it into a Codex task,{' '}
              <code>$lpc-animation-asset-audit</code> performs the read-only audit.
              Once you confirm one bounded revision, <code>$lpc-asset-authoring</code>{' '}
              continues in the same Codex task through a strict local authoring
              session. If either Skill is unavailable, use the CLI directly with
              the same confirmation boundaries.</>}
            </p>
            <p className="mt-2 max-w-3xl text-sm text-text-2">
              {locale === 'zh-TW' ? <>Agent 引導流程的預設終點仍是可供審查的預覽。另行授權的安裝成功後，請在同一個 Codex task 中回到 <code>$lpc-animation-asset-audit</code>，並沿用原本的 animation、type 與 body-type 範圍。檢查 <code>unsupported</code>、<code>missingFiles</code>、<code>blankFrames</code> 與 <code>errors</code>。Exit code zero 只代表稽核已執行，不代表修復已完成。</> : <>The default Agent-guided endpoint remains a review-ready preview.
              After a separately authorized installation succeeds, return in the
              same Codex task to <code>$lpc-animation-asset-audit</code> with the
              original animation, type, and body-type bounds. Inspect{' '}
              <code>unsupported</code>, <code>missingFiles</code>,{' '}
              <code>blankFrames</code>, and <code>errors</code>. Exit code zero
              only means the audit ran; it does not mean the remediation is
              closed.</>}
            </p>
          </div>
          <AgentPromptBuilders locale={locale} />
        </section>

        <details className="rounded-md border border-border bg-surface p-5">
          <summary className="cursor-pointer text-xl font-semibold text-text">
            {localized(locale, 'One-time setup for Codex', 'Codex 一次性設定')}
          </summary>
          <p className="mt-3 max-w-3xl text-sm text-text-2">
            {locale === 'zh-TW' ? <>舊使用者可跳過此區。新使用者需要 Node.js 22 或更新版本、相容的 CLI、marketplace，以及 plugin <code>0.3.0</code>。安裝後請建立新的 task。</> : <>Returning users can skip this section. New users need Node.js 22 or newer, a compatible CLI, the marketplace, and plugin <code>0.3.0</code>. Start a new task after installation.</>}
          </p>
          <ol className="mt-5 grid min-w-0 gap-4">
            {[
              "npm install -g '@lpc-toolkit/cli@>=0.2.0 <0.3.0'",
              'codex plugin marketplace add ochowei/lpc-toolkit-2026-1',
              'codex plugin add lpc-toolkit@lpc-toolkit',
            ].map((command, index) => (
              <li key={command} className="min-w-0 rounded-md border border-border bg-surface-2 p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-text-mute">{localized(locale, 'Step', '步驟')} {index + 1}</p>
                <CopyCode locale={locale} className="mt-3" children={command} />
              </li>
            ))}
          </ol>
          <p className="mt-4 text-sm text-text-2">
            {locale === 'zh-TW' ? <>Plugin 會檢查已安裝的 CLI 是否符合 <code>&gt;=0.2.0 &lt;0.3.0</code>，且絕不會靜默升級。<a className="underline hover:text-text" href={pluginReadmeUrl} target="_blank" rel="noreferrer">閱讀 plugin 詳細資訊</a>。</> : <>The plugin checks the installed CLI against <code>&gt;=0.2.0 &lt;0.3.0</code> and never upgrades it silently.{' '}
            <a className="underline hover:text-text" href={pluginReadmeUrl} target="_blank" rel="noreferrer">
              Read the plugin details
            </a>
            .</>}
          </p>
        </details>

        <section className="rounded-md border border-accent/40 bg-accent/10 p-5">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-text-mute">{localized(locale, 'Safety summary', '安全摘要')}</p>
          <h2 className="mt-2 text-xl font-semibold text-text">{localized(locale, 'You approve every authority change', '每次權限變更都由你核准')}</h2>
          <p className="mt-2 max-w-3xl text-sm text-text-2">
            {localized(locale, 'Catalog search and animation audit are read-only. Codex asks before source files change, before references or prompts leave the task, and before a provider is used. A review-ready preview is not a release or installation.', 'Catalog 搜尋與動畫稽核都是唯讀。Codex 會在變更來源檔、將參考資料或提示送出 task，以及使用 provider 之前詢問你。可供審查的預覽不等於發布或安裝。')}
          </p>
        </section>

        <details className="rounded-md border border-border bg-surface p-5">
          <summary className="cursor-pointer text-xl font-semibold text-text">
            {localized(locale, 'For integration developers: use the public CLI workflow', '整合開發者：使用公開 CLI 流程')}
          </summary>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-text-mute">
            {localized(locale, 'Connect through the CLI', '透過 CLI 連接')}
          </p>
          <h2 className="mt-2 text-2xl font-semibold text-text">
            {localized(locale, 'Agent integrations guide the handoff; the CLI validates it', 'Agent 整合負責引導交接；CLI 負責驗證')}
          </h2>
          <p className="mt-2 max-w-3xl text-sm text-text-2">
            {localized(locale, 'Use the public CLI interface with a provider description you explicitly supply. There is no built-in provider, remote registry, credential collection, hidden network call, or persistent browser authoring state. The integration checker reports missing required capabilities and whether the artist can continue without an external provider before any handoff.', '請使用公開 CLI 介面，並明確提供 provider 描述。系統沒有內建 provider、遠端 registry、憑證收集、隱藏網路呼叫或持久化瀏覽器製作狀態。整合檢查器會在任何交接之前，回報缺少的必要能力，以及創作者能否在沒有外部 provider 的情況下繼續。')}
          </p>
          <div className="mt-4 grid min-w-0 gap-3">
            <CopyCode locale={locale} children="lpc-toolkit agent integration check --manifest manifest.json --json" />
            <CopyCode locale={locale} children="lpc-toolkit asset authoring provider preflight --session <session-id> --contract-digest <sha256> --descriptor provider.json --json" />
          </div>
          <p className="mt-4 max-w-3xl text-sm text-text-2">
            {localized(locale, 'A confirmed handoff persists only a bounded invocation. A returned PNG is re-digested and staged as a session candidate; the existing import, validation, attributed preview, attribution, and human release gates still decide whether it can become pack source or a formal release. Provider identity is provenance evidence, not authorship, licensing, consent, or approval.', '經確認的交接只會保存一次有界呼叫。回傳的 PNG 會重新計算 digest，並暫存為工作階段候選成品；既有的 import、validation、attributed preview、attribution 與人工 release gate，仍決定它能否成為素材包來源或正式版本。Provider identity 是來源證據，不代表作者身分、授權、同意或核准。')}
          </p>
        </details>
      </div>
    </main>
  );
}
